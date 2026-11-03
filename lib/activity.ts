import { sql } from "./db";

// What's happened around someone's public activity: replies to and likes on
// their comments, and new comments on homes they liked. Read from the tables
// themselves, so there's nothing extra to keep in sync.
export type ActivityItem = {
  id: string;
  kind: "reply" | "comment_like" | "comment";
  who: string;
  body: string;
  listingKey: string;
  address: string;
  at: string;
  unread: boolean;
};

export async function getActivity(visitorId: string, limit = 40): Promise<ActivityItem[]> {
  const rows = await sql<
    {
      id: string;
      kind: ActivityItem["kind"];
      who: string;
      body: string;
      listing_key: string;
      address: string;
      at: Date;
      unread: boolean;
    }[]
  >`
    with me as (select activity_seen_at from visitors where id = ${visitorId}),
    events as (
      select 'reply:' || c.id as id, 'reply' as kind, v.first_name as who, c.body,
        c.listing_key, c.created_at as at
      from public_comments c
      join public_comments mine on mine.id = c.parent_id and mine.visitor_id = ${visitorId}
      join visitors v on v.id = c.visitor_id
      where c.visitor_id <> ${visitorId}
      union all
      select 'like:' || cl.comment_id || ':' || cl.visitor_id, 'comment_like', v.first_name, mine.body,
        mine.listing_key, cl.created_at
      from public_comment_likes cl
      join public_comments mine on mine.id = cl.comment_id and mine.visitor_id = ${visitorId}
      join visitors v on v.id = cl.visitor_id
      where cl.visitor_id <> ${visitorId}
      union all
      select 'comment:' || c.id, 'comment', v.first_name, c.body, c.listing_key, c.created_at
      from public_comments c
      join public_reactions r on r.listing_key = c.listing_key
        and r.visitor_id = ${visitorId} and r.reaction = 'like'
      join visitors v on v.id = c.visitor_id
      where c.visitor_id <> ${visitorId} and c.parent_id is null and c.created_at > r.updated_at
    )
    select e.id, e.kind, e.who, e.body, e.listing_key, l.data->>'UnparsedAddress' as address, e.at,
      e.at > (select activity_seen_at from me) as unread
    from events e join listings l on l.listing_key = e.listing_key
    order by e.at desc
    limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    who: r.who,
    body: r.body,
    listingKey: r.listing_key,
    address: r.address,
    at: r.at.toISOString(),
    unread: r.unread,
  }));
}

export async function countUnreadActivity(visitorId: string): Promise<number> {
  const items = await getActivity(visitorId, 99);
  return items.filter((item) => item.unread).length;
}
