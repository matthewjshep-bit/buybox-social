import { sql } from "./db";
import { escapeLike } from "./format";
import { findOnRepliers } from "./listings/repliers";
import type { Listing } from "./listings/types";
import { getCopiedKeys } from "./own-listings";
import { matchesPlace } from "./search";

// The homes an agent can send, for what they've typed (an address, a city, a
// ZIP, an MLS number; nothing: the newest): homes for sale, with their own
// listings among them and nobody else's; never one already on the link, nor
// an MLS listing they've made their own copy of (the copy is the one to
// send). Ones that start with what was typed come first. With few found
// here, homes found by that address elsewhere follow: one of those is
// brought in when it goes on a link.
export async function homesToSend(
  agentId: string,
  query: string,
  { onLink = [], limit = 24 }: { onLink?: string[]; limit?: number } = {},
): Promise<Listing[]> {
  const text = query.trim().slice(0, 100);
  const copied = await getCopiedKeys(agentId);
  const skip = [...onLink, ...copied];
  const rows = await sql<{ data: Listing }[]>`
    select l.data from listings l
    where l.standard_status = 'Active'
      and (l.owner_account_id is null or l.owner_account_id = ${agentId})
      and l.listing_key not in ${sql(skip.length ? skip : [""])}
      and ${matchesPlace(text)}
    order by (l.data->>'UnparsedAddress' ilike ${`${escapeLike(text)}%`}) desc, l.updated_at desc, l.listing_key
    limit ${limit}`;
  const here = rows.map((row) => row.data);
  const known = new Set([...here.map((home) => home.ListingKey), ...skip]);
  const elsewhere = text && here.length < 6 ? (await findOnRepliers(text)).filter((home) => !known.has(home.ListingKey)) : [];
  return [...here, ...elsewhere].slice(0, limit);
}
