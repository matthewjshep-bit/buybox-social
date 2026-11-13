import { createHash } from "node:crypto";
import { sql } from "./db";

// Someone's own photo, where they've added one: served by their page's id
// (app/people/[id]/photo), at an address that changes with the photo, so it
// can be kept as long as it lasts.
export const photoUrl = (visitorId: string, version: string | null | undefined) =>
  version ? `/people/${visitorId}/photo?v=${version}` : null;

// A photo's version: the first few characters of its hash, as the database's
// `left(md5(photo_data_url), 10)` gives them.
export const photoVersion = (dataUrl: string | null | undefined) =>
  dataUrl ? createHash("md5").update(dataUrl).digest("hex").slice(0, 10) : null;

// The photos of these pages' people, by page id, for those who have one.
export async function photosFor(visitorIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(visitorIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: string; v: string }[]>`
    select v.id, left(md5(a.photo_data_url), 10) as v
    from visitors v join accounts a on a.id = v.account_id
    where v.id in ${sql(ids)} and a.photo_data_url is not null`;
  return new Map(rows.map((row) => [row.id, photoUrl(row.id, row.v)!]));
}
