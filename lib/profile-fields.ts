import { z } from "zod";
import { listedAgentNames, MLS_ID, sameAgent } from "./agent-listings";
import { isContactPhone, phoneDigits } from "./contact";
import { BRAND_COLORS } from "./format";

// What a profile may say, and how each part of it is checked: shared by the
// pages where people change their own (app/dashboard/actions.ts saveProfile,
// app/people/[id]/actions.ts) and the owner's admin API
// (lib/api/admin-accounts.ts), so an account is kept the same way whichever
// one changed it. Plain rules: nothing here knows who's signed in.

// An agent's whole name and brokerage, as Your details takes them.
export const AGENT_NAME_MOST = 80;
export const BROKERAGE_MOST = 80;

// A buyer's own name: everyone else only ever sees the first of it, and an
// email typed here by mistake would show whole.
export const BUYER_NAME_MOST = 60;

// Someone's photo and banner, each a JPEG kept as a data URL: the photo a
// small square, the banner a wide band, with the image it was framed from.
export const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
export const PROFILE_PHOTO_MOST_CHARS = 200_000;
export const BANNER_IMAGE_MOST_CHARS = 600_000;
export const BANNER_SOURCE_MOST_CHARS = 900_000;

// A colour an agent's brand may be: one of the few the site offers.
export const isBrandColor = (value: unknown): value is string =>
  typeof value === "string" && BRAND_COLORS.some((c) => c.value === value);

// A phone for clients: empty, or a real number with its area code. Kept as
// digits only, so the text and call links on a link are built from nothing else.
export const contactPhoneSchema = z
  .string()
  .max(30)
  .regex(/^[\d\s().+-]*$/)
  .transform(phoneDigits)
  .refine((digits) => digits === "" || isContactPhone(digits));

export const contactEmailSchema = z.union([z.literal(""), z.email().max(254)]);

// What you say about yourself at the top of your page, and (an agent) a few
// links: each http(s), a bare address taken as https.
export const BIO_MOST = 300;
export const LINKS_MOST = 5;
export const aboutLink = z.object({
  label: z.string().trim().max(40),
  url: z.string().trim().min(1).max(300),
});

export function linkUrl(raw: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// What's wrong with an MLS ID for an agent of this name, or null when it's
// fine: empty, or letters, numbers and dashes. An MLS ID is public, so it's
// theirs only when its listings are under their name. (One no listing has
// yet is kept; its listings show once they are under their name too.)
export async function mlsAgentIdProblem(mlsAgentId: string, fullName: string): Promise<string | null> {
  if (!mlsAgentId) return null;
  if (!MLS_ID.test(mlsAgentId)) return "Letters, numbers and dashes only, or leave it empty.";
  const listed = await listedAgentNames(mlsAgentId);
  if (listed.length > 0 && !listed.some((name) => sameAgent(fullName, name))) {
    return "That MLS ID is listed under another name.";
  }
  return null;
}

// A database error for a row that's already there (someone added twice at
// once, or an MLS ID already on another profile).
export const isDuplicate = (error: unknown) => (error as { code?: string } | null)?.code === "23505";
