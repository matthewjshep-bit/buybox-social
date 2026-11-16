import { cache } from "react";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { getPinnedListings, getShownOwnListings } from "./own-listings";

// What an MLS ID may be (also checked by the database).
export const MLS_ID = /^[A-Za-z0-9-]{1,20}$/;
const MOST = 60;

// A name's words, plainly: lower case, no accents, no punctuation.
const words = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// Whether a listing's agent is this agent, by name: a first and last name at
// least, each of them in the name the listing gives ("Jordan Rivera" is
// "Jordan A. Rivera, PA"). An MLS ID is public, so the ID alone never makes
// someone else's listings theirs.
export function sameAgent(name: string, listedAs: string | null | undefined) {
  const mine = words(name);
  const theirs = new Set(words(listedAs ?? ""));
  return mine.length >= 2 && mine.every((word) => theirs.has(word));
}

// The agents' names on the active listings with this MLS ID. None when no
// listing has it (yet).
export async function listedAgentNames(mlsAgentId: string): Promise<string[]> {
  const rows = await sql<{ name: string | null }[]>`
    select distinct data->>'ListAgentFullName' as name from listings
    where standard_status = 'Active' and lower(data->>'ListAgentMlsId') = ${mlsAgentId.toLowerCase()}`;
  return rows.map((row) => row.name ?? "");
}

// An agent's own homes for sale: the listings they added themselves (typed
// in, then found and added, newest first), then the ones with their MLS ID
// that are listed under their name (newest on the market first). Each home
// once. Public listing data only: nothing anyone did on them.
export const getAgentListings = cache(
  async (mlsAgentId: string | null, agentName: string, accountId: string | null = null): Promise<Listing[]> => {
    const [own, pinned, rows] = await Promise.all([
      getShownOwnListings(accountId),
      getPinnedListings(accountId),
      mlsAgentId
        ? sql<{ data: Listing }[]>`
            select data from listings
            where standard_status = 'Active' and owner_account_id is null
              and lower(data->>'ListAgentMlsId') = ${mlsAgentId.toLowerCase()}
            order by data->>'OnMarketDate' desc nulls last, listing_key
            limit ${MOST}`
        : [],
    ]);
    const seen = new Set<string>();
    return [
      ...own,
      ...pinned,
      ...rows
        .filter(({ data }) => sameAgent(agentName, data.ListAgentFullName))
        .map(({ data }) => ({ ...data, Media: [...data.Media].sort((a, b) => a.Order - b.Order) })),
    ].filter((listing) => !seen.has(listing.ListingKey) && Boolean(seen.add(listing.ListingKey)));
  },
);
