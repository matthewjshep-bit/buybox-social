import { cache } from "react";
import { sql } from "./db";
import { photoUrl } from "./person-photo";

// Following: one profile (visitor) following another. Everything here is about
// public selves only; nothing private follows anyone anywhere.

export type FollowCounts = { followers: number; following: number };

export const getFollowCounts = cache(async (visitorId: string): Promise<FollowCounts> => {
  const [counts] = await sql<FollowCounts[]>`
    select
      (select count(*)::int from follows where followed_id = ${visitorId}) as followers,
      (select count(*)::int from follows where follower_id = ${visitorId}) as following`;
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

export type FollowPerson = { id: string; name: string; isAgent: boolean; since: string; photo: string | null };

// Someone's followers, or the people they follow, newest first: as their
// profile names them (an account with no name yet has none here either).
export async function getFollowList(visitorId: string, which: "followers" | "following"): Promise<FollowPerson[]> {
  const rows = await sql<{ id: string; name: string; is_agent: boolean; since: Date; photo_v: string | null }[]>`
    select v.id,
      case when a.id is not null and btrim(a.full_name) = '' then '' else v.first_name end as name,
      coalesce(a.role = 'agent', false) as is_agent, f.created_at as since, left(md5(a.photo_data_url), 10) as photo_v
    from follows f
    join visitors v on v.id = ${which === "followers" ? sql`f.follower_id` : sql`f.followed_id`}
    left join accounts a on a.id = v.account_id
    where ${which === "followers" ? sql`f.followed_id` : sql`f.follower_id`} = ${visitorId}
    order by f.created_at desc
    limit 500`;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isAgent: row.is_agent,
    since: row.since.toISOString(),
    photo: photoUrl(row.id, row.photo_v),
  }));
}
