// The photo scan: one look at one listing photo, for the room it shows and
// everything in it, each with a box around it. A tap on the photo is then
// named by the smallest box it falls in (lib/photos.ts): "the kitchen island",
// not "this spot".
import sharp from "sharp";
import { z } from "zod";

// Counted up when the instructions or the shape change, so old scans can be
// found and done again.
export const SCAN_VERSION = 1;
// Opus by default, for the most careful boxes; a smaller model costs far less
// per photo and can be set here once its boxes have been checked.
const SCAN_MODEL = process.env.PHOTO_SCAN_MODEL || "claude-opus-5-5";
const TIMEOUT_MS = 90_000;
// The long edge sent to the model: more than this is scaled down by it anyway.
const LONG_EDGE = 1568;
const MOST_ELEMENTS = 40;
const MOST_NOTABLE = 6;

// What a thing in a photo counts toward in someone's taste (lib/reactions.ts).
const SCAN_ASPECTS = ["kitchen", "bathrooms", "exterior", "yard", "light", "layout", "aesthetic"] as const;

const ScanSchema = z.object({
  room: z.string(),
  description: z.string(),
  elements: z.array(
    z.object({
      label: z.string(),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      notable: z.boolean(),
      aspect: z.enum([...SCAN_ASPECTS, "none"]),
    }),
  ),
});

export type ScanElement = {
  label: string;
  // The box: its top left corner and size, as fractions of the photo.
  x: number;
  y: number;
  w: number;
  h: number;
  notable: boolean;
  aspect: (typeof SCAN_ASPECTS)[number] | null;
};
export type PhotoScan = { room: string; description: string; elements: ScanElement[] };
export type Scanned =
  | { ok: true; scan: PhotoScan; width: number; height: number; model: string }
  // `final`: trying again won't help (a refusal, a photo that can't be read).
  | { ok: false; reason: string; final: boolean };
export type Scanner = (url: string) => Promise<Scanned>;

const SYSTEM = `You label real-estate listing photos for a home-search app. Buyers tap any spot in a photo to like it or comment on it. The app finds the smallest of your boxes that contains the tap and uses its label in sentences such as "Maya likes the kitchen island" or "Sam commented on the front door". Your labels and boxes are the only way the app knows what was tapped, so cover the photo thoroughly and place boxes carefully.

room: what the photo shows, in one to three words: "Kitchen", "Primary bedroom", "Exterior", "Backyard", "Aerial view", "Floor plan".

description: one plain sentence describing the photo, for people who can't see it.

elements: everything in the photo a buyer might tap.
- Include fixtures, appliances, cabinetry, counters, furniture, lighting, windows, doors, fireplaces, stairs, architectural details, and outdoor features such as porches, decks, garages, fences, trees and views.
- Also include the large surfaces (floor, walls, ceiling, sky, lawn, driveway, roof), so that a tap almost anywhere lands in at least one box. Boxes may overlap and nest: the app picks the smallest.
- label: one to four words, capitalised like "Kitchen island", that reads naturally after "the". Be concrete, and include the material, colour or style when it is clearly visible and worth knowing: "Hardwood floor", "White shaker cabinets", "Stone fireplace". Each label must be unique within the photo: when two things are alike, tell them apart by where they are ("Left window", "Window over sink").
- x1, y1, x2, y2: a tight box around the thing, as whole numbers from 0 to 1000, where (x1, y1) is the top left corner and (x2, y2) the bottom right, measured across the photo's width and down its height.
- notable: true for at most ${MOST_NOTABLE} things, the features a buyer would care most about. Never true for plain surfaces.
- aspect: the one it belongs to. kitchen: anything in a kitchen. bathrooms: anything in a bathroom. exterior: the outside of the building. yard: land, landscaping and outdoor living space. light: windows, skylights and glass doors. layout: stairs, hallways, openings between rooms. aesthetic: finishes, furniture and decor elsewhere. Otherwise none.

Label things, never people. Don't label or describe people, pets, family photographs, documents, screens' contents, or text and watermarks laid over the photo, and don't guess at who lives in the home. For a floor plan, map or other image that isn't a photograph of the property, give the room and description and leave elements empty.`;

const clamp = (v: number) => Math.min(1000, Math.max(0, v)) / 1000;
const round = (v: number) => Math.round(v * 1000) / 1000;

// The model's answer, tidied: boxes inside the photo and a real size, labels
// that can be a tag (short, unique, and not a spot's "@x,y").
export function tidyScan(raw: z.infer<typeof ScanSchema>): PhotoScan {
  const used = new Set<string>();
  let notable = 0;
  const elements = raw.elements.flatMap((e): ScanElement[] => {
    const [x1, x2] = [clamp(e.x1), clamp(e.x2)].sort((a, b) => a - b);
    const [y1, y2] = [clamp(e.y1), clamp(e.y2)].sort((a, b) => a - b);
    const base = e.label.replace(/\s+/g, " ").replace(/^@+/, "").trim().slice(0, 50);
    if (!base || x2 - x1 < 0.005 || y2 - y1 < 0.005) return [];
    let label = base.charAt(0).toUpperCase() + base.slice(1);
    for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base.charAt(0).toUpperCase() + base.slice(1)} ${n}`;
    used.add(label.toLowerCase());
    return [
      {
        label,
        x: round(x1),
        y: round(y1),
        w: round(x2 - x1),
        h: round(y2 - y1),
        notable: e.notable && ++notable <= MOST_NOTABLE,
        aspect: e.aspect === "none" ? null : e.aspect,
      },
    ];
  });
  return {
    room: raw.room.replace(/\s+/g, " ").trim().slice(0, 40),
    description: raw.description.replace(/\s+/g, " ").trim().slice(0, 300),
    elements: elements.slice(0, MOST_ELEMENTS),
  };
}

// A photo's bytes, ready to send: upright, a JPEG, no bigger than needed.
async function loadPhoto(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`photo answered ${response.status}`);
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data: data.toString("base64"), width: info.width, height: info.height };
}

// A photo's size alone, from a small copy of it.
export async function photoSize(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return null;
    const { width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

// Scans one photo, once, with a time limit.
export const scanPhoto: Scanner = async (url) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no key", final: false };
  let photo: Awaited<ReturnType<typeof loadPhoto>>;
  try {
    photo = await loadPhoto(url);
  } catch (error) {
    return { ok: false, reason: `photo: ${error instanceof Error ? error.message : "unreadable"}`, final: false };
  }
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([
    import("@anthropic-ai/sdk"),
    import("@anthropic-ai/sdk/helpers/beta/zod"),
  ]);
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });
  try {
    const response = await client.beta.messages.create(
      {
        model: SCAN_MODEL,
        max_tokens: 16000,
        // A decline is tried again on the model Anthropic picks for it.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(ScanSchema) },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: photo.data } },
              { type: "text", text: "Label this listing photo." },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (response.stop_reason === "refusal") return { ok: false, reason: "refusal", final: true };
    if (response.stop_reason !== "end_turn") return { ok: false, reason: `stopped: ${response.stop_reason}`, final: true };
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const parsed = ScanSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, reason: "not the shape asked for", final: true };
    return { ok: true, scan: tidyScan(parsed.data), width: photo.width, height: photo.height, model: response.model };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, reason: "not json", final: true };
    // Our own mistake won't fix itself; anything else (busy, slow, offline) might.
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    const final = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : "failed", final };
  }
};
