import { getAgentListings } from "./agent-listings";
import { sql } from "./db";
import { findOnRepliers } from "./listings/repliers";
import type { Listing } from "./listings/types";
import { getCopiedKeys } from "./own-listings";
import { matchesPlace, startsWithPlace } from "./search";

// Homes for sale already here, found by what's typed (an address, a city, a
// ZIP, an MLS number, or several of them; nothing: the newest). Of the
// listings people added themselves, only the viewer's own; never one in
// `skip`. Ones that start with what was typed come first. Send homes, Post
// and Add a listing all look here, so they find the same homes.
export async function homesHere(
  text: string,
  viewerId: string | null,
  skip: string[],
  limit: number,
): Promise<Listing[]> {
  const rows = await sql<{ data: Listing }[]>`
    select l.data from listings l
    where l.standard_status = 'Active'
      and (l.owner_account_id is null or l.owner_account_id = ${viewerId}::uuid)
      and l.listing_key not in ${sql(skip.length ? skip : [""])}
      and ${matchesPlace(text)}
    order by (${startsWithPlace(text)}) desc, l.updated_at desc, l.listing_key
    limit ${limit}`;
  return rows.map((row) => row.data);
}

// The homes an agent can send, for what they've typed (an address, a city, a
// ZIP, an MLS number; nothing: the newest): homes for sale, with their own
// listings among them and nobody else's; never one already on the link, nor
// an MLS listing they've made their own copy of (the copy is the one to
// send). With few found here, homes found by that address elsewhere follow:
// one of those is brought in when it goes on a link.
export async function homesToSend(
  agentId: string,
  query: string,
  { onLink = [], limit = 24 }: { onLink?: string[]; limit?: number } = {},
): Promise<Listing[]> {
  const text = query.trim().slice(0, 100);
  const copied = await getCopiedKeys(agentId);
  const skip = [...onLink, ...copied];
  const here = await homesHere(text, agentId, skip, limit);
  const known = new Set([...here.map((home) => home.ListingKey), ...skip]);
  const elsewhere = text && here.length < 6 ? (await findOnRepliers(text)).filter((home) => !known.has(home.ListingKey)) : [];
  return [...here, ...elsewhere].slice(0, limit);
}

// What Send homes offers before anything is typed: not every home there is,
// only the agent's own (their listings, as their profile has them) and the
// ones they've had anything to do with (liked, commented on, saved, or sent
// before), newest first. For sale only, and never one already on the link.
export async function homesToOffer(
  agent: { id: string; full_name: string; role?: string | null },
  visitorId: string,
  { onLink = [], limit = 8 }: { onLink?: string[]; limit?: number } = {},
): Promise<{ mine: Listing[]; touched: Listing[] }> {
  const [[account], copied] = await Promise.all([
    sql<{ mls_agent_id: string }[]>`select mls_agent_id from accounts where id = ${agent.id}`,
    getCopiedKeys(agent.id),
  ]);
  const skip = new Set([...onLink, ...copied]);
  const mine = (agent.role === "agent" ? await getAgentListings(account?.mls_agent_id ?? "", agent.full_name, agent.id) : [])
    .filter((home) => home.StandardStatus === "Active" && !skip.has(home.ListingKey))
    .slice(0, limit);
  for (const home of mine) skip.add(home.ListingKey);
  const rows = await sql<{ data: Listing }[]>`
    select l.data from (
      select listing_key, max(at) as at from (
        select listing_key, updated_at as at from public_reactions
          where visitor_id = ${visitorId} and (reaction = 'like' or cardinality(liked) > 0)
        union all
        select listing_key, created_at from public_photo_likes where visitor_id = ${visitorId}
        union all
        select listing_key, created_at from public_comments where visitor_id = ${visitorId}
        union all
        select listing_key, created_at from saved_homes where visitor_id = ${visitorId}
        union all
        select sl.listing_key, s.created_at from share_listings sl join shares s on s.id = sl.share_id
          where s.agent_id = ${agent.id}
      ) x group by listing_key
    ) t join listings l on l.listing_key = t.listing_key
    where l.standard_status = 'Active'
      and (l.owner_account_id is null or l.owner_account_id = ${agent.id})
      and l.listing_key not in ${sql(skip.size ? [...skip] : [""])}
    order by t.at desc, l.listing_key
    limit ${limit}`;
  return { mine, touched: rows.map((row) => row.data) };
}
