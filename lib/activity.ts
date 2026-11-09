import { cache } from "react";
import { sql } from "./db";
import type { ListingMedia } from "./listings/types";
import { FACTS, mediaKeyOf } from "./photos";
import { daysBefore, dayOf, isVideo, PROFILE_TIME_ZONE } from "./profile";

// What's happened around someone's public activity: replies to and likes on
// their comments, replies to their likes, and new comments on homes they liked. Read from the tables
// themselves, so there's nothing extra to keep in sync.
export type ActivityItem = {
  id: string;
  kind: "reply" | "comment_like" | "comment" | "like_reply";
  who: string;
  // Their visitor id: two people can share a first name.
  whoId: string;
  body: string;
  // What it's about: your comment (for a reply or a like), or the home (for a
  // new comment on one you liked, or a reply to your likes on it).
  about: string;
  listingKey: string;
  address: string;
  // The photo it's about, else the home's first; `index` is its place in the
  // home's photos.
  photo: { url: string; index: number } | null;
  at: string;
  unread: boolean;
};

// One line on the page: the same thing happening more than once on one day
// (four likes on your comment) reads as one.
export type ActivityRow = Omit<ActivityItem, "who" | "whoId"> & {
  // Who, newest first, each once.
  people: { id: string; name: string }[];
};

// However much has happened, the page reads this many of the newest events,
// and shows this many lines of them: plenty, so a comment with a hundred likes
// in a day is one line with the rest still under it.
const EVENT_LIMIT = 500;
const ROW_LIMIT = 40;

type EventRow = {
  id: string;
  kind: ActivityItem["kind"];
  who: string;
  who_id: string;
  body: string;
  about: string;
  listing_key: string;
  media_key: string | null;
  at: Date;
  unread: boolean;
};

// Everything that's happened around someone: replies to their comments, likes
// of them, replies to their likes, and new comments on homes they liked.
const eventsOf = (visitorId: string) => sql`
  select 'reply:' || c.id as id, 'reply' as kind, v.first_name as who, v.id as who_id, c.body,
    mine.id::text as about, c.listing_key, mine.media_key, c.created_at as at
  from public_comments c
  join public_comments mine on mine.id = c.parent_id and mine.visitor_id = ${visitorId}
  join visitors v on v.id = c.visitor_id
  where c.visitor_id <> ${visitorId}
  union all
  select 'like:' || cl.comment_id || ':' || cl.visitor_id, 'comment_like', v.first_name, v.id, mine.body,
    mine.id::text, mine.listing_key, mine.media_key, cl.created_at
  from public_comment_likes cl
  join public_comments mine on mine.id = cl.comment_id and mine.visitor_id = ${visitorId}
  join visitors v on v.id = cl.visitor_id
  where cl.visitor_id <> ${visitorId}
  union all
  select 'comment:' || c.id, 'comment', v.first_name, v.id, c.body, c.listing_key, c.listing_key,
    c.media_key, c.created_at
  from public_comments c
  join public_reactions r on r.listing_key = c.listing_key
    and r.visitor_id = ${visitorId} and r.reaction = 'like'
  join visitors v on v.id = c.visitor_id
  where c.visitor_id <> ${visitorId} and c.parent_id is null and c.reply_to_visitor is null
    and c.created_at > r.updated_at
  union all
  select 'like-reply:' || c.id, 'like_reply', v.first_name, v.id, c.body, 'likes:' || c.listing_key,
    c.listing_key, null, c.created_at
  from public_comments c
  join visitors v on v.id = c.visitor_id
  where c.reply_to_visitor = ${visitorId} and c.visitor_id <> ${visitorId}`;

// The newest events for the page.
const loadEvents = cache(
  (visitorId: string) => sql<EventRow[]>`
    with me as (select activity_seen_at from visitors where id = ${visitorId}),
    events as (${eventsOf(visitorId)})
    select e.id, e.kind, e.who, e.who_id, e.body, e.about, e.listing_key, e.media_key, e.at,
      e.at > (select activity_seen_at from me) as unread
    from events e
    order by e.at desc
    limit ${EVENT_LIMIT}`,
);

// The same thing on the same comment (or, for new comments, the same home) on
// the same day is one row. Days are the homes' days, as on profiles (and as
// the bell counts them, in the database).
const rowKey = (item: { kind: string; about: string; at: Date | string }) =>
  `${item.kind}|${item.about}|${dayOf(item.at)}`;

// The same events for the page, each with its home's address and a photo.
const loadActivity = cache(async (visitorId: string): Promise<ActivityItem[]> => {
  const rows = await loadEvents(visitorId);
  if (rows.length === 0) return [];

  // Each home once: its address, and its photos in order for the thumbnail.
  const keys = [...new Set(rows.map((row) => row.listing_key))];
  const homes = await sql<{ listing_key: string; address: string; media: ListingMedia[] | null }[]>`
    select listing_key, data->>'UnparsedAddress' as address, data->'Media' as media
    from listings where listing_key in ${sql(keys)}`;
  const byKey = new Map(
    homes.map((home) => [
      home.listing_key,
      { address: home.address, media: [...(home.media ?? [])].sort((a, b) => a.Order - b.Order) },
    ]),
  );

  return rows.flatMap((row): ActivityItem[] => {
    const home = byKey.get(row.listing_key);
    if (!home) return [];
    const spot =
      row.media_key && row.media_key !== FACTS ? home.media.findIndex((m) => mediaKeyOf(m) === row.media_key) : -1;
    const index = spot >= 0 && !isVideo(home.media[spot]) ? spot : home.media.findIndex((m) => !isVideo(m));
    return [
      {
        id: row.id,
        kind: row.kind,
        who: row.who,
        whoId: row.who_id,
        body: row.body,
        about: row.about,
        listingKey: row.listing_key,
        address: home.address,
        photo: index >= 0 ? { url: home.media[index].MediaURL, index } : null,
        at: row.at.toISOString(),
        unread: row.unread,
      },
    ];
  });
});

// Repeats in one row, timed by its newest and new if any of it is: "Grace,
// Hannah and 2 others liked your comment".
export function groupActivity(items: ActivityItem[]): ActivityRow[] {
  const rows = new Map<string, ActivityRow>();
  for (const item of [...items].sort((a, b) => b.at.localeCompare(a.at))) {
    const key = rowKey(item);
    const row = rows.get(key);
    if (!row) {
      const { who, whoId, ...rest } = item;
      rows.set(key, { ...rest, people: [{ id: whoId, name: who }] });
      continue;
    }
    if (!row.people.some((person) => person.id === item.whoId)) row.people.push({ id: item.whoId, name: item.who });
    row.unread ||= item.unread;
  }
  return [...rows.values()];
}

// Who, as a row says it: "Grace", "Grace and Hannah", "Grace, Hannah and
// Ivy", then "Grace, Hannah and 2 others".
export function whoOf(people: { name: string }[]) {
  const names = people.map((person) => person.name);
  const shown = names.length > 3 ? names.slice(0, 2) : names;
  const others = names.length - shown.length;
  return { names: shown, others: others > 0 ? `${others} ${others === 1 ? "other" : "others"}` : null };
}

export const whoText = (people: { name: string }[]) => {
  const { names, others } = whoOf(people);
  const all = others ? [...names, others] : names;
  return all.length <= 1 ? (all[0] ?? "") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
};

// What happened, after who: "replied to your comment on 24611 SE Foxglove Pl".
export function describeActivity(row: Pick<ActivityRow, "kind" | "address">) {
  if (row.kind === "reply") return `replied to your comment on ${row.address}`;
  if (row.kind === "comment_like") return `liked your comment on ${row.address}`;
  if (row.kind === "like_reply") return `replied to your likes on ${row.address}`;
  return `commented on ${row.address}, a home you liked`;
}

// The words under a line, in quotes. A like is of your own comment; replies
// and new comments from several people quote the newest, so it says whose:
// "Hannah: “Same, with a coffee in hand.”"
export function quoteOf(row: Pick<ActivityRow, "kind" | "body" | "people">) {
  const quote = `“${row.body}”`;
  return row.kind !== "comment_like" && row.people.length > 1 ? `${row.people[0].name}: ${quote}` : quote;
}

export const ACTIVITY_SECTIONS = ["Today", "This week", "Earlier"] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

// A section's id, which its heading names it by: no spaces, or "This week"
// would name nothing. "activity-this-week".
export const sectionId = (title: ActivitySection) => `activity-${title.toLowerCase().replace(/\s+/g, "-")}`;

// "Today", "This week" (the six days before), or "Earlier".
export function activitySection(at: string, now: Date | number = Date.now()): ActivitySection {
  const days = daysBefore(dayOf(at), now);
  return days <= 0 ? "Today" : days < 7 ? "This week" : "Earlier";
}

// The page's rows, newest first.
export async function getActivityRows(visitorId: string) {
  return groupActivity(await loadActivity(visitorId)).slice(0, ROW_LIMIT);
}

// What the bell counts: rows with something new in them, as the page shows
// them. Only what's new is read, and only counted.
export async function countUnreadActivity(visitorId: string): Promise<number> {
  const [{ lines }] = await sql<{ lines: number }[]>`
    with events as (${eventsOf(visitorId)})
    select count(*)::int as lines from (
      select distinct e.kind, e.about, (e.at at time zone ${PROFILE_TIME_ZONE})::date
      from events e
      where e.at > (select activity_seen_at from visitors where id = ${visitorId})
    ) line`;
  return lines;
}
