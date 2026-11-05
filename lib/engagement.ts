import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { isTagIn } from "./photos";
import { getListingPhoto } from "./public";
import { ASPECT_IDS, type Aspect } from "./reactions";

// Shared by private share threads and public listing pages.

export type ActionResult = { ok: true } | { ok: false; error: string };

export const fail = (error: string): ActionResult => ({ ok: false, error });

export const MAX_COMMENTS_PER_MINUTE = 10;


export const nameSchema = z
  .string()
  .transform((name) => name.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(40));

export const commentSchema = z.string().trim().min(1).max(1000);

const aspects = z.array(z.enum(ASPECT_IDS as [Aspect, ...Aspect[]])).max(ASPECT_IDS.length);

export const reactionSchema = z
  .object({ reaction: z.enum(["like", "dislike"]).nullable(), liked: aspects, disliked: aspects })
  .transform((r) => ({ ...r, liked: [...new Set(r.liked)], disliked: [...new Set(r.disliked)] }))
  .refine((r) => !r.liked.some((a) => r.disliked.includes(a)))
  .refine((r) => r.reaction !== null || (r.liked.length === 0 && r.disliked.length === 0));

// Identifies this browser, so people can react and comment without an account.
const DEVICE_COOKIE = "bb_device";

export const readDevice = async () => (await cookies()).get(DEVICE_COOKIE)?.value;

// Only callable from Server Actions, which are the only place cookies can be set.
export async function ensureDevice() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(DEVICE_COOKIE)?.value;
  // Setting a cookie in a Server Action re-renders the page, so only set it once.
  if (existing) return existing;
  const device = randomBytes(24).toString("base64url");
  const proto = (await headers()).get("x-forwarded-proto");
  cookieStore.set(DEVICE_COOKIE, device, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return device;
}

// A like on something in a photo: which photo, and which of its tags.
export const photoLikeSchema = z.object({
  listingKey: z.string().min(1).max(100),
  mediaKey: z.string().min(1).max(500),
  tag: z.string().min(1).max(60),
  liked: z.boolean(),
});

// A comment about one spot in one photo, as sent from the page.
const anchorSchema = z.object({ mediaKey: z.string().min(1).max(500), tag: z.string().min(1).max(60) });
export type SpotAnchor = z.infer<typeof anchorSchema>;

// The anchor, if it names a real photo of this home and a spot in it. `false`
// when one was sent but doesn't hold up; null when there wasn't one.
export async function checkAnchor(listingKey: string, anchor: unknown): Promise<SpotAnchor | null | false> {
  if (anchor === null || anchor === undefined) return null;
  const parsed = anchorSchema.safeParse(anchor);
  if (!parsed.success) return false;
  const photo = await getListingPhoto(listingKey, parsed.data.mediaKey);
  return photo && isTagIn(photo, parsed.data.tag) ? parsed.data : false;
}
