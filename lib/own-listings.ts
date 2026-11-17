import { sql } from "./db";
import type { Listing } from "./listings/types";

// Listings someone added themselves (lib: reading them; app/dashboard/listings:
// adding and changing them). Each is a row in `listings` with their account
// as its owner and a key of its own ("OWN-…"), so everything a home can do,
// it can do too.

export const OWN_PREFIX = "OWN-";
export const OWN_LISTINGS_MOST = 50;
export const OWN_PHOTOS_MOST = 15;
export const OWN_VIDEOS_MOST = 3;
// An uploaded video: where it's kept, and how big it may be.
export const VIDEO_BUCKET = "listing-media";
export const VIDEO_MOST_BYTES = 50 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

// A listing's media, photos apart from videos. Photos always come first (so
// the one a card shows is a photo), then videos.
export const isVideoMedia = (media: Listing["Media"][number]) => media.MediaCategory === "Video" || Boolean(media.VideoEmbed);
export const photosOf = (listing: Listing) => listing.Media.filter((media) => !isVideoMedia(media));
export const videosOf = (listing: Listing) => listing.Media.filter(isVideoMedia);

// `active`: on their profile (not hidden). `closed`: no longer available
// (sold, or the deal done), which a listing still on their profile says.
export type OwnListing = { listing: Listing; active: boolean; closed: boolean; updatedAt: string };

// How a profile lays its listings out.
export const LISTING_LAYOUTS = ["featured", "grid2", "grid3", "list"] as const;
export type ListingLayout = (typeof LISTING_LAYOUTS)[number];
export const isListingLayout = (value: unknown): value is ListingLayout =>
  typeof value === "string" && (LISTING_LAYOUTS as readonly string[]).includes(value);

// (A listing hidden before there was a Closed status was kept as "Withdrawn".)
const own = (row: { data: Listing; standard_status: string; updated_at: Date }): OwnListing => ({
  listing: sorted(row.data),
  active: row.standard_status !== "Withdrawn" && !row.data.Hidden,
  closed: row.standard_status === "Closed",
  updatedAt: row.updated_at.toISOString(),
});

const sorted = (listing: Listing): Listing => ({ ...listing, Media: [...listing.Media].sort((a, b) => a.Order - b.Order) });

// Every listing of theirs, newest first, shown or not: for the owner only.
export async function getOwnListings(accountId: string): Promise<OwnListing[]> {
  const rows = await sql<{ data: Listing; standard_status: string; updated_at: Date }[]>`
    select data, standard_status, updated_at from listings
    where owner_account_id = ${accountId}
    order by updated_at desc, listing_key`;
  return rows.map(own);
}

// One of theirs, by its key: null when it isn't theirs (or isn't there).
export async function getOwnListing(accountId: string, key: string): Promise<OwnListing | null> {
  if (!key.startsWith(OWN_PREFIX) || key.length > 64) return null;
  const [row] = await sql<{ data: Listing; standard_status: string; updated_at: Date }[]>`
    select data, standard_status, updated_at from listings
    where listing_key = ${key} and owner_account_id = ${accountId}`;
  return row ? own(row) : null;
}

// The ones anyone may see on their profile: available or closed (a closed
// one says so), not hidden, with a photo; newest first.
export async function getShownOwnListings(accountId: string | null): Promise<Listing[]> {
  if (!accountId) return [];
  const rows = await sql<{ data: Listing }[]>`
    select data from listings
    where owner_account_id = ${accountId} and standard_status in ('Active', 'Closed')
      and coalesce((data->>'Hidden')::boolean, false) = false
      -- (With a photo: a video alone has nothing for a card to show.)
      and exists (
        select 1 from jsonb_array_elements(data->'Media') m
        where coalesce(m->>'MediaCategory', 'Photo') <> 'Video' and m->>'VideoEmbed' is null)
    order by updated_at desc, listing_key
    limit ${OWN_LISTINGS_MOST}`;
  return rows.map((row) => sorted(row.data));
}

// The MLS listings they've made their own copy of: each copy stands in for
// its original on their profile (shown or hidden, as they left the copy).
export async function getCopiedKeys(accountId: string | null): Promise<string[]> {
  if (!accountId) return [];
  const rows = await sql<{ key: string }[]>`
    select data->>'CopiedFrom' as key from listings
    where owner_account_id = ${accountId} and data->>'CopiedFrom' is not null`;
  return rows.map((row) => row.key);
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

// How their listings are laid out on their profile, and the one that leads.
export async function getListingsLook(accountId: string | null): Promise<{ layout: ListingLayout; featured: string | null }> {
  if (!accountId) return { layout: "featured", featured: null };
  const [row] = await sql<{ listings_layout: string; featured_listing_key: string | null }[]>`
    select listings_layout, featured_listing_key from accounts where id = ${accountId}`;
  return { layout: isListingLayout(row?.listings_layout) ? row.listings_layout : "featured", featured: row?.featured_listing_key ?? null };
}
