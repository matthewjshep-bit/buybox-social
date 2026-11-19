import { cache } from "react";
import { sql } from "./db";
import { photoUrl } from "./person-photo";

// Following: one profile (visitor) following another. Everything here is about
// public selves only; nothing private follows anyone anywhere.

export type FollowCounts = { followers: number; following: number };

// Whether person `v` (a visitors row in the query) may be named beside
// `ownerId` in a list of who follows whom, to whoever's looking. An agent and
// someone on one of their links follow each other from the day the link is
// first opened, so to anyone else that pair would be the agent's client list:
// it shows only to the two of them. (The same test as the "new follower"
// notification, which leaves them out too. Whoever sent a link counts as its
// agent here, so a link between two friends stays between them as well.)
function shownTo(ownerId: string, viewerId: string | null) {
  if (viewerId === ownerId) return sql`true`;
  return sql`(v.id = ${viewerId}::uuid or not exists (
    select 1 from participants p
    join shares s on s.id = p.share_id
    join visitors owner on owner.id = ${ownerId}
    where (p.account_id = v.account_id and s.agent_id = owner.account_id)
       or (p.account_id = owner.account_id and s.agent_id = v.account_id)))`;
}

// How many follow them, and how many they follow, as `viewerId` (a page id,
// or none for a signed-out visitor) may know it: their own whole numbers to
// themselves; to anyone else, without an agent's clients or a client's agent
// (except the one looking, who counts themselves).
export const getFollowCounts = cache(async (visitorId: string, viewerId: string | null = null): Promise<FollowCounts> => {
  const shown = shownTo(visitorId, viewerId);
  const [counts] = await sql<FollowCounts[]>`
    select
      (select count(*)::int from follows f join visitors v on v.id = f.follower_id
        where f.followed_id = ${visitorId} and ${shown}) as followers,
      (select count(*)::int from follows f join visitors v on v.id = f.followed_id
        where f.follower_id = ${visitorId} and ${shown}) as following`;
  return counts;
});

// Whom one profile follows, by id: for the feed, and to mark people in lists.
export const getFollowedIds = cache(async (visitorId: string | null | undefined): Promise<Set<string>> => {
  if (!visitorId) return new Set();
  const rows = await sql<{ followed_id: string }[]>`
    select followed_id from follows where follower_id = ${visitorId}`;
  return new Set(rows.map((row) => row.followed_id));
});

// Whether `follower` follows `followed`.
export async function follows(follower: string | null | undefined, followed: string) {
  if (!follower || follower === followed) return false;
  const [row] = await sql`select 1 from follows where follower_id = ${follower} and followed_id = ${followed}`;
  return Boolean(row);
}

// `agentName`, `brokerage`: an agent's whole name and company, as their page
// gives them; never anyone else's.
type FollowPerson = {
  id: string;
  name: string;
  isAgent: boolean;
  agentName: string | null;
  brokerage: string | null;
  since: string;
  photo: string | null;
};

// Someone's followers, or the people they follow, newest first: as their
// profile names them (an account with no name yet has none here either).
// Only those `viewerId` may be told about (shownTo): everyone, on their own
// lists; otherwise never an agent's clients nor a client's agent, but for the
// one looking.
export async function getFollowList(
  visitorId: string,
  which: "followers" | "following",
  viewerId: string | null = null,
): Promise<FollowPerson[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      is_agent: boolean;
      agent_name: string | null;
      brokerage: string | null;
      since: Date;
      photo_v: string | null;
    }[]
  >`
    select v.id,
      case when a.id is not null and btrim(a.full_name) = '' then '' else v.first_name end as name,
      coalesce(a.role = 'agent', false) as is_agent, f.created_at as since, left(md5(a.photo_data_url), 10) as photo_v,
      case when a.role = 'agent' then nullif(btrim(a.full_name), '') end as agent_name,
      case when a.role = 'agent' then nullif(btrim(a.brokerage), '') end as brokerage
    from follows f
    join visitors v on v.id = ${which === "followers" ? sql`f.follower_id` : sql`f.followed_id`}
    left join accounts a on a.id = v.account_id
    where ${which === "followers" ? sql`f.followed_id` : sql`f.follower_id`} = ${visitorId}
      and ${shownTo(visitorId, viewerId)}
    order by f.created_at desc
    limit 500`;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isAgent: row.is_agent,
    agentName: row.agent_name,
    brokerage: row.brokerage,
    since: row.since.toISOString(),
    photo: photoUrl(row.id, row.photo_v),
  }));
}
