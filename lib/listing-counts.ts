import { sql } from "./db";
import { linkWho } from "./link-public";
import { OWN_PREFIX } from "./own-listings";

export type ListingCounts = Map<string, { likes: number; comments: number }>;

// How many people liked each home (it, or anything in its photos, each person
// once, as the feed counts them) and how many public comments it has. Numbers
// only: nothing of who, and nothing said on an agent's link.
//
// An agent's own copy of an MLS listing stands in for the original on their
// profile, while everyone browsing meets the original. So the copy's numbers
// are the two together, under the copy's key (someone who liked both, once):
// its tile on the profile agrees with what Browse shows.
export async function getListingCounts(keys: string[]): Promise<ListingCounts> {
  const counts: ListingCounts = new Map();
  if (keys.length === 0) return counts;
  const own = keys.filter((key) => key.startsWith(OWN_PREFIX));
  // Which homes count towards which tile: each its own, and a copy's original too.
  const counted = () => sql`
    select k as tile, k as listing_key from unnest(${keys}::text[]) k
    union
    select listing_key, data->>'CopiedFrom' from listings
    where listing_key in ${sql(own.length ? own : [""])} and data->>'CopiedFrom' is not null`;
  const [likes, comments] = await Promise.all([
    sql<{ tile: string; n: number }[]>`
      with counted as (${counted()})
      select tile, count(*)::int as n from (
        select c.tile, 'v' || r.visitor_id as who from public_reactions r join counted c using (listing_key)
        where r.reaction = 'like'
        union
        -- (Someone on a link by their account counts as their public self.)
        select c.tile, ${linkWho("r")} from reactions r join counted c using (listing_key)
        where r.reaction = 'like'
        union
        select c.tile, 'v' || l.visitor_id from public_photo_likes l join counted c using (listing_key)
        union
        select c.tile, ${linkWho("l")} from photo_likes l join counted c using (listing_key)) x
      group by tile`,
    sql<{ tile: string; n: number }[]>`
      with counted as (${counted()})
      select c.tile, count(*)::int as n from public_comments pc join counted c using (listing_key)
      group by c.tile`,
  ]);
  for (const key of keys) counts.set(key, { likes: 0, comments: 0 });
  for (const row of likes) counts.get(row.tile)!.likes = row.n;
  for (const row of comments) counts.get(row.tile)!.comments = row.n;
  return counts;
}
