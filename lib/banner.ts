import { cache } from "react";
import { sql } from "./db";

// The band across the top of someone's profile, as they chose it: a drawn
// scene by name, "blank" (nothing), "image" (their own, at `image`), or ""
// for the scene picked for them.
export type BannerChoice = { style: string; image: string | null };

export const NO_BANNER: BannerChoice = { style: "", image: null };

// What a choice may be (also checked by the database).
export const BANNER_STYLE = /^(|blank|image|porch|hills|street|fence|scene[0-7])$/;

// Their own image's address, by their page's id: it changes with the image,
// so it can be kept as long as it lasts.
export const bannerUrl = (visitorId: string, version: string | null | undefined) =>
  version ? `/people/${visitorId}/banner?v=${version}` : null;

// The choice of whoever's page this is.
export const getBanner = cache(async (visitorId: string | null): Promise<BannerChoice> => {
  if (!visitorId || !/^[0-9a-f-]{36}$/.test(visitorId)) return NO_BANNER;
  const [row] = await sql<{ banner: string; v: string | null }[]>`
    select a.banner, left(md5(a.banner_data_url), 10) as v
    from visitors v join accounts a on a.id = v.account_id
    where v.id = ${visitorId}`;
  return row ? { style: row.banner, image: bannerUrl(visitorId, row.v) } : NO_BANNER;
});
