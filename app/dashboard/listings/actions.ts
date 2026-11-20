"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser, type Account } from "@/lib/auth";
import { sameAgent } from "@/lib/agent-listings";
import { sql } from "@/lib/db";
import { importMissing, runImportsAndContinue } from "@/lib/listings/imports";
import type { Listing } from "@/lib/listings/types";
import {
  addOwnListingPhoto,
  createOwnListing,
  deleteOwnListing,
  listingFacts,
  removeOwnListingPhoto,
  setOwnListingMedia as setPhotos,
  STORED_VIDEO as STORED,
  updateOwnListing,
  WITHDRAWN_INSTEAD,
  type ListingField as Field,
} from "@/lib/own-listing-writes";
import {
  getOwnListing,
  isListingLayout,
  isVideoMedia,
  OWN_LISTINGS_MOST,
  OWN_PREFIX,
  OWN_VIDEOS_MOST,
  VIDEO_BUCKET,
  VIDEO_MOST_BYTES,
  VIDEO_TYPES,
  videosOf,
  type OwnListing,
} from "@/lib/own-listings";
import { createSupabase, supabaseConfigured } from "@/lib/supabase/server";
import { videoLink } from "@/lib/video-link";

// Adding and changing the listings an agent (or an investor) keeps
// themselves. Every one of these checks the listing is theirs first. The
// checking and keeping is lib/own-listing-writes.ts, which the API uses too;
// what's here is the form's side of it: who's signed in, what was typed, and
// the page drawn again after.

export type ListingField = Field;
// (What was typed comes back with a save that didn't go through, so the
// form still has it.)
export type ListingTyped = Record<ListingField, string> & { shown: boolean; perSqft: boolean; closed: boolean };
export type ListingState = { error?: string; field?: ListingField; saved?: boolean; values?: ListingTyped };

async function agent() {
  const account = await getCurrentUser();
  return account?.role === "agent" ? account : null;
}

// What was typed, read from the form and checked: the facts to keep, or
// what's wrong and where.
function read(form: FormData) {
  const typed = {
    ...Object.fromEntries(
      (["address", "city", "state", "zip", "price", "beds", "baths", "sqft", "about", "yearBuilt", "arv", "rehab"] as const).map(
        (name) => [name, String(form.get(name) ?? "").slice(0, 2100)],
      ),
    ),
    shown: form.get("shown") === "on",
    perSqft: form.get("perSqft") === "on",
    closed: form.get("status") === "closed",
  } as ListingTyped;
  const checked = listingFacts(typed);
  if ("error" in checked) return { typed, problem: { error: checked.error, field: checked.field, values: typed } };
  return { typed, facts: checked.facts };
}

// A new listing: what it is. Its key comes back, for its photos to follow
// (each sent on its own: addListingPhoto).
export async function createListing(form: FormData): Promise<ListingState & { key?: string }> {
  const { typed, facts, problem } = read(form);
  const me = await agent();
  if (!me) return { error: "Sign in as an agent to add a listing.", values: typed };
  if (!facts) return problem;
  const made = await createOwnListing(me, facts);
  if ("error" in made) return { error: made.error, values: typed };
  refresh();
  return { key: made.key };
}

// One of theirs, changed.
export async function saveListing(key: string, _state: ListingState, form: FormData): Promise<ListingState> {
  const { typed, facts, problem } = read(form);
  const me = await agent();
  if (!me) return { error: "Sign in as an agent to change a listing.", values: typed };
  if (!facts) return problem;
  const saved = await updateOwnListing(me, key, facts);
  if ("error" in saved) return { error: saved.error, values: typed };
  refresh();
  return { saved: true, values: typed };
}

// One more photo, at the end: a JPEG made in the browser (lib/resize-photo.ts).
export async function addListingPhoto(key: string, dataUrl: string, width: number, height: number): Promise<{ error?: string }> {
  const me = await agent();
  if (!me) return { error: "We couldn't find that listing." };
  const added = await addOwnListingPhoto(me.id, key, dataUrl, width, height);
  if ("error" in added) return { error: added.error };
  refresh();
  return {};
}

export async function removeListingPhoto(key: string, mediaKey: string): Promise<{ error?: string }> {
  const me = await agent();
  if (!me) return { error: "We couldn't find that listing." };
  const removed = await removeOwnListingPhoto(me.id, key, mediaKey);
  if ("error" in removed) return { error: removed.error };
  // An uploaded video goes from file storage too (its key is where it's kept
  // there), which only their own signed-in session may do.
  if (removed.storedVideo && supabaseConfigured) {
    const supabase = await createSupabase();
    await supabase.storage.from(VIDEO_BUCKET).remove([removed.storedVideo]);
  }
  refresh();
  return {};
}

// The photo that leads: the one a card shows.
export async function leadWithListingPhoto(key: string, mediaKey: string): Promise<{ error?: string }> {
  const me = await agent();
  const mine = me && typeof key === "string" ? await getOwnListing(me.id, key) : null;
  if (!me || !mine || typeof mediaKey !== "string") return { error: "We couldn't find that listing." };
  const first = mine.listing.Media.find((photo) => (photo.MediaKey ?? photo.MediaURL) === mediaKey);
  if (!first || isVideoMedia(first)) return { error: "That photo isn't there anymore." };
  await setPhotos(me.id, key, [first, ...mine.listing.Media.filter((photo) => photo !== first)]);
  refresh();
  return {};
}

// Gone for good, with its photos and everything anyone did on it. One that's
// on a link they sent stays there for whoever has the link: it's hidden
// from their profile instead, and says so.
export async function deleteListing(key: string): Promise<{ error?: string }> {
  const me = await agent();
  if (!me) return { error: "We couldn't find that listing." };
  const gone = await deleteOwnListing(me.id, key);
  if ("error" in gone) return { error: gone.error };
  if ("withdrawn" in gone) {
    refresh();
    return { error: WITHDRAWN_INSTEAD };
  }
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

// One of their MLS listings, to change: their own copy of it (its facts and
// photos as they are now), which then stands in for it on their profile. Made
// once; asked again, it opens the copy they have. Only a listing that's
// theirs by their MLS ID and their name: nobody copies someone else's.
export async function editMlsListing(key: string): Promise<void> {
  const me = await agent();
  if (!me || typeof key !== "string" || key.length > 100) redirect("/dashboard/listings");
  const [existing] = await sql<{ listing_key: string }[]>`
    select listing_key from listings where owner_account_id = ${me.id} and data->>'CopiedFrom' = ${key}`;
  if (existing) redirect(`/dashboard/listings/${existing.listing_key}`);
  const [row] = await sql<{ data: Listing; mls: string }[]>`
    select l.data, a.mls_agent_id as mls from listings l, accounts a
    where l.listing_key = ${key} and l.standard_status = 'Active' and l.owner_account_id is null and a.id = ${me.id}`;
  const theirs =
    row &&
    row.mls.trim() !== "" &&
    (row.data.ListAgentMlsId ?? "").toLowerCase() === row.mls.trim().toLowerCase() &&
    sameAgent(me.full_name, row.data.ListAgentFullName);
  if (!theirs) redirect("/dashboard/listings");
  const fresh = `${OWN_PREFIX}${randomUUID()}`;
  const copy: Listing = {
    ...row.data,
    ListingKey: fresh,
    CopiedFrom: key,
    ListAgentFullName: me.full_name,
    ListOfficeName: me.brokerage || row.data.ListOfficeName,
    Media: [...row.data.Media].sort((a, b) => a.Order - b.Order).map((photo, i) => ({ ...photo, Order: i })),
  };
  await sql`
    insert into listings (listing_key, standard_status, data, owner_account_id)
    values (${fresh}, 'Active', ${sql.json(copy as never)}, ${me.id})`;
  redirect(`/dashboard/listings/${fresh}`);
}

// One of their listings, with room for one more video: or what's in the way.
async function ownWithRoom(key: string): Promise<{ error: string } | { me: Account; mine: OwnListing }> {
  const me = await agent();
  const mine = me && typeof key === "string" ? await getOwnListing(me.id, key) : null;
  if (!me || !mine) return { error: "We couldn't find that listing." };
  if (videosOf(mine.listing).length >= OWN_VIDEOS_MOST) return { error: `A listing can have up to ${OWN_VIDEOS_MOST} videos.` };
  return { me, mine };
}

// A video on YouTube, Vimeo or Loom, by its link: it plays in place, with the photos.
export async function addListingVideoLink(key: string, link: string): Promise<{ error?: string }> {
  const found = await ownWithRoom(key);
  if ("error" in found) return found;
  const video = typeof link === "string" && link.length <= 300 ? videoLink(link) : null;
  if (!video) return { error: "Paste a YouTube, Vimeo or Loom link." };
  if (found.mine.listing.Media.some((item) => item.VideoEmbed === video.embed)) return { error: "That video is already on it." };
  await setPhotos(found.me.id, key, [
    ...found.mine.listing.Media,
    {
      MediaKey: randomUUID(),
      MediaURL: link.trim(),
      Order: 0,
      MediaCategory: "Video",
      ShortDescription: `${video.site} video`,
      VideoEmbed: video.embed,
      ...(video.poster && { VideoPoster: video.poster }),
    },
  ]);
  refresh();
  return {};
}

// A video from their device, step one: somewhere to send it. It goes straight
// from their browser to file storage (it's far too big to pass through here),
// into their own folder, with a pass that's good for this one file.
export async function startListingVideoUpload(
  key: string,
  type: string,
  size: number,
): Promise<{ error: string } | { url: string; anonKey: string; bucket: string; path: string; token: string }> {
  const found = await ownWithRoom(key);
  if ("error" in found) return found;
  if (!supabaseConfigured) return { error: "Uploading videos isn't set up here. Paste a link instead." };
  const ext = VIDEO_TYPES[type];
  if (!ext) return { error: "Use an MP4 or MOV video." };
  if (!Number.isFinite(size) || size <= 0 || size > VIDEO_MOST_BYTES) {
    return { error: "Videos can be up to 50 MB. Trim it, or paste a link instead." };
  }
  const supabase = await createSupabase();
  const { data: who } = await supabase.auth.getUser();
  if (!who.user) return { error: "Sign in again to upload a video." };
  const path = `${who.user.id}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[listings] couldn't start a video upload", error);
    return { error: "We couldn't start the upload. Try again, or paste a link instead." };
  }
  return {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_PUBLISHABLE_KEY!,
    bucket: VIDEO_BUCKET,
    path,
    token: data.token,
  };
}

// Step two, once it's there: on the listing, after its photos. Only a file
// that really is in their own folder.
export async function finishListingVideoUpload(key: string, path: string): Promise<{ error?: string }> {
  const found = await ownWithRoom(key);
  if ("error" in found) return found;
  if (!supabaseConfigured || typeof path !== "string" || !STORED.test(path)) return { error: "We couldn't add that video." };
  const supabase = await createSupabase();
  const { data: who } = await supabase.auth.getUser();
  const [folder, name] = path.split("/");
  if (!who.user || who.user.id !== folder) return { error: "We couldn't add that video." };
  const { data: files } = await supabase.storage.from(VIDEO_BUCKET).list(folder, { search: name, limit: 1 });
  if (!files?.some((file) => file.name === name)) return { error: "The upload didn't finish. Try again." };
  const { data: shown } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  await setPhotos(found.me.id, key, [
    ...found.mine.listing.Media,
    { MediaKey: path, MediaURL: shown.publicUrl, Order: 0, MediaCategory: "Video", ShortDescription: "Video" },
  ]);
  refresh();
  return {};
}

// How their listings are laid out on their profile.
export async function setListingsLayout(layout: string): Promise<{ error?: string }> {
  const me = await agent();
  if (!me || !isListingLayout(layout)) return { error: "We couldn't save that." };
  await sql`update accounts set listings_layout = ${layout} where id = ${me.id}`;
  refresh();
  return {};
}

// The listing that leads their profile (the big one, in the featured
// layout): any on their Listings, or none (back to the newest).
export async function featureListing(key: string | null): Promise<{ error?: string }> {
  const me = await agent();
  if (!me || (key !== null && (typeof key !== "string" || key.length > 100))) return { error: "We couldn't save that." };
  await sql`update accounts set featured_listing_key = ${key} where id = ${me.id}`;
  refresh();
  return {};
}
