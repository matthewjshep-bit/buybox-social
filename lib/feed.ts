import type { Account } from "./auth";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import {
  getPublicIdentity,
  toTotals,
  totalsForListing,
  type AspectTotals,
  type Buzz,
  type TotalsRow,
} from "./public";
import { NO_PHOTO_LIKES, tagNameIn, type PhotoLikes } from "./photos";
import { NO_REACTION, publicSideOf, type ReactionState } from "./reactions";
import { matchTaste, type Taste } from "./taste";
import { getPublicPhotoLikes, getPublicTimelines, type TimelineItem } from "./timeline";

// The home page, for everyone: a full-screen feed of homes, one after another,
// for as long as you scroll. Homes you haven't reacted to come first, best
// match first; then the ones people are talking about, latest first.

// How many homes each load brings.
export const REEL_PAGE = 6;

export type Headline =
  | { kind: "react"; who: "public" | "client"; name: string; state: ReactionState; at: string }
  | { kind: "react"; who: "anonymous"; state: ReactionState; at: string }
  | { kind: "comment"; who: "public" | "client"; name: string; at: string }
  | { kind: "comment"; who: "anonymous"; at: string }
  | { kind: "photo"; who: "public" | "client"; name: string; tag: string; at: string }
  | { kind: "photo"; who: "anonymous"; tag: string; at: string }
  | { kind: "sent"; who: "you" | "anonymous"; at: string };


export type FeedPost = {
  listing: Listing;
  headline: Headline | null;
  likes: number;
  likers: string[];
  dislikes: number;
  aspects: AspectTotals;
  publicComments: number;
  privateComments: number;
  // Everything said and liked, oldest first.
  timeline: TimelineItem[];
  photoLikes: PhotoLikes;
  mine: ReactionState;
  buzz: Buzz;
  // Why this home fits the viewer's taste, if it does.
  reasons: string[];
};

type Row = { data: Listing } & TotalsRow & {
  h_kind: "react" | "comment" | "photo" | "sent" | null;
  h_state: ReactionState;
  h_name: string | null;
  h_tag: string | null;
  h_media: string | null;
  h_source: "public" | "client" | "private" | "self" | null;
  h_at: Date | null;
};

export async function getReel(
  viewer: Account | null,
  deviceToken: string | undefined,
  taste: Taste | null,
  // Homes already shown, or (for one home's page) exactly which homes.
  { exclude = [], only, limit = REEL_PAGE }: { exclude?: string[]; only?: string[]; limit?: number } = {},
): Promise<FeedPost[]> {
  const { visitor } = await getPublicIdentity(viewer, deviceToken);
  const visitorId = visitor?.id ?? null;
  // Only an agent sees their own clients by name. Everyone else's private
  // activity shows anonymously, and only its likes: a private dislike never
  // becomes a headline that could put someone off a home.
  const agentId = viewer?.role === "agent" ? viewer.id : null;
  const wanted = only ?? [];

  const [rows, mine] = await Promise.all([
    sql<Row[]>`
      select l.data, t.*, h.kind as h_kind, h.name as h_name, h.source as h_source, h.at as h_at, h.tag as h_tag, h.media as h_media,
        json_build_object('reaction', h.reaction, 'liked', h.liked, 'disliked', h.disliked) as h_state
      from listings l
      cross join lateral (${totalsForListing()}) t
      left join lateral (
        select * from (
          select 'react' as kind, r.reaction, r.liked, r.disliked, vi.first_name as name,
            'public' as source, r.updated_at as at, null::text as tag, null::text as media
          from public_reactions r join visitors vi on vi.id = r.visitor_id
          where r.listing_key = l.listing_key
          union all
          select 'comment', null, '{}'::text[], '{}'::text[], vi.first_name, 'public', c.created_at, null, null
          from public_comments c join visitors vi on vi.id = c.visitor_id
          where c.listing_key = l.listing_key
          union all
          select 'photo', null, '{}'::text[], '{}'::text[], vi.first_name, 'public', pl.created_at, pl.tag, pl.media_key
          from public_photo_likes pl join visitors vi on vi.id = pl.visitor_id
          where pl.listing_key = l.listing_key
          union all
          select 'photo', null, '{}'::text[], '{}'::text[],
            case when s.agent_id = ${agentId}::uuid then p.first_name end,
            case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end, pl.created_at, pl.tag, pl.media_key
          from photo_likes pl
          join participants p on p.id = pl.participant_id
          join shares s on s.id = pl.share_id
          where pl.listing_key = l.listing_key
          union all
          select 'react', r.reaction, r.liked, r.disliked,
            case when s.agent_id = ${agentId}::uuid then p.first_name end,
            case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end, r.updated_at, null, null
          from reactions r
          join participants p on p.id = r.participant_id
          join shares s on s.id = r.share_id
          where r.listing_key = l.listing_key
            and (s.agent_id = ${agentId}::uuid or r.reaction = 'like' or cardinality(r.liked) > 0)
          union all
          select 'comment', null, '{}'::text[], '{}'::text[],
            case when s.agent_id = ${agentId}::uuid then p.first_name end,
            case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end, c.created_at, null, null
          from comments c
          join participants p on p.id = c.participant_id
          join shares s on s.id = c.share_id
          where c.listing_key = l.listing_key
          union all
          select 'sent', null, '{}'::text[], '{}'::text[], null,
            case when s.agent_id = ${agentId}::uuid then 'self' else 'private' end, s.created_at, null, null
          from share_listings sl join shares s on s.id = sl.share_id
          where sl.listing_key = l.listing_key
        ) events
        order by at desc
        limit 1
      ) h on true
      where (l.standard_status = 'Active' and ${only === undefined})
        or l.listing_key in ${sql(wanted.length ? wanted : [""])}
      order by t.this_week desc, l.data->>'OnMarketDate' desc nulls last, l.listing_key
      limit 300`,
    visitorId
      ? sql<({ listing_key: string } & ReactionState)[]>`
          select listing_key, reaction, liked, disliked from public_reactions
          where visitor_id = ${visitorId}`
      : Promise.resolve([]),
  ]);

  const mineByKey = new Map(
    mine.map((m) => [m.listing_key, { reaction: m.reaction, liked: m.liked, disliked: m.disliked }]),
  );
  const scored = rows.map((row) => {
    const totals = toTotals(row);
    return { row, totals, match: matchTaste(taste, row.data, totals.aspects.liked) };
  });

  // Homes you haven't reacted to, best match first (the sort is stable, so
  // equal matches keep the busiest-this-week, newest-first order); then the
  // rest, latest activity first.
  const skip = new Set(exclude);
  const unreacted = scored
    .filter(({ row }) => !mineByKey.has(row.data.ListingKey))
    .sort((a, b) => b.match.score - a.match.score);
  const reacted = scored
    .filter(({ row }) => mineByKey.has(row.data.ListingKey))
    .sort((a, b) => (b.totals.buzz.lastActivityAt ?? "").localeCompare(a.totals.buzz.lastActivityAt ?? ""));
  const ordered = only
    ? only.flatMap((key) => scored.filter(({ row }) => row.data.ListingKey === key))
    : [...unreacted, ...reacted].filter(({ row }) => !skip.has(row.data.ListingKey));
  const page = ordered.slice(0, limit);
  const keys = page.map(({ row }) => row.data.ListingKey);
  if (keys.length === 0) return [];

  const listings = page.map(({ row }) => sortedMedia(row.data));
  const [likers, likeCounts, timelines, photoLikes] = await Promise.all([
    sql<{ listing_key: string; first_name: string }[]>`
      select listing_key, first_name from (
        select r.listing_key, vi.first_name,
          row_number() over (partition by r.listing_key order by r.updated_at desc) as n
        from public_reactions r join visitors vi on vi.id = r.visitor_id
        where r.reaction = 'like' and r.listing_key in ${sql(keys)}) x
      where n <= 2`,
    // Everyone who liked the home, or anything in its photos, once each.
    sql<{ listing_key: string; n: number }[]>`
      select listing_key, count(*)::int as n from (
        select listing_key, 'v' || visitor_id as who from public_reactions
        where reaction = 'like' and listing_key in ${sql(keys)}
        union
        select listing_key, 'p' || participant_id from reactions
        where reaction = 'like' and listing_key in ${sql(keys)}
        union
        select listing_key, 'v' || visitor_id from public_photo_likes where listing_key in ${sql(keys)}
        union
        select listing_key, 'p' || participant_id from photo_likes where listing_key in ${sql(keys)}) x
      group by listing_key`,
    getPublicTimelines(listings, visitorId),
    getPublicPhotoLikes(keys, visitorId),
  ]);

  const toPost = ({ row, totals, match }: (typeof scored)[number]): FeedPost => {
    const key = row.data.ListingKey;
    return {
      listing: sortedMedia(row.data),
      headline: toHeadline(row),
      likes: likeCounts.find((count) => count.listing_key === key)?.n ?? 0,
      likers: likers.filter((l) => l.listing_key === key).map((l) => l.first_name),
      dislikes: totals.publicTotals.dislikes,
      aspects: totals.aspects,
      publicComments: totals.publicTotals.comments,
      privateComments: totals.privateTotals.comments,
      timeline: timelines.get(key) ?? [],
      photoLikes: photoLikes.get(key) ?? NO_PHOTO_LIKES,
      mine: mineByKey.get(key) ?? NO_REACTION,
      buzz: totals.buzz,
      reasons: match.reasons,
    };
  };

  return page.map(toPost);
}

const sortedMedia = (listing: Listing): Listing => ({
  ...listing,
  Media: [...listing.Media].sort((a, b) => a.Order - b.Order),
});

function toHeadline(row: Row): Headline | null {
  if (!row.h_kind || !row.h_at) return null;
  const at = row.h_at.toISOString();
  if (row.h_kind === "sent") return { kind: "sent", who: row.h_source === "self" ? "you" : "anonymous", at };
  const named = (row.h_source === "public" || row.h_source === "client") && row.h_name;
  if (row.h_kind === "photo") {
    // A spot reads as the thing it's on ("the front door").
    const tag = tagNameIn(row.data, row.h_media ?? "", row.h_tag!);
    return named
      ? { kind: "photo", who: row.h_source as "public" | "client", name: row.h_name!, tag, at }
      : { kind: "photo", who: "anonymous", tag, at };
  }
  if (row.h_kind === "comment") {
    return named
      ? { kind: "comment", who: row.h_source as "public" | "client", name: row.h_name!, at }
      : { kind: "comment", who: "anonymous", at };
  }
  if (named) return { kind: "react", who: row.h_source as "public" | "client", name: row.h_name!, state: row.h_state, at };
  const shown = publicSideOf(row.h_state);
  return shown ? { kind: "react", who: "anonymous", state: shown, at } : null;
}

// For an agent's link, where there's no feed query: the latest thing in the
// home's own thread.
export function headlineFromTimeline(items: TimelineItem[]): Headline | null {
  const last = items.at(-1);
  if (!last) return null;
  if (last.kind === "comment") return { kind: "comment", who: "public", name: last.name, at: last.at };
  if (!last.state.reaction && last.photos.length) {
    return { kind: "photo", who: "public", name: last.name, tag: last.photos.at(-1)!.tag, at: last.at };
  }
  return { kind: "react", who: "public", name: last.name, state: last.state, at: last.at };
}
