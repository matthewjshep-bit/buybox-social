import { firstName, type Account } from "./auth";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { aspectOfFact, aspectOfTag, FACTS, isFactTag, isTagIn, mediaKeyOf, NO_PHOTO_LIKES, thingOf } from "./photos";
import {
  NO_REACTION,
  TRENDING_MIN_PEOPLE,
  TRENDING_MIN_THIS_WEEK,
  TRENDING_TOP,
  type Aspect,
  type AspectCounts,
  type ReactionState,
} from "./reactions";
import { getPublicPhotoLikes, getPublicTimelines } from "./timeline";

export type Totals = { likes: number; dislikes: number; comments: number };

// Signs of life around a listing, drawn from public pages and private shares.
// `trending` is real and rare: several reactions or comments in the past week,
// from more than one person, and among the busiest homes for sale.
export type Buzz = { sends: number; views: number; lastActivityAt: string | null; trending: boolean };

// Which specifics people call out. Likes come from everywhere, photo likes
// included; dislikes only from public reactions, since private chats never
// warn strangers off a home.
export type AspectTotals = { liked: AspectCounts; disliked: AspectCounts };

export type HomeCard = {
  listing: Listing;
  publicTotals: Totals;
  privateTotals: Totals;
  buzz: Buzz;
  aspects: AspectTotals;
};

export type TotalsRow = {
  pub_like: number;
  pub_dislike: number;
  pub_comments: number;
  priv_like: number;
  priv_dislike: number;
  priv_comments: number;
  sends: number;
  views: number;
  last_activity: Date | null;
  this_week: number;
  // How many people that week's activity came from, and where the home ranks
  // by it among homes for sale (ties share a place; null with none).
  people_this_week: number;
  trend_rank: number | null;
  liked_aspects: AspectCounts;
  disliked_aspects: AspectCounts;
};

export const toTotals = (row: TotalsRow) => ({
  publicTotals: { likes: row.pub_like, dislikes: row.pub_dislike, comments: row.pub_comments },
  privateTotals: { likes: row.priv_like, dislikes: row.priv_dislike, comments: row.priv_comments },
  buzz: {
    sends: row.sends,
    views: row.views,
    lastActivityAt: row.last_activity?.toISOString() ?? null,
    trending:
      row.this_week >= TRENDING_MIN_THIS_WEEK &&
      row.people_this_week >= TRENDING_MIN_PEOPLE &&
      row.trend_rank !== null &&
      row.trend_rank <= TRENDING_TOP,
  },
  aspects: { liked: row.liked_aspects, disliked: row.disliked_aspects },
});

// Totals for the listing aliased `l` in the enclosing query. Private share
// threads contribute counts only, never names or words, and only clients'
// comments count, not agent replies.
export const totalsForListing = () => sql`
  select
    pr.likes as pub_like, pr.dislikes as pub_dislike, pc.n as pub_comments,
    xr.likes as priv_like, xr.dislikes as priv_dislike, xc.n as priv_comments,
    xs.n as sends, v.n as views, la.counts as liked_aspects, da.counts as disliked_aspects,
    wk.n as this_week, wk.people as people_this_week, tr.rank as trend_rank,
    greatest(
      (select max(updated_at) from public_reactions where listing_key = l.listing_key),
      (select max(created_at) from public_comments where listing_key = l.listing_key),
      (select max(updated_at) from reactions where listing_key = l.listing_key),
      (select max(created_at) from comments
        where listing_key = l.listing_key and participant_id is not null),
      (select max(created_at) from public_photo_likes where listing_key = l.listing_key),
      (select max(created_at) from photo_likes where listing_key = l.listing_key),
      xs.last_sent
    ) as last_activity
  from (select 1) as one
  cross join lateral (
    select count(*) filter (where reaction = 'like')::int as likes,
           count(*) filter (where reaction = 'dislike')::int as dislikes
    from public_reactions where listing_key = l.listing_key) pr
  cross join lateral (
    select count(*)::int as n from public_comments where listing_key = l.listing_key) pc
  cross join lateral (
    select count(*) filter (where reaction = 'like')::int as likes,
           count(*) filter (where reaction = 'dislike')::int as dislikes
    from reactions where listing_key = l.listing_key) xr
  cross join lateral (
    select count(*)::int as n from comments
    where listing_key = l.listing_key and participant_id is not null) xc
  cross join lateral (
    select count(*)::int as n, max(s.created_at) as last_sent
    from share_listings sl join shares s on s.id = sl.share_id
    where sl.listing_key = l.listing_key) xs
  cross join lateral (
    select count(*)::int as n from listing_views where listing_key = l.listing_key) v
  cross join lateral (
    select coalesce(jsonb_object_agg(aspect, n), '{}'::jsonb) as counts
    from (
      -- Once per person per specific, whether they picked it or liked it in a photo.
      select aspect, count(*)::int as n from (
        select 'v' || visitor_id as who, unnest(liked) as aspect
        from public_reactions where listing_key = l.listing_key
        union
        select 'p' || participant_id, unnest(liked) from reactions where listing_key = l.listing_key
        union
        select 'v' || visitor_id, aspect from public_photo_likes
        where listing_key = l.listing_key and aspect is not null
        union
        select 'p' || participant_id, aspect from photo_likes
        where listing_key = l.listing_key and aspect is not null) a
      group by aspect) c) la
  cross join lateral (
    select coalesce(jsonb_object_agg(aspect, n), '{}'::jsonb) as counts
    from (
      select aspect, count(*)::int as n from (
        select unnest(disliked) as aspect from public_reactions where listing_key = l.listing_key) a
      group by aspect) c) da
  cross join lateral (
    select count(*)::int as n, count(distinct a.who)::int as people
    from (${weekActivity()}) a
    where a.listing_key = l.listing_key) wk
  cross join lateral (
    select min(r.rank)::int as rank from (
      select a.listing_key, dense_rank() over (order by count(*) desc) as rank
      from (${weekActivity()}) a
      join listings active on active.listing_key = a.listing_key and active.standard_status = 'Active'
      group by a.listing_key) r
    where r.listing_key = l.listing_key) tr`;

// Every reaction and comment in the past week, public or on a link, with the
// home and who it came from (a visitor or someone on a link).
const weekActivity = () => sql`
  select listing_key, 'v' || visitor_id as who from public_reactions
  where updated_at > now() - interval '7 days'
  union all
  select listing_key, 'v' || visitor_id from public_comments
  where created_at > now() - interval '7 days'
  union all
  select listing_key, 'p' || participant_id from reactions
  where updated_at > now() - interval '7 days'
  union all
  select listing_key, 'p' || participant_id from comments
  where participant_id is not null and created_at > now() - interval '7 days'
  union all
  select listing_key, 'v' || visitor_id from public_photo_likes
  where created_at > now() - interval '7 days'
  union all
  select listing_key, 'p' || participant_id from photo_likes
  where created_at > now() - interval '7 days'`;

// Shared sort orders, for the listing aliased `l` and its totals `t`.
export const ORDER_BY = {
  reactions: () => sql`t.pub_like + t.pub_dislike + t.priv_like + t.priv_dislike desc`,
  liked: () => sql`t.pub_like + t.priv_like desc`,
  talked: () => sql`t.pub_comments + t.priv_comments desc`,
  viewed: () => sql`t.views desc`,
  latest: () => sql`t.last_activity desc nulls last`,
};

export async function getPublicListing(listingKey: string, visitorId: string | null = null) {
  if (listingKey.length > 100) return null;
  const [row] = await sql<({ data: Listing; standard_status: string } & TotalsRow)[]>`
    select l.data, l.standard_status, t.*
    from listings l
    cross join lateral (${totalsForListing()}) t
    where l.listing_key = ${listingKey}`;
  if (!row) return null;
  const listing: Listing = {
    ...row.data,
    StandardStatus: row.standard_status,
    Media: [...row.data.Media].sort((a, b) => a.Order - b.Order),
  };

  const [[mine], timelines, photoLikes] = await Promise.all([
    visitorId
      ? sql<ReactionState[]>`
          select reaction, liked, disliked from public_reactions
          where listing_key = ${listingKey} and visitor_id = ${visitorId}`
      : Promise.resolve([] as ReactionState[]),
    getPublicTimelines([listing], visitorId),
    getPublicPhotoLikes([listingKey], visitorId),
  ]);

  return {
    listing,
    ...toTotals(row),
    mine: mine ? { reaction: mine.reaction, liked: mine.liked, disliked: mine.disliked } : NO_REACTION,
    timeline: timelines.get(listingKey) ?? [],
    photoLikes: photoLikes.get(listingKey) ?? NO_PHOTO_LIKES,
  };
}

// One photo of a listing, to check a photo like against what's really in it.
// What a like, dislike or comment is about, if it's really on this home: a thing
// or spot in one of its photos, or one of its facts ("the price"). With the
// broad specific a like on it counts toward.
export async function findSpot(
  listingKey: string,
  mediaKey: string,
  tag: string,
): Promise<{ aspect: Aspect | null } | null> {
  const [row] = await sql<{ data: Listing }[]>`select data from listings where listing_key = ${listingKey}`;
  if (!row) return null;
  if (mediaKey === FACTS) return isFactTag(tag) ? { aspect: aspectOfFact(tag) } : null;
  const photo = row.data.Media.find((m) => mediaKeyOf(m) === mediaKey);
  return photo && isTagIn(photo, tag) ? { aspect: aspectOfTag(photo, thingOf(photo, tag) ?? tag) } : null;
}

export async function getVisitor(deviceToken: string | undefined) {
  if (!deviceToken) return null;
  const [visitor] = await sql<{ id: string; first_name: string }[]>`
    select id, first_name from visitors where device_token = ${deviceToken}`;
  return visitor ?? null;
}

// Who a person's public reactions and comments belong to: their account when
// signed in (so it follows them across devices), otherwise this browser.
export async function getPublicIdentity(account: Account | null, deviceToken: string | undefined) {
  if (account?.role) {
    const [visitor] = await sql<{ id: string; first_name: string }[]>`
      select id, first_name from visitors where account_id = ${account.id}`;
    // No name yet (they signed in with just an email): asked the first time
    // they like or say something.
    return { visitor: visitor ?? null, name: account.full_name.trim() ? firstName(account) : null };
  }
  const visitor = await getVisitor(deviceToken);
  return { visitor, name: visitor?.first_name ?? null };
}

export async function ensureAccountVisitor(account: Account) {
  const [visitor] = await sql<{ id: string; first_name: string }[]>`
    insert into visitors (device_token, first_name, account_id)
    values (${`account:${account.id}`}, ${firstName(account)}, ${account.id})
    on conflict (account_id) do update set first_name = excluded.first_name
    returning id, first_name`;
  return visitor;
}
