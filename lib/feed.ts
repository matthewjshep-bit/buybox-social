import type { Account } from "./auth";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import {
  getPublicIdentity,
  ORDER_BY,
  toTotals,
  totalsForListing,
  type AspectTotals,
  type Buzz,
  type TotalsRow,
} from "./public";
import { NO_REACTION, publicSideOf, type ReactionState } from "./reactions";
import type { FeedSort } from "./search-options";
import type { CommentTag } from "./shares";

// The signed-in home page: one post per home.

export type Headline =
  | { kind: "react"; who: "public" | "client"; name: string; state: ReactionState; at: string }
  | { kind: "react"; who: "anonymous"; state: ReactionState; at: string }
  | { kind: "comment"; who: "public" | "client"; name: string; at: string }
  | { kind: "comment"; who: "anonymous"; at: string }
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
  recentComments: { id: string; name: string; tag: CommentTag | null; body: string }[];
  highlight: string | null;
  mine: ReactionState;
  buzz: Buzz;
};

type Row = { data: Listing } & TotalsRow & {
  h_kind: "react" | "comment" | "sent" | null;
  h_state: ReactionState;
  h_name: string | null;
  h_source: "public" | "client" | "private" | "self" | null;
  h_at: Date | null;
};

export async function getFeed(
  viewer: Account,
  deviceToken: string | undefined,
  sort: FeedSort,
): Promise<FeedPost[]> {
  // Only an agent sees their own clients by name. Everyone else's private
  // activity shows anonymously, and only its likes: a private dislike never
  // becomes a headline that could put someone off a home.
  const agentId = viewer.role === "agent" ? viewer.id : null;
  const orderBy = ORDER_BY[sort]();
  const rows = await sql<Row[]>`
    select l.data, t.*, h.kind as h_kind, h.name as h_name, h.source as h_source, h.at as h_at,
      json_build_object('reaction', h.reaction, 'liked', h.liked, 'disliked', h.disliked) as h_state
    from listings l
    cross join lateral (${totalsForListing()}) t
    left join lateral (
      select * from (
        select 'react' as kind, r.reaction, r.liked, r.disliked, vi.first_name as name,
          'public' as source, r.updated_at as at
        from public_reactions r join visitors vi on vi.id = r.visitor_id
        where r.listing_key = l.listing_key
        union all
        select 'comment', null, '{}'::text[], '{}'::text[], vi.first_name, 'public', c.created_at
        from public_comments c join visitors vi on vi.id = c.visitor_id
        where c.listing_key = l.listing_key
        union all
        select 'react', r.reaction, r.liked, r.disliked,
          case when s.agent_id = ${agentId}::uuid then p.first_name end,
          case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end, r.updated_at
        from reactions r
        join participants p on p.id = r.participant_id
        join shares s on s.id = r.share_id
        where r.listing_key = l.listing_key
          and (s.agent_id = ${agentId}::uuid or r.reaction = 'like' or cardinality(r.liked) > 0)
        union all
        select 'comment', null, '{}'::text[], '{}'::text[],
          case when s.agent_id = ${agentId}::uuid then p.first_name end,
          case when s.agent_id = ${agentId}::uuid then 'client' else 'private' end, c.created_at
        from comments c
        join participants p on p.id = c.participant_id
        join shares s on s.id = c.share_id
        where c.listing_key = l.listing_key
        union all
        select 'sent', null, '{}'::text[], '{}'::text[], null,
          case when s.agent_id = ${agentId}::uuid then 'self' else 'private' end, s.created_at
        from share_listings sl join shares s on s.id = sl.share_id
        where sl.listing_key = l.listing_key
      ) events
      order by at desc
      limit 1
    ) h on true
    where l.standard_status = 'Active'
    order by ${orderBy}, ${ORDER_BY.latest()}, l.updated_at desc, l.listing_key
    limit 30`;
  if (rows.length === 0) return [];
  const keys = rows.map((row) => row.data.ListingKey);

  const likers = await sql<{ listing_key: string; first_name: string }[]>`
    select listing_key, first_name from (
      select r.listing_key, vi.first_name,
        row_number() over (partition by r.listing_key order by r.updated_at desc) as n
      from public_reactions r join visitors vi on vi.id = r.visitor_id
      where r.reaction = 'like' and r.listing_key in ${sql(keys)}) x
    where n <= 2`;
  const comments = await sql<
    { listing_key: string; id: string; first_name: string; tag: CommentTag | null; body: string }[]
  >`
    select listing_key, id, first_name, tag, body from (
      select c.listing_key, c.id, vi.first_name, c.tag, c.body, c.created_at,
        row_number() over (partition by c.listing_key order by c.created_at desc) as n
      from public_comments c join visitors vi on vi.id = c.visitor_id
      where c.listing_key in ${sql(keys)}) x
    where n <= 2
    order by created_at`;
  const highlights = await sql<{ listing_key: string; body: string }[]>`
    select distinct on (listing_key) listing_key, body from comments
    where shared_publicly and listing_key in ${sql(keys)}
    order by listing_key, created_at desc`;
  const { visitor } = await getPublicIdentity(viewer, deviceToken);
  const mine = visitor
    ? await sql<({ listing_key: string } & ReactionState)[]>`
        select listing_key, reaction, liked, disliked from public_reactions
        where visitor_id = ${visitor.id} and listing_key in ${sql(keys)}`
    : [];

  return rows.map((row) => {
    const key = row.data.ListingKey;
    const totals = toTotals(row);
    const own = mine.find((m) => m.listing_key === key);
    return {
      listing: { ...row.data, Media: [...row.data.Media].sort((a, b) => a.Order - b.Order) },
      headline: toHeadline(row),
      likes: totals.publicTotals.likes + totals.privateTotals.likes,
      likers: likers.filter((l) => l.listing_key === key).map((l) => l.first_name),
      dislikes: totals.publicTotals.dislikes,
      aspects: totals.aspects,
      publicComments: totals.publicTotals.comments,
      privateComments: totals.privateTotals.comments,
      recentComments: comments
        .filter((c) => c.listing_key === key)
        .map((c) => ({ id: c.id, name: c.first_name, tag: c.tag, body: c.body })),
      highlight: highlights.find((h) => h.listing_key === key)?.body ?? null,
      mine: own ? { reaction: own.reaction, liked: own.liked, disliked: own.disliked } : NO_REACTION,
      buzz: totals.buzz,
    };
  });
}

function toHeadline(row: Row): Headline | null {
  if (!row.h_kind || !row.h_at) return null;
  const at = row.h_at.toISOString();
  if (row.h_kind === "sent") return { kind: "sent", who: row.h_source === "self" ? "you" : "anonymous", at };
  const named = (row.h_source === "public" || row.h_source === "client") && row.h_name;
  if (row.h_kind === "comment") {
    return named
      ? { kind: "comment", who: row.h_source as "public" | "client", name: row.h_name!, at }
      : { kind: "comment", who: "anonymous", at };
  }
  if (named) return { kind: "react", who: row.h_source as "public" | "client", name: row.h_name!, state: row.h_state, at };
  const shown = publicSideOf(row.h_state);
  return shown ? { kind: "react", who: "anonymous", state: shown, at } : null;
}
