import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";

// Shared by private share threads and public listing pages.

export type ActionResult = { ok: true } | { ok: false; error: string };

export const fail = (error: string): ActionResult => ({ ok: false, error });

export const MAX_COMMENTS_PER_MINUTE = 10;

export const REACTION_VALUES = ["love", "maybe", "pass"] as const;

export const nameSchema = z
  .string()
  .transform((name) => name.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(40));

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  tag: z.enum(["like", "dislike"]).nullable(),
});

export const reactionSchema = z.enum(REACTION_VALUES).nullable();

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
