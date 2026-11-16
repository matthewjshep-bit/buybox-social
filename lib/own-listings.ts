import { sql } from "./db";
import type { Listing } from "./listings/types";

// Listings someone added themselves (lib: reading them; app/dashboard/listings:
// adding and changing them). Each is a row in `listings` with their account
// as its owner and a key of its own ("OWN-…"), so everything a home can do,
// it can do too.

export const OWN_PREFIX = "OWN-";
export const OWN_LISTINGS_MOST = 50;
export const OWN_PHOTOS_MOST = 15;

export type OwnListing = { listing: Listing; active: boolean; updatedAt: string };

const sorted = (listing: Listing): Listing => ({ ...listing, Media: [...listing.Media].sort((a, b) => a.Order - b.Order) });

// Every listing of theirs, newest first, shown or not: for the owner only.
export async function getOwnListings(accountId: string): Promise<OwnListing[]> {
  const rows = await sql<{ data: Listing; standard_status: string; updated_at: Date }[]>`
    select data, standard_status, updated_at from listings
    where owner_account_id = ${accountId}
    order by updated_at desc, listing_key`;
  return rows.map((row) => ({
    listing: sorted(row.data),
    active: row.standard_status === "Active",
    updatedAt: row.updated_at.toISOString(),
  }));
}

// One of theirs, by its key: null when it isn't theirs (or isn't there).
export async function getOwnListing(accountId: string, key: string): Promise<OwnListing | null> {
  if (!key.startsWith(OWN_PREFIX) || key.length > 64) return null;
  const [row] = await sql<{ data: Listing; standard_status: string; updated_at: Date }[]>`
    select data, standard_status, updated_at from listings
    where listing_key = ${key} and owner_account_id = ${accountId}`;
  return row
    ? { listing: sorted(row.data), active: row.standard_status === "Active", updatedAt: row.updated_at.toISOString() }
    : null;
}

// The ones anyone may see on their profile: for sale, with a photo, newest first.
export async function getShownOwnListings(accountId: string | null): Promise<Listing[]> {
  if (!accountId) return [];
  const rows = await sql<{ data: Listing }[]>`
    select data from listings
    where owner_account_id = ${accountId} and standard_status = 'Active' and jsonb_array_length(data->'Media') > 0
    order by updated_at desc, listing_key
    limit ${OWN_LISTINGS_MOST}`;
  return rows.map((row) => sorted(row.data));
}

// The homes they found and put on their profile (not typed in): still for
// sale, newest added first. Whoever listed each is still named on it.
export async function getPinnedListings(accountId: string | null): Promise<Listing[]> {
  if (!accountId) return [];
  const rows = await sql<{ data: Listing }[]>`
    select l.data
    from profile_listings p join listings l on l.listing_key = p.listing_key
    where p.account_id = ${accountId} and l.standard_status = 'Active'
    order by p.created_at desc, l.listing_key
    limit ${OWN_LISTINGS_MOST}`;
  return rows.map((row) => sorted(row.data));
}
