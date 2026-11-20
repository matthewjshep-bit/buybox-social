import { cache } from "react";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { getCopiedKeys, getListingsLook, getPinnedListings, getShownOwnListings } from "./own-listings";

// How an agent's listings can be put in order on their page: as they chose
// (the one they feature first), newest first, or the most liked and talked
// about first.
export const LISTING_SORTS = ["featured", "newest", "active"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];
export const isListingSort = (value: unknown): value is ListingSort =>
  typeof value === "string" && (LISTING_SORTS as readonly string[]).includes(value);

// When a listing went up: added here, or on the market.
const listedAt = (listing: Listing) => Date.parse(listing.OriginalEntryTimestamp ?? listing.OnMarketDate ?? "") || 0;

// What their page starts with: as they chose, when they feature one (which
// then leads), or newest first.
export const defaultListingSort = (listings: Listing[], featured: string | null): ListingSort =>
  featured && listings.some((listing) => listing.ListingKey === featured) ? "featured" : "newest";

// Their listings in the order asked for. (Ties keep the order they came in.)
export function sortListings(
  listings: Listing[],
  sort: ListingSort,
  counts?: Map<string, { likes: number; comments: number }>,
): Listing[] {
  // (Those still available before the ones they've closed, in Featured and
  // Newest; Most active goes by what people did, closed or not.)
  const closed = (listing: Listing) => listing.StandardStatus === "Closed";
  const openFirst = (list: Listing[]) => [...list.filter((listing) => !closed(listing)), ...list.filter(closed)];
  // (The one they feature leads, whatever it is.)
  if (sort === "featured") return listings.length > 0 ? [listings[0], ...openFirst(listings.slice(1))] : listings;
  const newest = (a: Listing, b: Listing) => listedAt(b) - listedAt(a);
  if (sort === "newest") return openFirst([...listings].sort(newest));
  const activity = (listing: Listing) => {
    const count = counts?.get(listing.ListingKey);
    return count ? count.likes + count.comments : 0;
  };
  return [...listings].sort((a, b) => activity(b) - activity(a) || newest(a, b));
}

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
// once, the one they chose to feature first. Public listing data only: nothing anyone did on them.
export const getAgentListings = cache(
  async (mlsAgentId: string | null, agentName: string, accountId: string | null = null): Promise<Listing[]> => {
    const [own, pinned, copied, look, rows] = await Promise.all([
      getShownOwnListings(accountId),
      getPinnedListings(accountId),
      // (A copy they made to change stands in for its original.)
      getCopiedKeys(accountId),
      // (The one they chose to lead goes first.)
      getListingsLook(accountId),
      mlsAgentId
        ? sql<{ data: Listing }[]>`
            select data from listings
            where standard_status = 'Active' and owner_account_id is null
              and lower(data->>'ListAgentMlsId') = ${mlsAgentId.toLowerCase()}
            order by data->>'OnMarketDate' desc nulls last, listing_key
            limit ${MOST}`
        : [],
    ]);
    const seen = new Set<string>(copied);
    const all = [
      ...own,
      ...pinned,
      ...rows
        .filter(({ data }) => sameAgent(agentName, data.ListAgentFullName))
        .map(({ data }) => ({ ...data, Media: [...data.Media].sort((a, b) => a.Order - b.Order) })),
    ].filter((listing) => !seen.has(listing.ListingKey) && Boolean(seen.add(listing.ListingKey)));
    const lead = all.find((listing) => listing.ListingKey === look.featured);
    return lead ? [lead, ...all.filter((listing) => listing !== lead)] : all;
  },
);
