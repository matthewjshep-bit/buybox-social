import { headers } from "next/headers";
import { appUrl } from "@/lib/format";

// Porchcard's own addresses. www.porchcard.com is the main one (porchcard.com
// forwards there), and the old buybox-social.vercel.app forwards there too
// (next.config.ts).
export const MAIN_HOST = "www.porchcard.com";
const OWN = new Set(["porchcard.com", MAIN_HOST]);

// The address someone is on right now, when it's one of the site's own, for a
// link that should bring them back to it (the sign-in email's): signed in at
// one address, they aren't at another. Anything else is the main address.
export async function siteOrigin() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const name = host.replace(/:\d+$/, "");
  const main = new URL(appUrl());
  const local = name === "localhost" || name === "127.0.0.1";
  if (!host || !(OWN.has(name) || name === main.hostname || local)) return main.origin;
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${proto}://${host}`;
}
