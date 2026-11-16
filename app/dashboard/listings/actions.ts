"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { importMissing, runImportsAndContinue } from "@/lib/listings/imports";
import type { Listing } from "@/lib/listings/types";
import { getOwnListing, OWN_LISTINGS_MOST, OWN_PHOTOS_MOST, OWN_PREFIX } from "@/lib/own-listings";

// Adding and changing the listings an agent (or an investor) keeps
// themselves. Every one of these checks the listing is theirs first.

export type ListingField = "address" | "city" | "state" | "zip" | "price" | "beds" | "baths" | "sqft" | "about";
// (What was typed comes back with a save that didn't go through, so the
// form still has it.)
export type ListingTyped = Record<ListingField, string> & { shown: boolean };
export type ListingState = { error?: string; field?: ListingField; saved?: boolean; values?: ListingTyped };

const number = (most: number) =>
  z.preprocess((value) => Number(String(value ?? "").replace(/[$,\s]/g, "")), z.number().finite().min(0).max(most));

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
});

const WHAT: Record<ListingField, string> = {
  address: "Enter the street address.",
  city: "Enter the city.",
  state: "Use the state's two letters, like WA.",
  zip: "Enter a 5-digit ZIP code.",
  price: "Enter the price as a number.",
  beds: "Enter the number of bedrooms.",
  baths: "Enter the number of bathrooms.",
  sqft: "Enter the square feet as a number.",
  about: "Keep the description to 2,000 characters.",
};

async function agent() {
  const account = await getCurrentUser();
  return account?.role === "agent" ? account : null;
}

// What was typed, read from the form and checked: the facts to keep, or
// what's wrong and where.
function read(form: FormData) {
  const typed = {
    ...Object.fromEntries(
      (["address", "city", "state", "zip", "price", "beds", "baths", "sqft", "about"] as const).map((name) => [
        name,
        String(form.get(name) ?? "").slice(0, 2100),
      ]),
    ),
    shown: form.get("shown") === "on",
  } as ListingTyped;
  const parsed = details.safeParse(typed);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as ListingField | undefined;
    return { typed, problem: { error: field ? WHAT[field] : "We couldn't save that.", field, values: typed } };
  }
  const v = parsed.data;
  return {
    typed,
    facts: {
      StandardStatus: v.shown ? "Active" : "Withdrawn",
      ListPrice: Math.round(v.price),
      UnparsedAddress: v.address,
      City: v.city,
      StateOrProvince: v.state,
      PostalCode: v.zip,
      BedroomsTotal: Math.round(v.beds),
      BathroomsTotalInteger: Math.round(v.baths),
      LivingArea: Math.round(v.sqft),
      PublicRemarks: v.about,
    },
  };
}

// A new listing: what it is. Its key comes back, for its photos to follow
// (each sent on its own: addListingPhoto).
export async function createListing(form: FormData): Promise<ListingState & { key?: string }> {
  const { typed, facts, problem } = read(form);
  const me = await agent();
  if (!me) return { error: "Sign in as an agent to add a listing.", values: typed };
  if (!facts) return problem;
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from listings where owner_account_id = ${me.id}`;
  if (n >= OWN_LISTINGS_MOST) {
    return { error: `You can keep up to ${OWN_LISTINGS_MOST} listings. Delete one first.`, values: typed };
  }
  const key = `${OWN_PREFIX}${randomUUID()}`;
  // Listed by whoever added it, under the name and brokerage on their brand.
  const listing: Listing = {
    ListingKey: key,
    ListingId: "",
    ...facts,
    ListAgentFullName: me.full_name,
    ListOfficeName: me.brokerage,
    Media: [],
  };
  await sql`
    insert into listings (listing_key, standard_status, data, owner_account_id)
    values (${key}, ${facts.StandardStatus}, ${sql.json(listing as never)}, ${me.id})`;
  refresh();
  return { key };
}

// One of theirs, changed.
export async function saveListing(key: string, _state: ListingState, form: FormData): Promise<ListingState> {
  const { typed, facts, problem } = read(form);
  const me = await agent();
  if (!me) return { error: "Sign in as an agent to change a listing.", values: typed };
  if (!facts) return problem;
  const mine = await getOwnListing(me.id, key);
  if (!mine) return { error: "We couldn't find that listing.", values: typed };
  const kept = { ...facts, ListAgentFullName: me.full_name, ListOfficeName: me.brokerage };
  await sql`
    update listings set standard_status = ${facts.StandardStatus}, data = data || ${sql.json(kept as never)}, updated_at = now()
    where listing_key = ${key} and owner_account_id = ${me.id}`;
  refresh();
  return { saved: true, values: typed };
}

const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

// One more photo, at the end: a JPEG made in the browser (lib/resize-photo.ts).
export async function addListingPhoto(key: string, dataUrl: string, width: number, height: number): Promise<{ error?: string }> {
  const me = await agent();
  const mine = me && typeof key === "string" ? await getOwnListing(me.id, key) : null;
  if (!me || !mine) return { error: "We couldn't find that listing." };
  if (typeof dataUrl !== "string" || dataUrl.length > 900_000 || !PHOTO.test(dataUrl)) {
    return { error: "We couldn't use that photo. Try a JPEG or PNG." };
  }
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 4000)) return { error: "We couldn't use that photo." };
  if (mine.listing.Media.length >= OWN_PHOTOS_MOST) return { error: `A listing can have up to ${OWN_PHOTOS_MOST} photos.` };
  const [{ id }] = await sql<{ id: string }[]>`
    insert into listing_uploads (listing_key, account_id, data_url, width, height)
    values (${key}, ${me.id}, ${dataUrl}, ${width}, ${height}) returning id`;
  const order = Math.max(-1, ...mine.listing.Media.map((photo) => photo.Order)) + 1;
  const photo = { MediaKey: id, MediaURL: `/listing-photo/${id}`, Order: order, MediaCategory: "Photo", ImageWidth: width, ImageHeight: height };
  await sql`
    update listings set data = jsonb_set(data, '{Media}', coalesce(data->'Media', '[]'::jsonb) || ${sql.json([photo] as never)}), updated_at = now()
    where listing_key = ${key} and owner_account_id = ${me.id}`;
  refresh();
  return {};
}

// The photos as they are now, written back in a new order or with one gone.
async function setPhotos(accountId: string, key: string, media: Listing["Media"]) {
  const ordered = media.map((photo, i) => ({ ...photo, Order: i }));
  await sql`
    update listings set data = jsonb_set(data, '{Media}', ${sql.json(ordered as never)}), updated_at = now()
    where listing_key = ${key} and owner_account_id = ${accountId}`;
}

export async function removeListingPhoto(key: string, mediaKey: string): Promise<{ error?: string }> {
  const me = await agent();
  const mine = me && typeof key === "string" ? await getOwnListing(me.id, key) : null;
  if (!me || !mine || typeof mediaKey !== "string") return { error: "We couldn't find that listing." };
  await setPhotos(me.id, key, mine.listing.Media.filter((photo) => photo.MediaKey !== mediaKey));
  await sql`delete from listing_uploads where id::text = ${mediaKey} and listing_key = ${key} and account_id = ${me.id}`;
  refresh();
  return {};
}

// The photo that leads: the one a card shows.
export async function leadWithListingPhoto(key: string, mediaKey: string): Promise<{ error?: string }> {
  const me = await agent();
  const mine = me && typeof key === "string" ? await getOwnListing(me.id, key) : null;
  if (!me || !mine || typeof mediaKey !== "string") return { error: "We couldn't find that listing." };
  const first = mine.listing.Media.find((photo) => photo.MediaKey === mediaKey);
  if (!first) return { error: "That photo isn't there anymore." };
  await setPhotos(me.id, key, [first, ...mine.listing.Media.filter((photo) => photo !== first)]);
  refresh();
  return {};
}

// Gone for good, with its photos and everything anyone did on it. One that's
// on a link they sent stays there for whoever has the link: it's hidden
// from their profile instead, and says so.
export async function deleteListing(key: string): Promise<{ error?: string }> {
  const me = await agent();
  if (!me || typeof key !== "string" || !(await getOwnListing(me.id, key))) return { error: "We couldn't find that listing." };
  const [onLink] = await sql`select 1 from share_listings where listing_key = ${key} limit 1`;
  if (onLink) {
    await sql`
      update listings set standard_status = 'Withdrawn', data = data || '{"StandardStatus":"Withdrawn"}'::jsonb, updated_at = now()
      where listing_key = ${key} and owner_account_id = ${me.id}`;
    refresh();
    return { error: "It's on a link you sent, so it's hidden instead." };
  }
  await sql`delete from listings where listing_key = ${key} and owner_account_id = ${me.id}`;
  redirect("/dashboard/listings");
}

// A home found by its address or MLS number, put on their profile as it is
// (one that isn't here yet is brought in first, its photos scanned after).
// It stays the home everyone shares, with whoever listed it named on it.
export async function pinListing(key: string): Promise<{ error?: string }> {
  const me = await agent();
  if (!me || typeof key !== "string" || key.length > 100) return { error: "We couldn't add that home." };
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from profile_listings where account_id = ${me.id}`;
  if (n >= OWN_LISTINGS_MOST) return { error: `You can keep up to ${OWN_LISTINGS_MOST} listings. Remove one first.` };
  if (await importMissing([key])) after(() => runImportsAndContinue());
  const added = await sql`
    insert into profile_listings (account_id, listing_key)
    select ${me.id}, listing_key from listings
    where listing_key = ${key} and standard_status = 'Active' and owner_account_id is null
    on conflict do nothing
    returning listing_key`;
  if (added.length === 0) {
    const [already] = await sql`select 1 from profile_listings where account_id = ${me.id} and listing_key = ${key}`;
    if (!already) return { error: "That home isn't for sale anymore." };
  }
  refresh();
  return {};
}

// Off their profile again. The home itself is untouched.
export async function unpinListing(key: string): Promise<{ error?: string }> {
  const me = await agent();
  if (!me || typeof key !== "string") return { error: "We couldn't remove that home." };
  await sql`delete from profile_listings where account_id = ${me.id} and listing_key = ${key}`;
  refresh();
  return {};
}
