"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { placeWords } from "@/lib/format";
import { noteImpressions } from "@/lib/feed-rank";
import { importMissing, runImportsAndContinue } from "@/lib/listings/imports";
import { findOnRepliers } from "@/lib/listings/repliers";
import {
  commentSchema,
  ensureDevice,
  fail,
  MAX_COMMENTS_PER_MINUTE,
  nameSchema,
  checkAnchor,
  photoLikeSchema,
  reactionSchema,
  readDevice,
  type ActionResult,
} from "@/lib/engagement";
import type { SpotReaction } from "@/lib/photos";
import { getReel, REEL_PAGE, type FeedPost } from "@/lib/feed";
import { searchHomeKeys } from "@/lib/search";
import { parseFilters } from "@/lib/search-options";
import { homesHere } from "@/lib/send-search";
import { ensureAccountVisitor, findSpot, getPublicIdentity, getVisitor } from "@/lib/public";
import { getTaste } from "@/lib/taste";
import { z } from "zod";
import type { ReactionState } from "@/lib/reactions";

// Counts each browser once per listing, from public pages and share links alike.
export async function recordView(listingKey: string): Promise<void> {
  if (typeof listingKey !== "string" || listingKey.length > 100) return;
  const device = await ensureDevice();
  await sql`
    insert into listing_views (listing_key, device_token)
    select listing_key, ${device} from listings where listing_key = ${listingKey}
    on conflict do nothing`;
}

// Liking or saying anything here takes an account (made right on the page,
// NameGate): signed in, they're in by their account's name, or the one they
// give if it has none yet.
export async function joinPublic(firstName: string): Promise<ActionResult> {
  const account = await getCurrentUser();
  if (!account?.role) return fail("Please sign up or sign in first.");
  if (!account.full_name.trim()) {
    const name = nameSchema.safeParse(firstName);
    if (!name.success) return fail("Please enter your first name.");
    await sql`update accounts set full_name = ${name.data} where id = ${account.id} and full_name = ''`;
    await ensureAccountVisitor({ ...account, full_name: name.data });
  } else {
    await ensureAccountVisitor(account);
  }
  refresh();
  return { ok: true };
}

// Public engagement is on homes still for sale, and on an agent's own deals
// marked Closed (on their profile, a deal done that people still cheer on),
// and only for someone signed in. What's wrong comes back in words.
async function resolveVisitor(
  listingKey: string,
): Promise<Awaited<ReturnType<typeof ensureAccountVisitor>> | string> {
  const [listing] = await sql`
    select 1 from listings where listing_key = ${listingKey}
      and (standard_status = 'Active'
        or (owner_account_id is not null and standard_status = 'Closed'
            and coalesce((data->>'Hidden')::boolean, false) = false))`;
  if (!listing) return "This home isn't taking comments anymore.";
  const account = await getCurrentUser();
  return account?.role ? ensureAccountVisitor(account) : "Please sign up or sign in first.";
}

async function saveReaction(listingKey: string, input: ReactionState): Promise<ActionResult> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return fail("We couldn't save that reaction.");
  const state = parsed.data;
  const visitor = await resolveVisitor(listingKey);
  if (typeof visitor === "string") return fail(visitor);

  if (state.reaction === null) {
    await sql`
      delete from public_reactions
      where listing_key = ${listingKey} and visitor_id = ${visitor.id}`;
  } else {
    await sql`
      insert into public_reactions (listing_key, visitor_id, reaction, liked, disliked)
      values (${listingKey}, ${visitor.id}, ${state.reaction}, ${state.liked}::text[], ${state.disliked}::text[])
      on conflict (listing_key, visitor_id)
      do update set reaction = excluded.reaction, liked = excluded.liked,
        disliked = excluded.disliked, updated_at = now()`;
  }
  return { ok: true };
}

// Saves without reloading the page: each screen shows your reaction right
// away and keeps its place.
export async function reactInStream(listingKey: string, input: ReactionState): Promise<ActionResult> {
  return saveReaction(listingKey, input);
}

async function savePhotoLike(
  listingKey: string,
  mediaKey: string,
  tag: string,
  reaction: SpotReaction,
): Promise<ActionResult> {
  const input = photoLikeSchema.safeParse({ listingKey, mediaKey, tag, reaction });
  if (!input.success) return fail("We couldn't save that.");
  const visitor = await resolveVisitor(listingKey);
  if (typeof visitor === "string") return fail(visitor);
  const spot = await findSpot(listingKey, mediaKey, tag);
  if (!spot) return fail("That photo isn't there anymore.");
  const where = sql`listing_key = ${listingKey} and visitor_id = ${visitor.id} and media_key = ${mediaKey} and tag = ${tag}`;
  // A like replaces a dislike, and the other way around.
  await sql.begin(async (tx) => {
    if (reaction !== "like") await tx`delete from public_photo_likes where ${where}`;
    if (reaction !== "dislike") await tx`delete from public_photo_dislikes where ${where}`;
    if (reaction === "like") {
      await tx`
        insert into public_photo_likes (listing_key, visitor_id, media_key, tag, aspect)
        values (${listingKey}, ${visitor.id}, ${mediaKey}, ${tag}, ${spot.aspect})
        on conflict do nothing`;
    } else if (reaction === "dislike") {
      await tx`
        insert into public_photo_dislikes (listing_key, visitor_id, media_key, tag)
        values (${listingKey}, ${visitor.id}, ${mediaKey}, ${tag})
        on conflict do nothing`;
    }
  });
  return { ok: true };
}

// Liking (or not) something in a photo, "the kitchen", or one of the facts,
// "the price". Saves without reloading the page, so the feed keeps its place.
export async function likePhotoInStream(
  listingKey: string,
  mediaKey: string,
  tag: string,
  reaction: SpotReaction,
): Promise<ActionResult> {
  return savePhotoLike(listingKey, mediaKey, tag, reaction);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function saveComment(
  listingKey: string,
  body: string,
  // What it answers: a comment, or someone's likes on the home ("like:" and
  // their visitor id, as their public profile has it).
  parentId: string | null,
  // A spot in a photo it's about, if any. Replies are about what they answer.
  spot: unknown = null,
  // Started from their own page, about a home they picked there.
  posted = false,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  const visitor = await resolveVisitor(listingKey);
  if (typeof visitor === "string") return fail(visitor);
  const anchor = parentId === null ? await checkAnchor(listingKey, spot) : null;
  if (anchor === false) return fail("That photo isn't there anymore.");

  // Replies go one level deep: on a comment about the same home, or under
  // someone's likes (or pass) on it.
  let parent: string | null = null;
  let replyTo: string | null = null;
  if (parentId !== null) {
    const ref = String(parentId);
    if (ref.startsWith("like:")) {
      const who = ref.slice(5);
      if (!UUID.test(who)) return fail("Those likes aren't there anymore.");
      const [liked] = await sql`
        select 1 from public_reactions where listing_key = ${listingKey} and visitor_id = ${who}::uuid
        union all
        select 1 from public_photo_likes where listing_key = ${listingKey} and visitor_id = ${who}::uuid
        union all
        select 1 from public_photo_dislikes where listing_key = ${listingKey} and visitor_id = ${who}::uuid
        limit 1`;
      if (!liked) return fail("Those likes aren't there anymore.");
      replyTo = who;
    } else {
      const [found] = await sql`
        select 1 from public_comments
        where id::text = ${ref} and listing_key = ${listingKey} and parent_id is null and reply_to_visitor is null`;
      if (!found) return fail("That comment isn't there anymore.");
      parent = ref;
    }
  }

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from public_comments
    where visitor_id = ${visitor.id} and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  await sql`
    insert into public_comments (listing_key, visitor_id, body, parent_id, reply_to_visitor, media_key, spot, posted)
    values (${listingKey}, ${visitor.id}, ${parsed.data}, ${parent}::uuid, ${replyTo}::uuid,
      ${anchor?.mediaKey ?? null}, ${anchor?.tag ?? null}, ${posted && parent === null && replyTo === null})`;
  return { ok: true };
}

async function saveCommentLike(commentId: string, liked: boolean): Promise<ActionResult> {
  if (typeof commentId !== "string" || commentId.length > 64) return fail("That comment isn't there anymore.");
  const [comment] = await sql<{ listing_key: string; visitor_id: string }[]>`
    select listing_key, visitor_id from public_comments where id::text = ${commentId}`;
  if (!comment) return fail("That comment isn't there anymore.");
  const visitor = await resolveVisitor(comment.listing_key);
  if (typeof visitor === "string") return fail(visitor);
  if (liked) {
    await sql`
      insert into public_comment_likes (comment_id, visitor_id)
      values (${commentId}::uuid, ${visitor.id}) on conflict do nothing`;
  } else {
    await sql`
      delete from public_comment_likes where comment_id = ${commentId}::uuid and visitor_id = ${visitor.id}`;
  }
  return { ok: true };
}

// The home page feed keeps its own place and reloads only the home you're
// talking about, so these save without reloading the page under you.
export async function commentInReel(
  listingKey: string,
  body: string,
  _sharePublicly?: boolean,
  parentId: string | null = null,
  spot: unknown = null,
): Promise<ActionResult> {
  return saveComment(listingKey, body, parentId, spot);
}

// A post from someone's own page: a few words about a home they picked
// there, which goes on their page, in their followers' feeds and in the
// home's conversation.
export async function postAboutHome(listingKey: string, body: string): Promise<ActionResult> {
  if (typeof listingKey !== "string" || listingKey.length > 100) return fail("That home isn't for sale anymore.");
  if (typeof body !== "string" || !body.trim()) return fail("Say something about the home first.");
  // A home found by its address that isn't here yet is brought in first; its
  // photos are scanned afterwards.
  if ((await getCurrentUser())?.role && (await importMissing([listingKey]))) after(() => runImportsAndContinue());
  const result = await saveComment(listingKey, body.trim(), null, null, true);
  if (result.ok) refresh();
  return result;
}

// Cards that were in front of them in their feed just now ("home:<key>" or
// "post:<id>"): noted, so next time leads with what they haven't seen.
export async function noteSeen(items: unknown): Promise<void> {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return;
  const ids = [...new Set(items.filter((item): item is string => typeof item === "string" && /^(home|post):[\w-]{1,100}$/.test(item)))];
  const account = await getCurrentUser();
  if (!account?.role || ids.length === 0) return;
  const visitor = await ensureAccountVisitor(account);
  await noteImpressions(visitor.id, ids);
}

// A home saved, to come back to (or taken off the list): theirs alone. One
// found by its address that isn't here yet is brought in first, as a post's is.
export async function saveHome(listingKey: string, saved: boolean): Promise<ActionResult> {
  if (typeof listingKey !== "string" || listingKey.length > 100 || typeof saved !== "boolean") {
    return fail("We couldn't save that home.");
  }
  const account = await getCurrentUser();
  if (!account?.role) return fail("Please sign up or sign in first.");
  const visitor = await ensureAccountVisitor(account);
  if (!saved) {
    await sql`delete from saved_homes where visitor_id = ${visitor.id} and listing_key = ${listingKey}`;
    refresh();
    return { ok: true };
  }
  if (await importMissing([listingKey])) after(() => runImportsAndContinue());
  const kept = await sql`
    insert into saved_homes (visitor_id, listing_key)
    select ${visitor.id}, listing_key from listings where listing_key = ${listingKey} and standard_status = 'Active'
    on conflict do nothing
    returning listing_key`;
  if (kept.length === 0) {
    const [already] = await sql`
      select 1 from saved_homes where visitor_id = ${visitor.id} and listing_key = ${listingKey}`;
    if (!already) return fail("That home isn't for sale anymore.");
  }
  refresh();
  return { ok: true };
}

export type HomeToPost = {
  key: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  photo: string | null;
};

// Homes for sale to post about, by address, city, zip or MLS number: a few.
export async function findHomesToPost(query: string): Promise<HomeToPost[]> {
  if (typeof query !== "string") return [];
  const text = query.trim().slice(0, 100);
  // (Two letters at least; commas alone are nothing to look for.)
  if (placeWords(text).join(" ").length < 2) return [];
  const MOST = 6;
  // (Of the listings people added themselves, only your own.)
  const me = (await getCurrentUser())?.id ?? null;
  const here = await homesHere(text, me, [], MOST);
  // Not enough here: homes for sale found by that address elsewhere, for
  // someone signed in. One is brought in when it's posted about.
  const have = new Set(here.map((home) => home.ListingKey));
  const elsewhere =
    here.length < MOST && (await getCurrentUser())?.role
      ? (await findOnRepliers(text, MOST)).filter((home) => !have.has(home.ListingKey))
      : [];
  return [...here, ...elsewhere].slice(0, MOST).map((data) => ({
    key: data.ListingKey,
    address: data.UnparsedAddress,
    city: data.City,
    price: data.ListPrice,
    beds: data.BedroomsTotal,
    baths: data.BathroomsTotalInteger,
    photo: [...data.Media].sort((a, b) => a.Order - b.Order)[0]?.MediaURL ?? null,
  }));
}

export async function likeCommentInReel(commentId: string, liked: boolean): Promise<ActionResult> {
  return saveCommentLike(commentId, liked);
}

async function reelViewer() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor } = await getPublicIdentity(viewer, device);
  return { viewer, device, taste: await getTaste(visitor?.id) };
}

const keyList = z.array(z.string().max(100)).max(1000);

// The next few homes in the feed, after the ones already shown.
export async function loadReel(shown: string[]): Promise<FeedPost[]> {
  const exclude = keyList.safeParse(shown);
  if (!exclude.success) return [];
  const { viewer, device, taste } = await reelViewer();
  return getReel(viewer, device, taste, { exclude: exclude.data });
}

// One home again, with its latest comments and likes.
export async function reloadReelHome(listingKey: string): Promise<FeedPost | null> {
  if (typeof listingKey !== "string" || listingKey.length > 100) return null;
  const { viewer, device, taste } = await reelViewer();
  const [post] = await getReel(viewer, device, taste, { only: [listingKey], limit: 1 });
  return post ?? null;
}

// Opening the activity page clears the bell from the next page on. It doesn't
// refresh, so what's new stays highlighted while you read it.
export async function markActivitySeen(): Promise<void> {
  const account = await getCurrentUser();
  const visitor = account?.role ? await ensureAccountVisitor(account) : await getVisitor(await readDevice());
  if (!visitor) return;
  await sql`update visitors set activity_seen_at = now() where id = ${visitor.id}`;
}

// The next few homes a map search found, after the ones already shown, in the
// search's own order: the full-screen feed opened from the map.
export async function loadSearchReel(query: string, shown: string[]): Promise<FeedPost[]> {
  const exclude = keyList.safeParse(shown);
  if (typeof query !== "string" || query.length > 1000 || !exclude.success) return [];
  const filters = parseFilters(Object.fromEntries(new URLSearchParams(query)));
  const { viewer, device, taste } = await reelViewer();
  const skip = new Set(exclude.data);
  const next = (await searchHomeKeys(filters))
    .filter((key) => !skip.has(key))
    .slice(0, REEL_PAGE);
  return next.length ? getReel(viewer, device, taste, { only: next, limit: next.length }) : [];
}
