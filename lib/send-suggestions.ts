import { sql } from "./db";
import type { Listing } from "./listings/types";
import { photosOf } from "./own-listings";
import { popularKeys } from "./popular";
import { homesToOffer } from "./send-search";

// Send homes never opens on an empty page: under the box, before anything's
// typed, there are always homes to pick. Their own first (homesToOffer: their
// listings or deals, then homes they've liked, saved or sent), then more:
// homes near where they said they are, what's popular this week, then the
// newest. Only homes a search on that page would find too (for sale, from
// the MLS, never an MLS listing they've made their own copy of), each once.

// How many homes, all told, the page offers before anything's typed.
const OFFERED = 16;
// Of the more, at most this many near them and popular, so each gets a look in.
const NEAR_MOST = 8;
const POPULAR_MOST = 6;

export type SendOffer = { mine: Listing[]; touched: Listing[]; more: Listing[] };

export async function sendHomesOffer(
  account: { id: string; full_name: string; role?: string | null },
  visitorId: string,
  { onLink = [] }: { onLink?: string[] } = {},
): Promise<SendOffer> {
  // Side by side, so the page waits for the slower of the two, not both.
  const [offer, more] = await Promise.all([
    homesToOffer(account, visitorId, { onLink }),
    // (Enough over, that some can be theirs already and it still fills up.)
    popularKeys("week", 20).then((popular) => moreHomes(account.id, popular, onLink, OFFERED * 2)),
  ]);
  const seen = new Set([...offer.mine, ...offer.touched].map((home) => home.ListingKey));
  const room = Math.max(8, OFFERED - seen.size);
  return { ...offer, more: more.filter((home) => !seen.has(home.ListingKey)).slice(0, room) };
}

// Homes for sale near them (their city, then their state), popular this week
// (`popular`, in order), then the newest: one query. Each home once, in that
// order. Just the first photo of each, which is all a row shows.
async function moreHomes(accountId: string, popular: string[], skip: string[], limit: number): Promise<Listing[]> {
  // The ranking carries only each home's key and where it ranks, so however
  // many homes are for sale, the whole of a home (its photos and the rest) is
  // read for the few that are kept.
  const rows = await sql<{ data: Listing; bucket: number; pos: number }[]>`
    with me as (
      select
        coalesce((select location_city from accounts where id = ${accountId}), '') as city,
        coalesce((select location_state from accounts where id = ${accountId}), '') as state
    ),
    pool as (
      select l.listing_key, l.updated_at,
        case
          when me.city <> '' and lower(l.data->>'City') = lower(me.city)
            and upper(l.data->>'StateOrProvince') = upper(me.state) then 0
          when me.state <> '' and upper(l.data->>'StateOrProvince') = upper(me.state) then 1
        end as near,
        array_position(${popular.length ? popular : [""]}::text[], l.listing_key) as hot
      from listings l cross join me
      -- (As a search on Send homes finds them: for sale, nobody's own listing.)
      where l.standard_status = 'Active' and l.owner_account_id is null
        and jsonb_array_length(coalesce(l.data->'Media', '[]'::jsonb)) > 0
        and l.listing_key not in ${sql(skip.length ? skip : [""])}
        and l.listing_key not in (
          select data->>'CopiedFrom' from listings
          where owner_account_id = ${accountId} and data->>'CopiedFrom' is not null)
    ),
    kept as (
      (select listing_key, 0 as bucket, row_number() over (order by near, updated_at desc, listing_key)::int as pos
        from pool where near is not null order by near, updated_at desc, listing_key limit ${NEAR_MOST})
      union all
      (select listing_key, 1, hot from pool where hot is not null order by hot limit ${POPULAR_MOST})
      union all
      (select listing_key, 2, row_number() over (order by updated_at desc, listing_key)::int
        from pool order by updated_at desc, listing_key limit ${limit})
    )
    select l.data, kept.bucket, kept.pos from kept join listings l on l.listing_key = kept.listing_key`;
  rows.sort((a, b) => a.bucket - b.bucket || a.pos - b.pos);
  const seen = new Set<string>();
  return rows
    .filter(({ data }) => !seen.has(data.ListingKey) && Boolean(seen.add(data.ListingKey)))
    .slice(0, limit)
    .map(({ data }) => {
      const photo = photosOf({ ...data, Media: [...data.Media].sort((a, b) => a.Order - b.Order) })[0];
      return { ...data, Media: photo ? [photo] : [] };
    })
    .filter((home) => home.Media.length > 0);
}
