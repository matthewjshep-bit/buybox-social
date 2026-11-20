import sharp, { type OutputInfo, type ResizeOptions } from "sharp";
import { z } from "zod";
import { LISTING_PROBLEM, PHOTO_MOST_CHARS, type ListingField, type ListingInput } from "../own-listing-writes";
import { ApiError } from "./http";
import { safeRequest, SafeRequestError } from "./safe-request";

// What a tool sends for one of an agent's own listings (app/api/v1/listings):
// its facts, in the API's names, turned into what the Listings page's form
// would have sent (lib/own-listing-writes.ts checks and keeps both the same
// way); and its photos, by their address or as a data URL, made into the
// JPEG the Listings page's own photos are (no bigger than 1600 px along the
// long side, small enough to keep as a data URL).

// ---------------------------------------------------------------------------
// A listing's facts

// The API's name for each fact, and the form's.
const FIELD_NAMES = {
  address: "address",
  city: "city",
  state: "state",
  zip: "zip",
  price: "price",
  beds: "beds",
  baths: "baths",
  sqft: "sqft",
  description: "about",
  year_built: "yearBuilt",
  arv: "arv",
  rehab: "rehab",
} as const satisfies Record<string, ListingField>;

type ApiField = keyof typeof FIELD_NAMES;

const ALL_NAMES = [...Object.keys(FIELD_NAMES), "shown", "show_price_per_sqft", "status"];

// The API's name for a field the shared checks found wrong.
export function apiFieldName(field: ListingField): string {
  const found = (Object.keys(FIELD_NAMES) as ApiField[]).find((name) => FIELD_NAMES[name] === field);
  return found ?? field;
}

// A fact every listing has: text or a number ("$510,000" is fine, as in the
// form), never empty. What's wrong with it is said as the form says it.
const needed = (field: ListingField) =>
  z
    .union([z.string(), z.number()], { error: LISTING_PROBLEM[field] })
    .refine((value) => String(value).trim() !== "", { error: LISTING_PROBLEM[field] });

// One that may be left out: null (or empty) is none.
const optional = (field: ListingField) => z.union([z.string(), z.number(), z.null()], { error: LISTING_PROBLEM[field] });

// true or false, or the same as text (some tools only send text).
const yesNo = z
  .union([z.boolean(), z.enum(["true", "false"])], { error: "Use true or false." })
  .transform((value) => value === true || value === "true");

const status = z
  .string({ error: "Use “active” or “closed”." })
  .trim()
  .toLowerCase()
  .pipe(z.enum(["active", "closed"], { error: "Use “active” or “closed”." }));

// A field we don't have is turned away rather than passed over, so a name
// spelled wrong ("bedrooms", "yearBuilt") is found out at once, not by a
// listing that quietly lacks it.
const onlyKnown = (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
  for (const name of Object.keys(value)) {
    if (!ALL_NAMES.includes(name)) {
      ctx.addIssue({
        code: "custom",
        path: [name],
        message: `A listing has no “${name.slice(0, 40)}”. Use ${ALL_NAMES.join(", ")}.`,
      });
    }
  }
};

const notAnObject = { error: "Send the listing as a JSON object." };

// A new listing: everything every listing has, and what else is given.
export const newListingSchema = z
  .looseObject(
    {
      address: needed("address"),
      city: needed("city"),
      state: needed("state"),
      zip: needed("zip"),
      price: needed("price"),
      beds: needed("beds"),
      baths: needed("baths"),
      sqft: needed("sqft"),
      description: optional("about").optional(),
      year_built: optional("yearBuilt").optional(),
      arv: optional("arv").optional(),
      rehab: optional("rehab").optional(),
      shown: yesNo.optional(),
      show_price_per_sqft: yesNo.optional(),
      status: status.optional(),
    },
    notAnObject,
  )
  .superRefine(onlyKnown);

// A change to one: only what's given changes.
export const listingChangeSchema = z
  .looseObject(
    {
      address: needed("address").optional(),
      city: needed("city").optional(),
      state: needed("state").optional(),
      zip: needed("zip").optional(),
      price: needed("price").optional(),
      beds: needed("beds").optional(),
      baths: needed("baths").optional(),
      sqft: needed("sqft").optional(),
      description: optional("about").optional(),
      year_built: optional("yearBuilt").optional(),
      arv: optional("arv").optional(),
      rehab: optional("rehab").optional(),
      shown: yesNo.optional(),
      show_price_per_sqft: yesNo.optional(),
      status: status.optional(),
    },
    notAnObject,
  )
  .superRefine(onlyKnown);

type ListingBody = z.infer<typeof listingChangeSchema>;

// What was sent, in the form's names, leaving out anything not sent.
export function listingInputFrom(body: ListingBody): Partial<ListingInput> {
  const input: Partial<ListingInput> = {};
  for (const name of Object.keys(FIELD_NAMES) as ApiField[]) {
    const value = body[name];
    if (value !== undefined) input[FIELD_NAMES[name]] = value as string | number | null;
  }
  if (body.shown !== undefined) input.shown = body.shown;
  if (body.show_price_per_sqft !== undefined) input.perSqft = body.show_price_per_sqft;
  if (body.status !== undefined) input.closed = body.status === "closed";
  return input;
}

// A new listing's input, whole: what wasn't sent is what the form starts
// with (no description or extras, on their profile, price per square foot
// shown, available).
export function newListingInput(body: z.infer<typeof newListingSchema>): ListingInput {
  return {
    address: "",
    city: "",
    state: "",
    zip: "",
    price: "",
    beds: "",
    baths: "",
    sqft: "",
    about: "",
    yearBuilt: null,
    arv: null,
    rehab: null,
    shown: true,
    perSqft: true,
    closed: false,
    ...listingInputFrom(body),
  };
}

// ---------------------------------------------------------------------------
// A listing's photos

// The most fetched from an address, and how long it may take.
export const PHOTO_FETCH_MOST_BYTES = 10 * 1024 * 1024;
const PHOTO_FETCH_MS = 10_000;
// The longest side a photo is kept at (the Listings page's own, too).
export const PHOTO_LONG_SIDE = 1600;
// No image with more pixels than this is opened at all: enough for any
// camera's photo, not enough for a small file that opens up into gigabytes.
const MOST_PIXELS = 64_000_000;
// The JPEG quality a photo is kept at, and the least it's let go down to
// before it's made smaller instead.
const QUALITY = 82;
const QUALITY_LEAST = 50;

const JPEG_PREFIX = "data:image/jpeg;base64,";

// What's taken from an address (by what the image turns out to be, not what
// the address or its server says it is), and what's taken as a data URL.
const FROM_URL = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);
const FROM_DATA = new Set(["jpeg", "png", "webp"]);
const DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type PreparedPhoto = { dataUrl: string; width: number; height: number };

// A photo is sent one way or the other: { "url": "https://…" } or
// { "data": "data:image/jpeg;base64,…" }.
export const photoSchema = z.union(
  [
    z.strictObject({ url: z.string().trim().min(1).max(2000) }),
    z.strictObject({ data: z.string().min(1) }),
  ],
  { error: "Send either “url” (the photo's https address) or “data” (a data:image/jpeg;base64,… URL), not both." },
);

const wrong = (field: "url" | "data", message: string) => new ApiError(400, "invalid_request", message, field);

// The photo at an address: https only, fetched by our server in a way that
// can't be pointed at anything private (lib/api/safe-request.ts), within ten
// seconds and ten megabytes, and only a photo that's really there (a
// redirect isn't followed: the tool should send where it ends up).
export async function fetchPhoto(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw wrong("url", "That isn't a web address. It should start with https://");
  }
  if (parsed.protocol !== "https:") throw wrong("url", "The photo's address must start with https://");
  let answer;
  try {
    answer = await safeRequest(parsed.toString(), {
      headers: { Accept: "image/jpeg, image/png, image/webp, image/*;q=0.8", "User-Agent": "Porchcard-Photos/1" },
      timeoutMs: PHOTO_FETCH_MS,
      maxBytes: PHOTO_FETCH_MOST_BYTES,
    });
  } catch (error) {
    if (error instanceof SafeRequestError) {
      if (error.code === "too_large") throw wrong("url", "That photo is more than 10 MB. Send a smaller one.");
      if (error.code === "timeout") throw wrong("url", "The photo's address didn't answer within 10 seconds.");
      if (error.code === "blocked") throw wrong("url", error.message);
      throw wrong("url", "We couldn't get the photo from that address.");
    }
    throw error;
  }
  if (answer.status >= 300 && answer.status < 400) {
    throw wrong("url", "That address sends us somewhere else. Use the photo's own address.");
  }
  if (answer.status < 200 || answer.status >= 300) {
    throw wrong("url", `We couldn't get the photo from that address (it answered ${answer.status}).`);
  }
  if (answer.body.length === 0) throw wrong("url", "There's no photo at that address.");
  return answer.body;
}

// The bytes in a data URL: a JPEG, PNG or WebP, as base64.
export function photoFromDataUrl(dataUrl: string): Buffer {
  const match = DATA_URL.exec(dataUrl.trim());
  if (!match) {
    throw wrong("data", "Send the photo as a data URL: data:image/jpeg;base64,… (or png, or webp).");
  }
  return Buffer.from(match[2], "base64");
}

// A data URL's length for so many bytes of JPEG.
const dataUrlLength = (bytes: number) => JPEG_PREFIX.length + Math.ceil(bytes / 3) * 4;

// Plain pixels' shape, for reading them back in.
const rawOf = (info: OutputInfo) => ({
  width: info.width,
  height: info.height,
  channels: info.channels as 1 | 2 | 3 | 4,
});

// An image, decoded once into plain pixels: checked to be a kind we take
// (by what it turns out to be, not what it says it is), turned the way the
// camera held it, anything see-through laid on white, sized as `resize`
// says, and nothing of the original file kept (not where it was taken, nor
// the camera). `field` is what was sent ("url" or "data"), for what's
// wrong with it.
export async function photoPixels(
  input: Buffer,
  field: "url" | "data",
  resize: ResizeOptions,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const allowed = field === "data" ? FROM_DATA : FROM_URL;
  const unreadable = () =>
    wrong(
      field,
      field === "data"
        ? "We couldn't read that photo. Send a JPEG, PNG or WebP."
        : "We couldn't read a photo at that address. Use a JPEG, PNG or WebP.",
    );
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: MOST_PIXELS });
    const { format, compression } = await image.metadata();
    if (!format || !allowed.has(format)) throw unreadable();
    // (An AVIF says "heif" too, made with av1. An iPhone's HEIC, made with
    // hevc, can't be read here.)
    if (format === "heif" && compression !== "av1") throw wrong(field, "We can't read HEIC photos. Send a JPEG.");
    return await image
      .autoOrient()
      .flatten({ background: "#ffffff" })
      .resize(resize)
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // (Too many pixels, a broken file, or not an image at all.)
    const message = error instanceof Error ? error.message : "";
    if (/pixel limit/i.test(message)) throw wrong(field, "That photo is too big to open. Send one under 64 megapixels.");
    throw unreadable();
  }
}

// Pixels as a JPEG data URL no longer than `mostChars`: at `quality`, a
// little lower if that still isn't small enough, and (rarely: a very busy
// image that no quality made small enough) a little smaller each time.
export async function jpegWithin(
  pixels: { data: Buffer; info: OutputInfo },
  mostChars: number,
  field: "url" | "data",
  quality = QUALITY,
): Promise<PreparedPhoto> {
  for (const scale of [1, 0.8, 0.6]) {
    const sized =
      scale === 1
        ? pixels
        : await sharp(pixels.data, { raw: rawOf(pixels.info) })
            .resize({
              width: Math.max(1, Math.round(pixels.info.width * scale)),
              height: Math.max(1, Math.round(pixels.info.height * scale)),
              fit: "fill",
            })
            .raw()
            .toBuffer({ resolveWithObject: true });
    for (let q = quality; q >= QUALITY_LEAST; q -= 8) {
      const jpeg = await sharp(sized.data, { raw: rawOf(sized.info) }).jpeg({ quality: q }).toBuffer();
      if (dataUrlLength(jpeg.length) <= mostChars) {
        return { dataUrl: `${JPEG_PREFIX}${jpeg.toString("base64")}`, width: sized.info.width, height: sized.info.height };
      }
    }
  }
  throw wrong(field, "We couldn't make that photo small enough to keep. Try a smaller one.");
}

// An image made into a listing's photo: no more than 1600 px along its long
// side (never enlarged), a JPEG at quality 82, made smaller if it must be,
// to keep as a data URL.
export async function preparePhoto(input: Buffer, field: "url" | "data"): Promise<PreparedPhoto> {
  const pixels = await photoPixels(input, field, {
    width: PHOTO_LONG_SIDE,
    height: PHOTO_LONG_SIDE,
    fit: "inside",
    withoutEnlargement: true,
  });
  return jpegWithin(pixels, PHOTO_MOST_CHARS, field);
}

// What was sent, as its bytes, and which way it came.
export async function photoBytes(body: z.infer<typeof photoSchema>): Promise<{ input: Buffer; field: "url" | "data" }> {
  if ("url" in body) return { input: await fetchPhoto(body.url), field: "url" };
  return { input: photoFromDataUrl(body.data), field: "data" };
}

// What was sent, as the photo that's kept.
export async function photoFrom(body: z.infer<typeof photoSchema>): Promise<PreparedPhoto> {
  const { input, field } = await photoBytes(body);
  return preparePhoto(input, field);
}
