import { sql } from "./db";
import type { Listing } from "./listings/types";
import { aspectOfTag, isPointTag, mediaKeyOf, tagNameIn } from "./photos";
import { NO_REACTION, type AspectCounts, type ReactionState } from "./reactions";

// Someone's public page: what they've liked, passed on and said, in public.
// Their private chats with agents never appear here.

export type ProfileHome = {
  listing: Listing;
  state: ReactionState;
  // Things they liked in its photos, in the order they liked them.
  tags: string[];
  // The photo of the latest thing they liked, else the home's first photo.
  cover: string | null;
  at: string;
};

export type ProfileComment = { id: string; listing: Listing; body: string; at: string; isReply: boolean };

export async function getProfile(visitorId: string) {
  const [visitor] = await sql<{ id: string; first_name: string; created_at: Date }[]>`
    select id, first_name, created_at from visitors where id::text = ${visitorId}`;
  if (!visitor) return null;

  const [reactions, photoLikes, comments] = await Promise.all([
    sql<(ReactionState & { listing_key: string; data: Listing; at: Date })[]>`
      select r.listing_key, r.reaction, r.liked, r.disliked, r.updated_at as at, l.data
      from public_reactions r join listings l on l.listing_key = r.listing_key
      where r.visitor_id = ${visitor.id}`,
    sql<{ listing_key: string; media_key: string; tag: string; at: Date; data: Listing }[]>`
      select pl.listing_key, pl.media_key, pl.tag, pl.created_at as at, l.data
      from public_photo_likes pl join listings l on l.listing_key = pl.listing_key
      where pl.visitor_id = ${visitor.id}
      order by pl.created_at`,
    sql<{ id: string; body: string; created_at: Date; parent_id: string | null; data: Listing }[]>`
      select c.id, c.body, c.created_at, c.parent_id, l.data
      from public_comments c join listings l on l.listing_key = c.listing_key
      where c.visitor_id = ${visitor.id}
      order by c.created_at desc
      limit 100`,
  ]);

  const homes = new Map<string, ProfileHome>();
  const home = (listing: Listing, at: Date) => {
    const entry = homes.get(listing.ListingKey) ?? {
      listing,
      state: NO_REACTION,
      tags: [],
      cover: listing.Media[0]?.MediaURL ?? null,
      at: at.toISOString(),
    };
    if (at.toISOString() > entry.at) entry.at = at.toISOString();
    homes.set(listing.ListingKey, entry);
    return entry;
  };
  for (const r of reactions) home(r.data, r.at).state = { reaction: r.reaction, liked: r.liked, disliked: r.disliked };
  // Things liked in photos, and what that says about their taste.
  const loved = new Map<string, number>();
  const likes: AspectCounts = {};
  const passes: AspectCounts = {};
  for (const like of photoLikes) {
    const entry = home(like.data, like.at);
    // A spot reads as the thing it's on ("the front door").
    like.tag = tagNameIn(like.data, like.media_key, like.tag);
    entry.tags.push(like.tag);
    const photo = like.data.Media.find((m) => mediaKeyOf(m) === like.media_key);
    if (photo) entry.cover = photo.MediaURL;
    if (!isPointTag(like.tag)) loved.set(like.tag, (loved.get(like.tag) ?? 0) + 1);
  }
  for (const entry of homes.values()) {
    const aspects = new Set(entry.state.liked);
    for (const like of photoLikes.filter((l) => l.listing_key === entry.listing.ListingKey)) {
      const photo = like.data.Media.find((m) => mediaKeyOf(m) === like.media_key);
      const aspect = photo && aspectOfTag(photo, like.tag);
      if (aspect) aspects.add(aspect);
    }
    for (const a of aspects) likes[a] = (likes[a] ?? 0) + 1;
    for (const a of entry.state.disliked) passes[a] = (passes[a] ?? 0) + 1;
  }

  const all = [...homes.values()].sort((a, b) => b.at.localeCompare(a.at));
  return {
    id: visitor.id,
    name: visitor.first_name,
    since: visitor.created_at.toISOString(),
    liked: all.filter((h) => h.state.reaction === "like" || (!h.state.reaction && h.tags.length > 0)),
    passed: all.filter((h) => h.state.reaction === "dislike"),
    comments: comments.map(
      (c): ProfileComment => ({
        id: c.id,
        listing: c.data,
        body: c.body,
        at: c.created_at.toISOString(),
        isReply: c.parent_id !== null,
      }),
    ),
    taste: { likes, passes, loved: [...loved].sort((a, b) => b[1] - a[1]).slice(0, 8) },
  };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
