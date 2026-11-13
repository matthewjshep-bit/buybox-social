import type { Account } from "./auth";
import { sql } from "./db";
import { getFollowedIds } from "./follows";
import type { Listing } from "./listings/types";
import {
  getPublicIdentity,
  toTotals,
  totalsForListing,
  type AspectTotals,
  type Buzz,
  type TotalsRow,
} from "./public";
import { FACTS, NO_PHOTO_LIKES, tagNameIn, type PhotoLikes } from "./photos";
import { NO_REACTION, publicSideOf, type Aspect, type ReactionState, type Sentiment } from "./reactions";
import { matchTaste, type Taste } from "./taste";
import { clipWords, TICKER_EVENTS, type TickerEvent } from "./ticker";
import { getPublicPhotoLikes, getPublicTimelines, type TimelineItem } from "./timeline";

export type { TickerEvent } from "./ticker";

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
  // `mediaKey`: the photo it's in, when known.
  | { kind: "photo"; who: "public" | "client"; name: string; tag: string; at: string; mediaKey?: string }
  | { kind: "photo"; who: "anonymous"; tag: string; at: string; mediaKey?: string }
  | { kind: "sent"; who: "you" | "anonymous"; at: string };


export type FeedPost = {
  listing: Listing;
  headline: Headline | null;
  likes: number;
  // The latest few who liked it, by first name, never the viewer (the reel
  // says "you" from what you've just done).
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
  // On an agent's one-home link: their greeting and note, in place of the description.
  greeting?: string;
  note?: string;
  // Everyone on an agent's link, by first name.
  members?: string[];
  // What people did lately, newest first, for the line above the price:
  // already only what this viewer may see.
  events?: TickerEvent[];
};

type EventRow = {
  listing_key: string;
  kind: "reaction" | "comment" | "private-comment" | "photo-like" | "sent";
  id: string;
  name: string | null;
  source: "public" | "client" | "private" | "self";
  at: Date;
  media_key: string | null;
  tag: string | null;
  body: string | null;
  comment_id: string | null;
  profile_id: string | null;
  reaction: Sentiment | null;
  liked: Aspect[];
  disliked: Aspect[];
  mine: boolean;
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

  const followed = [...(await getFollowedIds(visitorId))];
  const [rows, mine, followedLikes] = await Promise.all([
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
    // The homes people they follow have liked, in public, and when last.
    followed.length
      ? sql<{ listing_key: string; at: Date }[]>`
          select listing_key, max(at) as at from (
            select listing_key, updated_at as at from public_reactions
            where visitor_id in ${sql(followed)} and (reaction = 'like' or cardinality(liked) > 0)
            union all
            select listing_key, created_at from public_photo_likes where visitor_id in ${sql(followed)}
          ) liked
          group by listing_key`
      : Promise.resolve([]),
  ]);
  const followedLiked = new Map(followedLikes.map((row) => [row.listing_key, row.at.getTime()]));

  const mineByKey = new Map(
    mine.map((m) => [m.listing_key, { reaction: m.reaction, liked: m.liked, disliked: m.disliked }]),
  );
  const scored = rows.map((row) => {
    const totals = toTotals(row);
    return { row, totals, match: matchTaste(taste, row.data, totals.aspects.liked) };
  });

  // Homes you haven't reacted to: first those people you follow have liked,
  // most recently liked first; then best match first (the sort is stable, so
  // equal matches keep the busiest-this-week, newest-first order). Then the
  // rest, latest activity first.
  const skip = new Set(exclude);
  const unreacted = scored
    .filter(({ row }) => !mineByKey.has(row.data.ListingKey))
    .sort(
      (a, b) =>
        (followedLiked.get(b.row.data.ListingKey) ?? 0) - (followedLiked.get(a.row.data.ListingKey) ?? 0) ||
        b.match.score - a.match.score,
    );
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
  const [likers, likeCounts, timelines, photoLikes, events] = await Promise.all([
    sql<{ listing_key: string; first_name: string }[]>`
      select listing_key, first_name from (
        select r.listing_key, vi.first_name,
          row_number() over (partition by r.listing_key order by r.updated_at desc) as n
        from public_reactions r join visitors vi on vi.id = r.visitor_id
        where r.reaction = 'like' and r.listing_key in ${sql(keys)}
          and r.visitor_id is distinct from ${visitorId}::uuid) x
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
    // The latest few things done on each home, for the line above the price,
    // by the same rules as the headline: strangers' private activity without
    // a name and only its likes (an agent's own clients by name, to them); a
    // private comment's words only when its author shared them, and its spot
    // never. No dislikes or passes at all: here it's who liked what.
    sql<EventRow[]>`
      select * from (
        select e.*, row_number() over (
          partition by e.listing_key
          -- (What people they follow did is kept, whatever else came since.)
          order by coalesce(e.profile_id in ${sql(followed.length ? followed : [""])}, false) desc, e.at desc, e.id
        ) as n
        from (
          select r.listing_key, 'reaction' as kind, md5('pr:' || r.listing_key || ':' || r.visitor_id) as id,
            vi.first_name as name, 'public' as source, r.updated_at as at, null::text as media_key,
            null::text as tag, null::text as body, null::text as comment_id, r.visitor_id::text as profile_id,
            r.reaction, r.liked, r.disliked, r.visitor_id = ${visitorId}::uuid as mine
          from public_reactions r join visitors vi on vi.id = r.visitor_id
          where r.listing_key in ${sql(keys)} and (r.reaction = 'like' or cardinality(r.liked) > 0)
          union all
          select c.listing_key, 'comment', 'c:' || c.id, vi.first_name, 'public', c.created_at, c.media_key,
            c.spot, c.body, c.id::text, c.visitor_id::text, null, '{}'::text[], '{}'::text[],
            c.visitor_id = ${visitorId}::uuid
          from public_comments c join visitors vi on vi.id = c.visitor_id
          -- (Replies read as part of what they answer, in the comments, not on their own.)
          where c.listing_key in ${sql(keys)} and c.parent_id is null and c.reply_to_visitor is null
          union all
          select pl.listing_key, 'photo-like',
            md5('pl:' || pl.listing_key || ':' || pl.visitor_id || ':' || pl.media_key || ':' || pl.tag),
            vi.first_name, 'public', pl.created_at, pl.media_key, pl.tag, null, null, pl.visitor_id::text,
            null, '{}'::text[], '{}'::text[], pl.visitor_id = ${visitorId}::uuid
          from public_photo_likes pl join visitors vi on vi.id = pl.visitor_id
          where pl.listing_key in ${sql(keys)}
          union all
          select pl.listing_key, 'photo-like',
            md5('xl:' || pl.share_id || ':' || pl.participant_id || ':' || pl.media_key || ':' || pl.tag),
            case when s.agent_id = ${agentId}::uuid then p.first_name end,
            case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end,
            pl.created_at, pl.media_key, pl.tag, null, null, null, null, '{}'::text[], '{}'::text[], false
          from photo_likes pl
          join participants p on p.id = pl.participant_id
          join shares s on s.id = pl.share_id
          where pl.listing_key in ${sql(keys)}
          union all
          select r.listing_key, 'reaction', md5('xr:' || r.share_id || ':' || r.participant_id || ':' || r.listing_key),
            case when s.agent_id = ${agentId}::uuid then p.first_name end,
            case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end,
            r.updated_at, null, null, null, null, null, r.reaction, r.liked, r.disliked, false
          from reactions r
          join participants p on p.id = r.participant_id
          join shares s on s.id = r.share_id
          where r.listing_key in ${sql(keys)} and (r.reaction = 'like' or cardinality(r.liked) > 0)
          union all
          select c.listing_key,
            case when s.agent_id = ${agentId}::uuid or c.shared_publicly then 'comment' else 'private-comment' end,
            md5('xc:' || c.id),
            case when s.agent_id = ${agentId}::uuid then p.first_name end,
            case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end,
            c.created_at,
            case when s.agent_id = ${agentId}::uuid then c.media_key end,
            case when s.agent_id = ${agentId}::uuid then c.spot end,
            case when s.agent_id = ${agentId}::uuid or c.shared_publicly then c.body end,
            case when s.agent_id = ${agentId}::uuid or c.shared_publicly then c.id::text end,
            null, null, '{}'::text[], '{}'::text[], false
          from comments c
          join participants p on p.id = c.participant_id
          join shares s on s.id = c.share_id
          where c.listing_key in ${sql(keys)}
          union all
          select sl.listing_key, 'sent', md5('s:' || sl.share_id || ':' || sl.listing_key), null,
            case when s.agent_id = ${agentId}::uuid then 'self' else 'private' end, s.created_at,
            null, null, null, null, null, null, '{}'::text[], '{}'::text[], false
          from share_listings sl join shares s on s.id = sl.share_id
          where sl.listing_key in ${sql(keys)}
        ) e
      ) x
      where n <= ${TICKER_EVENTS}
      order by listing_key, at desc, id`,
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
      events: toEvents(
        events.filter((event) => event.listing_key === key),
        new Set(followed),
      ),
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
    const mediaKey = row.h_media ?? undefined;
    return named
      ? { kind: "photo", who: row.h_source as "public" | "client", name: row.h_name!, tag, at, mediaKey }
      : { kind: "photo", who: "anonymous", tag, at, mediaKey };
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// One home's recent activity as the page gets it. What you did or said is
// "You" (your likes keyed so the one you just made matches what comes back),
// and a home an agent sent is "You" to them, with their face in ink. Several
// strangers' plain likes this week fold into one: "4 buyers liked this home".
function toEvents(rows: EventRow[], followed: Set<string>): TickerEvent[] {
  const events: TickerEvent[] = [];
  const folded: TickerEvent[] = [];
  for (const row of rows) {
    const at = row.at.toISOString();
    const named = (row.source === "public" || row.source === "client") && row.name;
    const who: TickerEvent["who"] =
      row.mine
        ? { tone: "you", name: null }
        : named
          ? {
              tone: row.source === "client" ? "client" : "person",
              name: row.name,
              ...(row.source === "public" && row.profile_id && { profileId: row.profile_id }),
              ...(row.source === "public" && row.profile_id && followed.has(row.profile_id) && { following: true }),
            }
          : { tone: "anonymous", name: null };
    if (row.kind === "reaction") {
      const state = publicSideOf({ reaction: row.reaction, liked: row.liked, disliked: row.disliked });
      if (!state) continue;
      const event: TickerEvent = { id: row.mine ? "you:reaction" : row.id, kind: "reaction", who, at, state };
      if (who.tone === "anonymous" && state.liked.length === 0 && Date.now() - row.at.getTime() < WEEK_MS) folded.push(event);
      else events.push(event);
    } else if (row.kind === "photo-like" && row.media_key && row.tag) {
      events.push({
        id: row.mine ? `you:like:${row.media_key}\u0000${row.tag}` : row.id,
        kind: row.media_key === FACTS ? "fact-like" : "spot-like",
        who,
        at,
        mediaKey: row.media_key,
        spot: row.tag,
      });
    } else if (row.kind === "comment") {
      events.push({
        id: row.id,
        kind: "comment",
        who,
        at,
        ...(row.media_key && row.tag && { mediaKey: row.media_key, spot: row.tag }),
        ...(row.body && { body: clipWords(row.body) }),
        ...(row.comment_id && { commentId: row.comment_id }),
      });
    } else if (row.kind === "private-comment") {
      events.push({ id: row.id, kind: "private-comment", who: { tone: "anonymous", name: null }, at });
    } else if (row.kind === "sent") {
      const sender: TickerEvent["who"] =
        row.source === "self" ? { tone: "you", name: null, agent: true } : { tone: "anonymous", name: null };
      events.push({ id: row.id, kind: "sent", who: sender, at });
    }
  }
  if (folded.length >= 2) {
    events.push({ id: "anon-likes", kind: "anon-likes", who: { tone: "anonymous", name: null }, at: folded[0].at, count: folded.length });
  } else {
    events.push(...folded);
  }
  return events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

// For an agent's link, where there's no feed query: the latest thing in the
// home's own thread.
export function headlineFromTimeline(items: TimelineItem[]): Headline | null {
  // Not something someone didn't like: a caption leads with the good news.
  const last = items.findLast((item) => item.kind === "comment" || item.state.reaction || item.photos.length);
  if (!last) return null;
  if (last.kind === "comment") return { kind: "comment", who: "public", name: last.name, at: last.at };
  if (!last.state.reaction && last.photos.length) {
    return { kind: "photo", who: "public", name: last.name, tag: last.photos.at(-1)!.tag, at: last.at };
  }
  return { kind: "react", who: "public", name: last.name, state: last.state, at: last.at };
}
