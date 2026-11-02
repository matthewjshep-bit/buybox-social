import { sql } from "./db";
import type { Listing } from "./listings/types";
import type { CommentTag, Reaction } from "./shares";

export type Totals = { loves: number; maybes: number; passes: number; comments: number };

// Signs of life around a listing, drawn from public pages and private shares.
// All positive or neutral, so nothing here steers anyone away from a home.
export type Buzz = { sends: number; views: number; lastActivityAt: string | null };

export type HomeCard = {
  listing: Listing;
  publicTotals: Totals;
  privateTotals: Totals;
  buzz: Buzz;
};

type TotalsRow = {
  pub_love: number;
  pub_maybe: number;
  pub_pass: number;
  pub_comments: number;
  priv_love: number;
  priv_maybe: number;
  priv_pass: number;
  priv_comments: number;
  sends: number;
  views: number;
  last_activity: Date | null;
};

const toTotals = (row: TotalsRow) => ({
  publicTotals: {
    loves: row.pub_love,
    maybes: row.pub_maybe,
    passes: row.pub_pass,
    comments: row.pub_comments,
  },
  privateTotals: {
    loves: row.priv_love,
    maybes: row.priv_maybe,
    passes: row.priv_pass,
    comments: row.priv_comments,
  },
  buzz: {
    sends: row.sends,
    views: row.views,
    lastActivityAt: row.last_activity?.toISOString() ?? null,
  },
});

// Totals for the listing aliased `l` in the enclosing query. Private share
// threads contribute counts only, never names or words, and only clients'
// comments count, not agent replies.
const totalsForListing = () => sql`
  select
    pr.love as pub_love, pr.maybe as pub_maybe, pr.pass as pub_pass, pc.n as pub_comments,
    xr.love as priv_love, xr.maybe as priv_maybe, xr.pass as priv_pass, xc.n as priv_comments,
    xs.n as sends, v.n as views,
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
    select count(*) filter (where reaction = 'love')::int as love,
           count(*) filter (where reaction = 'maybe')::int as maybe,
           count(*) filter (where reaction = 'pass')::int as pass
    from public_reactions where listing_key = l.listing_key) pr
  cross join lateral (
    select count(*)::int as n from public_comments where listing_key = l.listing_key) pc
  cross join lateral (
    select count(*) filter (where reaction = 'love')::int as love,
           count(*) filter (where reaction = 'maybe')::int as maybe,
           count(*) filter (where reaction = 'pass')::int as pass
    from reactions where listing_key = l.listing_key) xr
  cross join lateral (
    select count(*)::int as n from comments
    where listing_key = l.listing_key and participant_id is not null) xc
  cross join lateral (
    select count(*)::int as n, max(s.created_at) as last_sent
    from share_listings sl join shares s on s.id = sl.share_id
    where sl.listing_key = l.listing_key) xs
  cross join lateral (
    select count(*)::int as n from listing_views where listing_key = l.listing_key) v`;

export async function getHomeCards(): Promise<HomeCard[]> {
  const rows = await sql<({ data: Listing } & TotalsRow)[]>`
    select l.data, t.*
    from listings l
    cross join lateral (${totalsForListing()}) t
    where l.standard_status = 'Active'
    order by
      t.pub_love + t.pub_maybe + t.pub_pass + t.pub_comments
        + t.priv_love + t.priv_maybe + t.priv_pass + t.priv_comments + t.sends desc,
      t.last_activity desc nulls last, l.updated_at desc, l.listing_key
    limit 60`;
  return rows.map((row) => ({ listing: row.data, ...toTotals(row) }));
}

export type PublicReaction = { visitorId: string; name: string; reaction: Reaction };
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

  const reactions = await sql<{ visitor_id: string; first_name: string; reaction: Reaction }[]>`
    select r.visitor_id, v.first_name, r.reaction
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

  // Only comments their authors chose to share, and only "Like" ones. No names.
  const highlights = await sql<{ id: string; body: string; created_at: Date }[]>`
    select id, body, created_at from comments
    where listing_key = ${listingKey} and shared_publicly and tag = 'like'
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
      (r): PublicReaction => ({ visitorId: r.visitor_id, name: r.first_name, reaction: r.reaction }),
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
