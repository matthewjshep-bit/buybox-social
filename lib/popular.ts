import { sameAgent } from "./agent-listings";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { shownOnProfile } from "./own-listings";
import { findable, type PeopleViewer } from "./people";
import { photoUrl } from "./person-photo";

// Popular: the homes people like and talk about most, and the people who do
// the most liking and talking, each over a week, a month, or for good.
//
// A home's place is its likes plus its comments in that time. Both count
// what was done in public and what was done on a link someone was sent, as
// every count of a home's likes does: numbers only, never who or what they
// said. A pass never counts, and never shows.
//
// A person's place is what they did in public only (homes liked, things liked
// in photos, comments), and only someone a stranger could find already
// (lib/people.ts): what a client does on their agent's link never puts them
// on a list anyone can read.
//
// An agent's place is their own listings: the ones for sale and the ones
// they've closed. Only homes they listed themselves: a home someone else
// listed that they put on their page is on their page, and not counted here.
// All of it is public already.

export type PopularPeriod = "week" | "month" | "all";

export const PERIODS: { key: PopularPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

export const isPeriod = (value: unknown): value is PopularPeriod =>
  value === "week" || value === "month" || value === "all";

// How many are ever listed: a list to read down, not a directory.
export const POPULAR_MOST = 25;
// Fewer than this in a week (or a month) and the page opens on a longer time
// instead, so it's never a list of one.
const THIN = 5;

// "and <column> > a week ago", or nothing for all time.
const since = (period: PopularPeriod, column: string) =>
  period === "all"
    ? sql``
    : sql`and ${sql(column)} > now() - ${period === "week" ? sql`interval '7 days'` : sql`interval '30 days'`}`;

export type PopularHome = {
  key: string;
  address: string;
  city: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  photo: string | null;
  likes: number;
  comments: number;
  // What's said about it, in public: the best-liked of it.
  top: { name: string; body: string } | null;
};

// Every home with a like or a comment in that time, the most first. (Ties:
// the more liked, then the one something happened on last.)
const ranked = (period: PopularPeriod) => sql`
  select x.listing_key, sum(x.likes)::int as likes, sum(x.comments)::int as comments, max(x.at) as last_at
  from (
    select listing_key, 1 as likes, 0 as comments, updated_at as at from public_reactions
    where reaction = 'like' ${since(period, "updated_at")}
    union all
    -- (A like on a link that's public too counts once, as the public one.)
    select listing_key, 1, 0, updated_at from reactions
    where reaction = 'like' and not public_copy ${since(period, "updated_at")}
    union all
    select listing_key, 0, 1, created_at from public_comments
    where true ${since(period, "created_at")}
    union all
    -- (On a link, only what the people it was sent to said: not the agent's answers.)
    select listing_key, 0, 1, created_at from comments
    where participant_id is not null and public_comment_id is null ${since(period, "created_at")}
  ) x
  -- (Homes for sale, and an agent's own deals they've closed and still show:
  -- people like and talk about those too.)
  join listings l on l.listing_key = x.listing_key
    and (l.standard_status = 'Active'
      or (l.owner_account_id is not null and l.standard_status = 'Closed'
        and coalesce((l.data->>'Hidden')::boolean, false) = false))
  group by x.listing_key`;

const inOrder = sql`r.likes + r.comments desc, r.likes desc, r.last_at desc, r.listing_key`;

// Only their keys, in order: what the homes full screen go through.
export async function popularKeys(period: PopularPeriod, most = POPULAR_MOST): Promise<string[]> {
  const rows = await sql<{ listing_key: string }[]>`
    select r.listing_key from (${ranked(period)}) r order by ${inOrder} limit ${most}`;
  return rows.map((row) => row.listing_key);
}

export async function getPopularHomes(period: PopularPeriod, most = POPULAR_MOST): Promise<PopularHome[]> {
  const rows = await sql<
    { data: Listing; likes: number; comments: number; top_name: string | null; top_body: string | null }[]
  >`
    select l.data, r.likes, r.comments, top.name as top_name, top.body as top_body
    from (${ranked(period)}) r
    join listings l on l.listing_key = r.listing_key
    left join lateral (
      -- What's said about it in public (never a reply), the best-liked first.
      select btrim(v.first_name) as name, c.body
      from public_comments c
      join visitors v on v.id = c.visitor_id
      where c.listing_key = r.listing_key and c.parent_id is null and btrim(v.first_name) <> ''
      order by (select count(*) from public_comment_likes cl where cl.comment_id = c.id) desc, c.created_at desc
      limit 1) top on true
    order by ${inOrder}
    limit ${most}`;
  return rows.map(({ data, likes, comments, top_name, top_body }) => ({
    key: data.ListingKey,
    address: data.UnparsedAddress,
    city: data.City,
    price: data.ListPrice ?? null,
    beds: data.BedroomsTotal ?? null,
    baths: data.BathroomsTotalInteger ?? null,
    sqft: data.LivingArea ?? null,
    photo: [...data.Media].sort((a, b) => a.Order - b.Order)[0]?.MediaURL ?? null,
    likes,
    comments,
    top: top_name && top_body ? { name: top_name, body: top_body } : null,
  }));
}

export type PopularPerson = {
  profileId: string;
  name: string;
  face: string;
  agent: boolean;
  // What a pro is (lib/kinds.ts): the chip beside their name.
  kind: string | null;
  brokerage: string | null;
  photo: string | null;
  likes: number;
  comments: number;
  // Whoever's looking: it's them.
  me: boolean;
  iFollow: boolean;
};

// What someone did in public in that time: `likes` (homes, and things in
// their photos) and `comments`. (`v` is their visitors row, in the query this
// goes into.)
const did = (period: PopularPeriod) => sql`
  select
    (select count(*)::int from public_reactions x
      where x.visitor_id = v.id and x.reaction = 'like' ${since(period, "updated_at")})
    + (select count(*)::int from public_photo_likes x
      where x.visitor_id = v.id ${since(period, "created_at")}) as likes,
    (select count(*)::int from public_comments x
      where x.visitor_id = v.id ${since(period, "created_at")}) as comments`;

export async function getPopularPeople(
  viewer: PeopleViewer,
  period: PopularPeriod,
  most = POPULAR_MOST,
): Promise<PopularPerson[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      face: string;
      is_agent: boolean;
      kind: string | null;
      brokerage: string | null;
      photo_v: string | null;
      likes: number;
      comments: number;
      me: boolean;
      i_follow: boolean;
    }[]
  >`
    select v.id,
      case when a.role = 'agent' then btrim(a.full_name) else btrim(v.first_name) end as name,
      btrim(v.first_name) as face,
      a.role = 'agent' as is_agent,
      a.kind,
      case when a.role = 'agent' then nullif(btrim(a.brokerage), '') end as brokerage,
      left(md5(a.photo_data_url), 10) as photo_v,
      d.likes, d.comments,
      a.id = ${viewer.accountId} as me,
      exists (
        select 1 from follows f where f.follower_id = ${viewer.visitorId}::uuid and f.followed_id = v.id) as i_follow
    from visitors v
    join accounts a on a.id = v.account_id
    cross join lateral (${did(period)}) d
    where ${findable()} and d.likes + d.comments > 0
    order by d.likes + d.comments desc, d.comments desc, lower(v.first_name), v.id
    limit ${most}`;
  return rows.map((row) => ({
    profileId: row.id,
    name: row.name,
    face: row.face,
    agent: row.is_agent,
    kind: row.kind,
    brokerage: row.brokerage,
    photo: photoUrl(row.id, row.photo_v),
    likes: row.likes,
    comments: row.comments,
    me: row.me,
    iFollow: row.i_follow,
  }));
}

// The time the page opens on when none was asked for: this week, unless
// there's too little in it to be a list; then this month; then all time.
export async function defaultPeriod(kind: "homes" | "people"): Promise<PopularPeriod> {
  for (const period of ["week", "month"] as const) {
    const [{ n }] =
      kind === "homes"
        ? await sql<{ n: number }[]>`select count(*)::int as n from (${ranked(period)}) r`
        : await sql<{ n: number }[]>`
            select count(*)::int as n
            from visitors v
            join accounts a on a.id = v.account_id
            cross join lateral (${did(period)}) d
            where ${findable()} and d.likes + d.comments > 0`;
    if (n >= THIN) return period;
  }
  return "all";
}

export type PopularAgent = {
  profileId: string;
  name: string;
  face: string;
  brokerage: string | null;
  photo: string | null;
  // Their listings for sale now, and the ones they've closed.
  forSale: number;
  closed: number;
  me: boolean;
  iFollow: boolean;
};

// Agents by how many listings they have, for sale and closed together, the
// most first. Only their own: the ones they added themselves (not hidden,
// with a photo), and the MLS's that name them as the agent (under their MLS
// ID, or one they put on their page). A home they put on their page that
// someone else listed doesn't count. A copy they made stands in for its
// original; each home once.
export async function getPopularAgents(
  viewer: { visitorId: string | null; accountId: string | null },
  most = POPULAR_MOST,
): Promise<PopularAgent[]> {
  const [agents, own, copies, pinned, listed] = await Promise.all([
    sql<
      { account: string; id: string; name: string; face: string; brokerage: string | null; photo_v: string | null; i_follow: boolean }[]
    >`
      select a.id as account, v.id, btrim(a.full_name) as name, btrim(v.first_name) as face,
        nullif(btrim(a.brokerage), '') as brokerage, left(md5(a.photo_data_url), 10) as photo_v,
        exists (
          select 1 from follows f
          where f.follower_id = ${viewer.visitorId}::uuid and f.followed_id = v.id) as i_follow
      from accounts a
      join visitors v on v.account_id = a.id
      where a.role = 'agent' and btrim(a.full_name) <> '' and btrim(v.first_name) <> ''`,
    sql<{ account: string; key: string; status: string }[]>`
      select owner_account_id as account, listing_key as key, standard_status as status from listings
      where owner_account_id is not null and standard_status in ('Active', 'Closed') and ${shownOnProfile()}`,
    sql<{ account: string; key: string }[]>`
      select owner_account_id as account, data->>'CopiedFrom' as key from listings
      where owner_account_id is not null and data->>'CopiedFrom' is not null`,
    sql<{ account: string; key: string; listed_as: string | null }[]>`
      select p.account_id as account, l.listing_key as key, l.data->>'ListAgentFullName' as listed_as
      from profile_listings p join listings l on l.listing_key = p.listing_key
      where l.standard_status = 'Active'`,
    sql<{ account: string; key: string; listed_as: string | null }[]>`
      select a.id as account, l.listing_key as key, l.data->>'ListAgentFullName' as listed_as
      from accounts a
      join listings l on l.standard_status = 'Active' and l.owner_account_id is null
        and lower(l.data->>'ListAgentMlsId') = lower(btrim(a.mls_agent_id))
      where a.role = 'agent' and btrim(coalesce(a.mls_agent_id, '')) <> ''`,
  ]);
  const of = <T extends { account: string }>(rows: T[], account: string) => rows.filter((row) => row.account === account);
  return agents
    .map((agent) => {
      // (A copy they made to change stands in for its original.)
      const seen = new Set(of(copies, agent.account).map((row) => row.key));
      let forSale = 0;
      let closed = 0;
      const count = (key: string, isClosed = false) => {
        if (seen.has(key)) return;
        seen.add(key);
        if (isClosed) closed += 1;
        else forSale += 1;
      };
      for (const row of of(own, agent.account)) count(row.key, row.status === "Closed");
      // (Put on their page: theirs only if the listing names them.)
      for (const row of of(pinned, agent.account)) if (sameAgent(agent.name, row.listed_as)) count(row.key);
      for (const row of of(listed, agent.account)) if (sameAgent(agent.name, row.listed_as)) count(row.key);
      return {
        profileId: agent.id,
        name: agent.name,
        face: agent.face,
        brokerage: agent.brokerage,
        photo: photoUrl(agent.id, agent.photo_v),
        forSale,
        closed,
        me: agent.account === viewer.accountId,
        iFollow: agent.i_follow,
      };
    })
    .filter((agent) => agent.forSale + agent.closed > 0)
    .sort((a, b) => b.forSale + b.closed - (a.forSale + a.closed) || b.closed - a.closed || a.name.localeCompare(b.name))
    .slice(0, most);
}
