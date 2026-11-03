import { firstName, type Account } from "./auth";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import type { AspectCounts, ReactionState } from "./reactions";
import type { CommentTag } from "./shares";

export type Totals = { likes: number; dislikes: number; comments: number };

// Signs of life around a listing, drawn from public pages and private shares.
export type Buzz = { sends: number; views: number; lastActivityAt: string | null };

// Which specifics people call out. Likes come from everywhere; dislikes only
// from public reactions, since private chats never warn strangers off a home.
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
    greatest(
      (select max(updated_at) from public_reactions where listing_key = l.listing_key),
      (select max(created_at) from public_comments where listing_key = l.listing_key),
      (select max(updated_at) from reactions where listing_key = l.listing_key),
      (select max(created_at) from comments
        where listing_key = l.listing_key and participant_id is not null),
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
      select aspect, count(*)::int as n from (
        select unnest(liked) as aspect from public_reactions where listing_key = l.listing_key
        union all
        select unnest(liked) from reactions where listing_key = l.listing_key) a
      group by aspect) c) la
  cross join lateral (
    select coalesce(jsonb_object_agg(aspect, n), '{}'::jsonb) as counts
    from (
      select aspect, count(*)::int as n from (
        select unnest(disliked) as aspect from public_reactions where listing_key = l.listing_key) a
      group by aspect) c) da`;

// Shared sort orders, for the listing aliased `l` and its totals `t`.
export const ORDER_BY = {
  reactions: () => sql`t.pub_like + t.pub_dislike + t.priv_like + t.priv_dislike desc`,
  liked: () => sql`t.pub_like + t.priv_like desc`,
  talked: () => sql`t.pub_comments + t.priv_comments desc`,
  viewed: () => sql`t.views desc`,
  latest: () => sql`t.last_activity desc nulls last`,
};

export async function getHomeCards(): Promise<HomeCard[]> {
  const rows = await sql<({ data: Listing } & TotalsRow)[]>`
    select l.data, t.*
    from listings l
    cross join lateral (${totalsForListing()}) t
    where l.standard_status = 'Active'
    order by ${ORDER_BY.reactions()}, ${ORDER_BY.talked()}, ${ORDER_BY.latest()}, l.listing_key
    limit 60`;
  return rows.map((row) => ({ listing: row.data, ...toTotals(row) }));
}

export type PublicReaction = { visitorId: string; name: string; state: ReactionState };
export type PublicComment = {
  id: string;
  visitorId: string;
  name: string;
  tag: CommentTag | null;
  body: string;
  createdAt: string;
};

export async function getPublicListing(listingKey: string) {
  if (listingKey.length > 100) return null;
  const [row] = await sql<({ data: Listing; standard_status: string } & TotalsRow)[]>`
    select l.data, l.standard_status, t.*
    from listings l
    cross join lateral (${totalsForListing()}) t
    where l.listing_key = ${listingKey}`;
  if (!row) return null;

  const reactions = await sql<({ visitor_id: string; first_name: string } & ReactionState)[]>`
    select r.visitor_id, v.first_name, r.reaction, r.liked, r.disliked
    from public_reactions r join visitors v on v.id = r.visitor_id
    where r.listing_key = ${listingKey}
    order by r.updated_at`;
  const comments = await sql<
    {
      id: string;
      visitor_id: string;
      first_name: string;
      tag: CommentTag | null;
      body: string;
      created_at: Date;
    }[]
  >`
    select c.id, c.visitor_id, v.first_name, c.tag, c.body, c.created_at
    from public_comments c join visitors v on v.id = c.visitor_id
    where c.listing_key = ${listingKey}
    order by c.created_at`;

  // Only comments their authors chose to share, which needs a like. No names.
  const highlights = await sql<{ id: string; body: string; created_at: Date }[]>`
    select id, body, created_at from comments
    where listing_key = ${listingKey} and shared_publicly
    order by created_at desc
    limit 6`;

  return {
    highlights: highlights.map((h) => ({
      id: h.id,
      body: h.body,
      createdAt: h.created_at.toISOString(),
    })),
    listing: {
      ...row.data,
      StandardStatus: row.standard_status,
      Media: [...row.data.Media].sort((a, b) => a.Order - b.Order),
    },
    ...toTotals(row),
    reactions: reactions.map(
      (r): PublicReaction => ({
        visitorId: r.visitor_id,
        name: r.first_name,
        state: { reaction: r.reaction, liked: r.liked, disliked: r.disliked },
      }),
    ),
    comments: comments.map(
      (c): PublicComment => ({
        id: c.id,
        visitorId: c.visitor_id,
        name: c.first_name,
        tag: c.tag,
        body: c.body,
        createdAt: c.created_at.toISOString(),
      }),
    ),
  };
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
    return { visitor: visitor ?? null, name: firstName(account) };
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
