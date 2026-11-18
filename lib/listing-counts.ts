import { sql } from "./db";

export type ListingCounts = Map<string, { likes: number; comments: number }>;

// How many people liked each home (it, or anything in its photos, each person
// once, as the feed counts them) and how many public comments it has. Numbers
// only: nothing of who, and nothing said on an agent's link.
export async function getListingCounts(keys: string[]): Promise<ListingCounts> {
  const counts: ListingCounts = new Map();
  if (keys.length === 0) return counts;
  const [likes, comments] = await Promise.all([
    sql<{ listing_key: string; n: number }[]>`
      select listing_key, count(*)::int as n from (
        select listing_key, 'v' || visitor_id as who from public_reactions
        where reaction = 'like' and listing_key in ${sql(keys)}
        union
        select listing_key, 'p' || participant_id from reactions
        where reaction = 'like' and listing_key in ${sql(keys)}
        union
        select listing_key, 'v' || visitor_id from public_photo_likes where listing_key in ${sql(keys)}
        union
        select listing_key, 'p' || participant_id from photo_likes where listing_key in ${sql(keys)}) x
      group by listing_key`,
    sql<{ listing_key: string; n: number }[]>`
      select listing_key, count(*)::int as n from public_comments
      where listing_key in ${sql(keys)} group by listing_key`,
  ]);
  for (const key of keys) counts.set(key, { likes: 0, comments: 0 });
  for (const row of likes) counts.get(row.listing_key)!.likes = row.n;
  for (const row of comments) counts.get(row.listing_key)!.comments = row.n;
  return counts;
}
