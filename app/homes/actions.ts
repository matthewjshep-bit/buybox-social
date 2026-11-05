"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
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
import { aspectOfTag, isTagIn, thingOf } from "@/lib/photos";
import { getReel, REEL_PAGE, type FeedPost } from "@/lib/feed";
import { searchHomes } from "@/lib/search";
import { parseFilters } from "@/lib/search-options";
import { ensureAccountVisitor, getListingPhoto, getPublicIdentity, getVisitor } from "@/lib/public";
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

export async function joinPublic(firstName: string): Promise<ActionResult> {
  const name = nameSchema.safeParse(firstName);
  if (!name.success) return fail("Please enter your first name.");
  // Signed in without a name yet: it's their account's name from now on.
  const account = await getCurrentUser();
  if (account?.role) {
    await sql`update accounts set full_name = ${name.data} where id = ${account.id} and full_name = ''`;
    await ensureAccountVisitor({ ...account, full_name: account.full_name || name.data });
    refresh();
    return { ok: true };
  }
  const device = await ensureDevice();
  await sql`
    insert into visitors (device_token, first_name) values (${device}, ${name.data})
    on conflict (device_token) do update set first_name = excluded.first_name`;
  refresh();
  return { ok: true };
}

// Public engagement only applies to listings that are still active.
async function resolveVisitor(listingKey: string) {
  const [listing] = await sql`
    select 1 from listings where listing_key = ${listingKey} and standard_status = 'Active'`;
  if (!listing) return null;
  const account = await getCurrentUser();
  if (account?.role) return ensureAccountVisitor(account);
  return getVisitor(await readDevice());
}

async function saveReaction(listingKey: string, input: ReactionState): Promise<ActionResult> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return fail("We couldn't save that reaction.");
  const state = parsed.data;
  const visitor = await resolveVisitor(listingKey);
  if (!visitor) return fail("Please add your name first.");

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

export async function setPublicReaction(listingKey: string, input: ReactionState): Promise<ActionResult> {
  const result = await saveReaction(listingKey, input);
  if (result.ok) refresh();
  return result;
}

// The home page feed keeps its own place and shows your reaction right away,
// so it saves without reloading the page underneath you.
export async function reactInStream(listingKey: string, input: ReactionState): Promise<ActionResult> {
  return saveReaction(listingKey, input);
}

async function savePhotoLike(listingKey: string, mediaKey: string, tag: string, liked: boolean): Promise<ActionResult> {
  const input = photoLikeSchema.safeParse({ listingKey, mediaKey, tag, liked });
  if (!input.success) return fail("We couldn't save that like.");
  const visitor = await resolveVisitor(listingKey);
  if (!visitor) return fail("Please add your name first.");
  const photo = await getListingPhoto(listingKey, mediaKey);
  if (!photo || !isTagIn(photo, tag)) return fail("That photo isn't there anymore.");
  if (liked) {
    await sql`
      insert into public_photo_likes (listing_key, visitor_id, media_key, tag, aspect)
      values (${listingKey}, ${visitor.id}, ${mediaKey}, ${tag}, ${aspectOfTag(photo, thingOf(photo, tag) ?? tag)})
      on conflict do nothing`;
  } else {
    await sql`
      delete from public_photo_likes
      where listing_key = ${listingKey} and visitor_id = ${visitor.id} and media_key = ${mediaKey} and tag = ${tag}`;
  }
  return { ok: true };
}

// Liking something in a photo: "the kitchen", "the marble counters".
export async function likePhoto(listingKey: string, mediaKey: string, tag: string, liked: boolean): Promise<ActionResult> {
  const result = await savePhotoLike(listingKey, mediaKey, tag, liked);
  if (result.ok) refresh();
  return result;
}

// The same, from the home page stream, which keeps its place.
export async function likePhotoInStream(
  listingKey: string,
  mediaKey: string,
  tag: string,
  liked: boolean,
): Promise<ActionResult> {
  return savePhotoLike(listingKey, mediaKey, tag, liked);
}

async function saveComment(
  listingKey: string,
  body: string,
  parentId: string | null,
  // A spot in a photo it's about, if any. Replies are about their comment's.
  spot: unknown = null,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  const visitor = await resolveVisitor(listingKey);
  if (!visitor) return fail("Please add your name first.");
  const anchor = parentId === null ? await checkAnchor(listingKey, spot) : null;
  if (anchor === false) return fail("That photo isn't there anymore.");

  // Replies go one level deep, on a comment about the same home.
  if (parentId !== null) {
    const [parent] = await sql`
      select 1 from public_comments
      where id::text = ${String(parentId)} and listing_key = ${listingKey} and parent_id is null`;
    if (!parent) return fail("That comment isn't there anymore.");
  }

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from public_comments
    where visitor_id = ${visitor.id} and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  await sql`
    insert into public_comments (listing_key, visitor_id, body, parent_id, media_key, spot)
    values (${listingKey}, ${visitor.id}, ${parsed.data}, ${parentId}::uuid,
      ${anchor?.mediaKey ?? null}, ${anchor?.tag ?? null})`;
  return { ok: true };
}

export async function addPublicComment(
  listingKey: string,
  body: string,
  // Only private share links can share comments publicly; here it's ignored.
  _sharePublicly?: boolean,
  parentId: string | null = null,
  spot: unknown = null,
): Promise<ActionResult> {
  const result = await saveComment(listingKey, body, parentId, spot);
  if (result.ok) refresh();
  return result;
}

async function saveCommentLike(commentId: string, liked: boolean): Promise<ActionResult> {
  if (typeof commentId !== "string" || commentId.length > 64) return fail("That comment isn't there anymore.");
  const [comment] = await sql<{ listing_key: string; visitor_id: string }[]>`
    select listing_key, visitor_id from public_comments where id::text = ${commentId}`;
  if (!comment) return fail("That comment isn't there anymore.");
  const visitor = await resolveVisitor(comment.listing_key);
  if (!visitor) return fail("Please add your name first.");
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

export async function likePublicComment(commentId: string, liked: boolean): Promise<ActionResult> {
  const result = await saveCommentLike(commentId, liked);
  if (result.ok) refresh();
  return result;
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
  const next = (await searchHomes(filters, null))
    .map((result) => result.listing.ListingKey)
    .filter((key) => !skip.has(key))
    .slice(0, REEL_PAGE);
  return next.length ? getReel(viewer, device, taste, { only: next, limit: next.length }) : [];
}
