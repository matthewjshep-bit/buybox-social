import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { z } from "zod";
import type { Account } from "./auth";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import {
  getOwnListing,
  isVideoMedia,
  OWN_LISTINGS_MOST,
  OWN_PHOTOS_MOST,
  OWN_PREFIX,
  photosOf,
  videosOf,
  type OwnListing,
} from "./own-listings";

// Adding and changing the listings an agent keeps themselves (lib/own-listings.ts
// reads them): the work itself, shared by the Listings page
// (app/dashboard/listings/actions.ts) and the API (app/api/v1/listings), so a
// listing is checked and kept the same way whichever one made it. Each takes
// the account it acts for and only ever touches that account's own listings.
// Nothing here knows who's signed in, or redirects or refreshes a page:
// whoever calls it does that.

export type ListingField =
  | "address"
  | "city"
  | "state"
  | "zip"
  | "price"
  | "beds"
  | "baths"
  | "sqft"
  | "about"
  | "yearBuilt"
  | "arv"
  | "rehab";

// What someone gave for a listing, as plain values: what was typed in the
// form (text), or what a tool sent (text or numbers; "$510,000" is fine, as
// in the form). Empty (or null) is none, for the ones that may be left out.
export type ListingValue = string | number | null;
export type ListingInput = Record<ListingField, ListingValue> & { shown: boolean; perSqft: boolean; closed: boolean };

// The facts a listing keeps, as they're written into it. A null is something
// left out, which comes off the listing (see `stored`).
export type ListingFacts = {
  StandardStatus: "Active" | "Closed";
  Hidden: true | null;
  ListPrice: number;
  UnparsedAddress: string;
  City: string;
  StateOrProvince: string;
  PostalCode: string;
  BedroomsTotal: number;
  BathroomsTotalInteger: number;
  LivingArea: number;
  PublicRemarks: string;
  YearBuilt: number | null;
  AfterRepairValue: number | null;
  EstimatedRehab: number | null;
  HidePricePerSqFt: true | null;
};

const FIELDS = [
  "address",
  "city",
  "state",
  "zip",
  "price",
  "beds",
  "baths",
  "sqft",
  "about",
  "yearBuilt",
  "arv",
  "rehab",
] as const satisfies readonly ListingField[];

const number = (most: number) =>
  z.preprocess((value) => Number(String(value ?? "").replace(/[$,\s]/g, "")), z.number().finite().min(0).max(most));

// A number that may be left out: empty is none.
const optional = (least: number, most: number) =>
  z.preprocess(
    (value) => {
      const text = String(value ?? "").replace(/[$,\s]/g, "");
      return text === "" ? null : Number(text);
    },
    z.number().finite().min(least).max(most).nullable(),
  );

const details = z.object({
  address: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  zip: z.string().trim().regex(/^\d{5}$/),
  price: number(500_000_000),
  beds: number(50),
  baths: number(50),
  sqft: number(200_000),
  about: z.string().trim().max(2000),
  shown: z.boolean(),
  // No longer available (sold, the deal done): it says so wherever it shows.
  closed: z.boolean(),
  // The optional ones: left empty, they aren't shown.
  yearBuilt: optional(1600, 2100),
  arv: optional(0, 500_000_000),
  rehab: optional(0, 500_000_000),
  perSqft: z.boolean(),
});

// What to say about each field that's wrong, in words for the agent.
export const LISTING_PROBLEM: Record<ListingField, string> = {
  address: "Enter the street address.",
  city: "Enter the city.",
  state: "Use the state's two letters, like WA.",
  zip: "Enter a 5-digit ZIP code.",
  price: "Enter the price as a number.",
  beds: "Enter the number of bedrooms.",
  baths: "Enter the number of bathrooms.",
  sqft: "Enter the square feet as a number.",
  about: "Keep the description to 2,000 characters.",
  yearBuilt: "Enter the year it was built, like 1962.",
  arv: "Enter the after repair value as a number.",
  rehab: "Enter the estimated rehab as a number.",
};

const isField = (name: unknown): name is ListingField =>
  typeof name === "string" && (FIELDS as readonly string[]).includes(name);

// What was given, checked: the facts to keep, or what's wrong and where.
// (Each value is read as text, cut to a length no field allows, the same as
// the form's.)
export function listingFacts(input: ListingInput): { facts: ListingFacts } | { error: string; field?: ListingField } {
  const typed = {
    ...Object.fromEntries(FIELDS.map((name) => [name, String(input[name] ?? "").slice(0, 2100)])),
    shown: input.shown,
    perSqft: input.perSqft,
    closed: input.closed,
  };
  const parsed = details.safeParse(typed);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return isField(field) ? { error: LISTING_PROBLEM[field], field } : { error: "We couldn't save that." };
  }
  const v = parsed.data;
  return {
    facts: {
      StandardStatus: v.closed ? "Closed" : "Active",
      Hidden: v.shown ? null : true,
      ListPrice: Math.round(v.price),
      UnparsedAddress: v.address,
      City: v.city,
      StateOrProvince: v.state,
      PostalCode: v.zip,
      BedroomsTotal: Math.round(v.beds),
      BathroomsTotalInteger: Math.round(v.baths),
      LivingArea: Math.round(v.sqft),
      PublicRemarks: v.about,
      // (Nulls, so one taken away is taken off the listing too: see `stored`.)
      YearBuilt: v.yearBuilt === null ? null : Math.round(v.yearBuilt),
      AfterRepairValue: v.arv ? Math.round(v.arv) : null,
      EstimatedRehab: v.rehab ? Math.round(v.rehab) : null,
      HidePricePerSqFt: v.perSqft ? null : true,
    },
  };
}

// A listing of theirs as its edit form shows it: what changing only part of it
// starts from. (One hidden before there was a Closed status, kept as
// "Withdrawn", is hidden, as the form has it.)
export function listingInputOf(own: OwnListing): ListingInput {
  const { listing } = own;
  return {
    address: listing.UnparsedAddress,
    city: listing.City,
    state: listing.StateOrProvince,
    zip: listing.PostalCode,
    price: listing.ListPrice,
    beds: listing.BedroomsTotal,
    baths: listing.BathroomsTotalInteger,
    sqft: listing.LivingArea,
    about: listing.PublicRemarks ?? "",
    shown: own.active,
    closed: own.closed,
    yearBuilt: listing.YearBuilt ? listing.YearBuilt : "",
    arv: listing.AfterRepairValue ? listing.AfterRepairValue : "",
    rehab: listing.EstimatedRehab ? listing.EstimatedRehab : "",
    perSqft: !listing.HidePricePerSqFt,
  };
}

// The facts as they're kept: nothing for what was left empty.
const stored = <T extends Record<string, unknown>>(facts: T) =>
  Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== null));

const NOT_FOUND = "We couldn't find that listing.";

// Whether a key could be one of theirs at all, before asking the database.
const ownKey = (key: unknown): key is string => typeof key === "string" && key.length <= 100;

// A new listing: what it is, listed by whoever added it, under the name and
// brokerage on their brand. Its key comes back, for its photos to follow
// (each on its own: addOwnListingPhoto).
export async function createOwnListing(
  agent: Account,
  facts: ListingFacts,
): Promise<{ key: string } | { error: string; limit?: true }> {
  // (Only agents keep listings; the Listings page and the API both see to it.)
  if (agent.role !== "agent") return { error: "Sign in as an agent to add a listing." };
  const key = `${OWN_PREFIX}${randomUUID()}`;
  const listing: Listing = {
    ListingKey: key,
    ListingId: "",
    ...(stored(facts) as Omit<Listing, "ListingKey" | "ListingId" | "Media">),
    ListAgentFullName: agent.full_name,
    ListOfficeName: agent.brokerage,
    Media: [],
  };
  // Their account row is held while their listings are counted, so two added
  // at the same moment (a tool sending several at once) can't both slip
  // under the limit.
  return sql.begin(async (tx): Promise<{ key: string } | { error: string; limit?: true }> => {
    await tx`select 1 from accounts where id = ${agent.id} for update`;
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from listings where owner_account_id = ${agent.id}`;
    if (n >= OWN_LISTINGS_MOST) {
      return { error: `You can keep up to ${OWN_LISTINGS_MOST} listings. Delete one first.`, limit: true };
    }
    await tx`
      insert into listings (listing_key, standard_status, data, owner_account_id)
      values (${key}, ${facts.StandardStatus}, ${sql.json(listing as never)}, ${agent.id})`;
    return { key };
  });
}

// Writes the facts over one of theirs (found already), still listed under the
// name and brokerage on their brand. What was left empty comes off it; what
// isn't a fact here (its photos, its MLS number, what it's a copy of) stays.
async function writeFacts(agent: Account, key: string, facts: ListingFacts) {
  const kept = { ...stored(facts), ListAgentFullName: agent.full_name, ListOfficeName: agent.brokerage };
  const dropped = Object.entries(facts).flatMap(([name, value]) => (value === null ? [name] : []));
  await sql`
    update listings set standard_status = ${facts.StandardStatus},
      data = (data - ${dropped}::text[]) || ${sql.json(kept as never)}, updated_at = now()
    where listing_key = ${key} and owner_account_id = ${agent.id}`;
}

// One of theirs, changed: everything it says, as given (the edit form sends
// all of it).
export async function updateOwnListing(
  agent: Account,
  key: string,
  facts: ListingFacts,
): Promise<{ ok: true } | { error: string; field?: ListingField }> {
  if (!ownKey(key) || !(await getOwnListing(agent.id, key))) return { error: NOT_FOUND };
  await writeFacts(agent, key, facts);
  return { ok: true };
}

// One of theirs, changed only where something is given (left out, or
// undefined, stays as it is; null or empty clears one that may be left out),
// then checked as a whole, as if the edit form had been sent with the rest
// as it was.
export async function patchOwnListing(
  agent: Account,
  key: string,
  partial: Partial<ListingInput>,
): Promise<{ ok: true } | { error: string; field?: ListingField }> {
  const mine = ownKey(key) ? await getOwnListing(agent.id, key) : null;
  if (!mine) return { error: NOT_FOUND };
  const given = Object.fromEntries(Object.entries(partial ?? {}).filter(([, value]) => value !== undefined));
  const checked = listingFacts({ ...listingInputOf(mine), ...given });
  if ("error" in checked) return checked;
  await writeFacts(agent, key, checked.facts);
  return { ok: true };
}

// Gone for good, with its photos and everything anyone did on it. One that's
// on a link they sent stays there for whoever has the link: it's hidden
// from their profile instead ("Withdrawn"), and says so.
export async function deleteOwnListing(
  agentId: string,
  key: string,
): Promise<{ deleted: true } | { withdrawn: true } | { error: string }> {
  if (!ownKey(key) || !(await getOwnListing(agentId, key))) return { error: NOT_FOUND };
  const [onLink] = await sql`select 1 from share_listings where listing_key = ${key} limit 1`;
  if (onLink) {
    await sql`
      update listings set standard_status = 'Withdrawn', data = data || '{"StandardStatus":"Withdrawn"}'::jsonb, updated_at = now()
      where listing_key = ${key} and owner_account_id = ${agentId}`;
    return { withdrawn: true };
  }
  await sql`delete from listings where listing_key = ${key} and owner_account_id = ${agentId}`;
  return { deleted: true };
}

// What a deleted listing that's on a link says instead.
export const WITHDRAWN_INSTEAD = "It's on a link you sent, so it's hidden instead.";

type Db = postgres.ISql;

// The photos and videos as they are now, written back in a new order or with
// one gone or one more: photos first, always, then videos.
export async function setOwnListingMedia(accountId: string, key: string, media: Listing["Media"], db: Db = sql) {
  const ordered = [...media.filter((item) => !isVideoMedia(item)), ...media.filter(isVideoMedia)].map((photo, i) => ({
    ...photo,
    Order: i,
  }));
  await db`
    update listings set data = jsonb_set(data, '{Media}', ${sql.json(ordered as never)}), updated_at = now()
    where listing_key = ${key} and owner_account_id = ${accountId}`;
}

// One of theirs, read inside `tx` and held there until it's done, so two
// photos added (or taken off) at the same moment, as a tool sending several
// at once does, each see the other's: neither is lost, and the most a listing
// has holds. Media in its order, as getOwnListing gives it. Null when it
// isn't theirs.
async function heldListing(tx: Db, accountId: string, key: string): Promise<Listing | null> {
  const [row] = await tx<{ data: Listing }[]>`
    select data from listings
    where listing_key = ${key} and owner_account_id = ${accountId}
    for update`;
  if (!row) return null;
  return { ...row.data, Media: [...(row.data.Media ?? [])].sort((a, b) => a.Order - b.Order) };
}

const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

// The biggest photo kept, as a data URL (about 670 KB of JPEG).
export const PHOTO_MOST_CHARS = 900_000;

// One more photo, at the end, after the photos there are and before any
// video: a JPEG as a data URL (made in the browser by lib/resize-photo.ts, or
// by the API from what a tool sent), with its size. Its id comes back, and
// where it's shown ("/listing-photo/…", on this site).
export async function addOwnListingPhoto(
  agentId: string,
  key: string,
  dataUrl: string,
  width: number,
  height: number,
): Promise<{ id: string; url: string } | { error: string }> {
  const mine = ownKey(key) ? await getOwnListing(agentId, key) : null;
  if (!mine) return { error: NOT_FOUND };
  if (typeof dataUrl !== "string" || dataUrl.length > PHOTO_MOST_CHARS || !PHOTO.test(dataUrl)) {
    return { error: "We couldn't use that photo. Try a JPEG or PNG." };
  }
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 4000)) return { error: "We couldn't use that photo." };
  const full = { error: `A listing can have up to ${OWN_PHOTOS_MOST} photos.` };
  if (photosOf(mine.listing).length >= OWN_PHOTOS_MOST) return full;
  return sql.begin(async (tx): Promise<{ id: string; url: string } | { error: string }> => {
    const listing = await heldListing(tx, agentId, key);
    if (!listing) return { error: NOT_FOUND };
    if (photosOf(listing).length >= OWN_PHOTOS_MOST) return full;
    const [{ id }] = await tx<{ id: string }[]>`
      insert into listing_uploads (listing_key, account_id, data_url, width, height)
      values (${key}, ${agentId}, ${dataUrl}, ${width}, ${height}) returning id`;
    const url = `/listing-photo/${id}`;
    const photo = { MediaKey: id, MediaURL: url, Order: 0, MediaCategory: "Photo", ImageWidth: width, ImageHeight: height };
    await setOwnListingMedia(agentId, key, [...photosOf(listing), photo, ...videosOf(listing)], tx);
    return { id, url };
  });
}

// Where an uploaded video is kept in file storage: its uploader's folder, then a name of its own.
export const STORED_VIDEO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|mov|webm)$/;

// A photo or video off one of their listings, by its key (a photo that came
// with a copied listing has no key of its own: it goes by its address).
// `storedVideo`: where a video they uploaded was kept, for the caller to take
// out of file storage, which only the uploader's own session can do; null
// for anything else.
export async function removeOwnListingPhoto(
  agentId: string,
  key: string,
  mediaKey: string,
): Promise<{ ok: true; storedVideo: string | null } | { error: string }> {
  const mine = ownKey(key) ? await getOwnListing(agentId, key) : null;
  if (!mine || typeof mediaKey !== "string") return { error: NOT_FOUND };
  return sql.begin(async (tx): Promise<{ ok: true; storedVideo: string | null } | { error: string }> => {
    const listing = await heldListing(tx, agentId, key);
    if (!listing) return { error: NOT_FOUND };
    await setOwnListingMedia(
      agentId,
      key,
      listing.Media.filter((photo) => (photo.MediaKey ?? photo.MediaURL) !== mediaKey),
      tx,
    );
    await tx`delete from listing_uploads where id::text = ${mediaKey} and listing_key = ${key} and account_id = ${agentId}`;
    const gone = listing.Media.find((photo) => (photo.MediaKey ?? photo.MediaURL) === mediaKey);
    const storedVideo = gone && isVideoMedia(gone) && !gone.VideoEmbed && STORED_VIDEO.test(mediaKey) ? mediaKey : null;
    return { ok: true, storedVideo };
  });
}
