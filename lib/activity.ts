import { cache } from "react";
import { sql } from "./db";
import type { ListingMedia } from "./listings/types";
import { photosFor } from "./person-photo";
import { FACTS, mediaKeyOf } from "./photos";
import { daysBefore, dayOf, isVideo, PROFILE_TIME_ZONE } from "./profile";

// What's happened that concerns someone, read from the tables themselves, so
// there's nothing extra to keep in sync. Each kind is only ever about the
// person reading it:
// - around their public activity: replies to and likes on their comments,
//   replies to their likes, new comments on homes they liked, new followers;
// - as someone on an agent's link: the link reaching them, and what the agent
//   said on it since they joined;
// - as an agent: what their clients did on their links (comments, likes and
//   requests to see a home; never passes, which stay on the dashboard).
export type ActivityKind =
  | "reply"
  | "comment_like"
  | "comment"
  | "like_reply"
  | "follow"
  | "link"
  | "agent_reply"
  | "agent_note"
  | "client_comment"
  | "client_like"
  | "client_ask";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  who: string;
  // Who it was, to tell two people of one name apart: their page's id, or
  // for someone on a link who hasn't signed up, their place on it.
  whoId: string;
  // Their page, where they have one.
  profileId: string | null;
  body: string;
  // What it's about: your comment (for a reply or a like), the home (for a
  // new comment on one you liked, or a reply to your likes on it), the person
  // and the home (for a client), the link (for a link that reached you).
  about: string;
  // The home it's on. A new follower is about no home.
  listingKey: string | null;
  address: string | null;
  // The photo it's about, else the home's first; `index` is its place in the
  // home's photos.
  photo: { url: string; index: number } | null;
  // The comment to open it on, where it's about one.
  commentId: string | null;
  // Where the line goes: worked out here, so the page never builds a URL.
  href: string;
  // A link that reached you: how many homes are on it.
  homes: number | null;
  // A new follower: whether you follow them already.
  following: boolean | null;
  at: string;
  unread: boolean;
};

export type ActivityPerson = { id: string; name: string; profileId: string | null; photo: string | null };

// One line on the page: the same thing happening more than once on one day
// (four likes on your comment) reads as one.
export type ActivityRow = Omit<ActivityItem, "who" | "whoId" | "profileId"> & {
  // Who, newest first, each once.
  people: ActivityPerson[];
};

// However much has happened, the page reads this many of the newest events,
// and shows this many lines of them: plenty, so a comment with a hundred likes
// in a day is one line with the rest still under it.
const EVENT_LIMIT = 500;
const ROW_LIMIT = 40;

type EventRow = {
  id: string;
  kind: ActivityKind;
  who: string;
  who_id: string;
  profile_id: string | null;
  body: string;
  about: string;
  listing_key: string | null;
  media_key: string | null;
  comment_id: string | null;
  // Where it goes, before the home and the comment: an agent's page about a
  // link, a client's link, someone's page.
  target: string | null;
  homes: number | null;
  at: Date;
  unread: boolean;
};

// Everything that's happened around someone. Each part is scoped to them:
// their own comments and likes, follows of them, links they're on (by their
// account), and links they're the agent of. An agent goes by their first
// name: on their page, else from their account.
const eventsOf = (visitorId: string) => sql`
  with self as (select id, account_id from visitors where id = ${visitorId})
  -- Replies to their public comments.
  select 'reply:' || c.id as id, 'reply' as kind, v.first_name as who, v.id::text as who_id, v.id::text as profile_id,
    c.body, mine.id::text as about, c.listing_key, mine.media_key, c.id::text as comment_id,
    null::text as target, null::int as homes, c.created_at as at
  from public_comments c
  join public_comments mine on mine.id = c.parent_id and mine.visitor_id = ${visitorId}
  join visitors v on v.id = c.visitor_id
  where c.visitor_id <> ${visitorId}
  union all
  -- Likes of their public comments.
  select 'like:' || cl.comment_id || ':' || cl.visitor_id, 'comment_like', v.first_name, v.id::text, v.id::text,
    mine.body, mine.id::text, mine.listing_key, mine.media_key, mine.id::text, null, null, cl.created_at
  from public_comment_likes cl
  join public_comments mine on mine.id = cl.comment_id and mine.visitor_id = ${visitorId}
  join visitors v on v.id = cl.visitor_id
  where cl.visitor_id <> ${visitorId}
  union all
  -- New comments on homes they liked.
  select 'comment:' || c.id, 'comment', v.first_name, v.id::text, v.id::text, c.body, c.listing_key, c.listing_key,
    c.media_key, c.id::text, null, null, c.created_at
  from public_comments c
  join public_reactions r on r.listing_key = c.listing_key
    and r.visitor_id = ${visitorId} and r.reaction = 'like'
  join visitors v on v.id = c.visitor_id
  where c.visitor_id <> ${visitorId} and c.parent_id is null and c.reply_to_visitor is null
    and c.created_at > r.updated_at
  union all
  -- Replies to their likes on a home.
  select 'like-reply:' || c.id, 'like_reply', v.first_name, v.id::text, v.id::text, c.body, 'likes:' || c.listing_key,
    c.listing_key, null, c.id::text, null, null, c.created_at
  from public_comments c
  join visitors v on v.id = c.visitor_id
  where c.reply_to_visitor = ${visitorId} and c.visitor_id <> ${visitorId}
  union all
  -- New followers. An agent and the people on their links follow each other
  -- as a link is first opened; that's no news to either of them.
  select 'follow:' || f.follower_id, 'follow', v.first_name, v.id::text, v.id::text, '', f.follower_id::text,
    null, null, null, '/people/' || f.follower_id, null, f.created_at
  from follows f
  join visitors v on v.id = f.follower_id
  cross join self
  where f.followed_id = ${visitorId} and btrim(v.first_name) <> ''
    and not exists (
      select 1 from participants p join shares s on s.id = p.share_id
      where (p.account_id = v.account_id and s.agent_id = self.account_id)
         or (p.account_id = self.account_id and s.agent_id = v.account_id))
  union all
  -- A link that reached them: an agent added them to it, by their account or
  -- by a name they've since claimed. Only while it has homes on it.
  select 'link:' || p.id, 'link',
    coalesce(nullif(btrim(av.first_name), ''), nullif(split_part(btrim(a.full_name), ' ', 1), ''), 'Your agent'),
    coalesce(av.id::text, 'account:' || a.id), av.id::text, s.note, p.id::text, first.listing_key, null, null,
    '/s/' || coalesce(p.token, s.token),
    (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null), p.invited_at
  from self
  join participants p on p.account_id = self.account_id
  join shares s on s.id = p.share_id
  join accounts a on a.id = s.agent_id
  left join visitors av on av.account_id = s.agent_id
  cross join lateral (
    select sl.listing_key from share_listings sl
    where sl.share_id = s.id and sl.removed_at is null
    order by sl.position limit 1
  ) first
  where p.invited_at is not null and s.agent_id <> self.account_id
  union all
  -- What the agent said on a link since they were on it, on a home still
  -- there: a reply once anyone has said something in that thread, else a note.
  select 'agent:' || c.id,
    case when c.parent_id is not null or c.reply_to_participant is not null or exists (
        select 1 from comments q
        where q.share_id = c.share_id and q.listing_key = c.listing_key
          and q.participant_id is not null and q.created_at < c.created_at)
      then 'agent_reply' else 'agent_note' end,
    coalesce(nullif(btrim(av.first_name), ''), nullif(split_part(btrim(a.full_name), ' ', 1), ''), 'Your agent'),
    coalesce(av.id::text, 'account:' || a.id), av.id::text, c.body, s.id || ':' || c.listing_key, c.listing_key,
    c.media_key, c.id::text, '/s/' || coalesce(p.token, s.token), null, c.created_at
  from self
  join participants p on p.account_id = self.account_id
  join shares s on s.id = p.share_id
  join accounts a on a.id = s.agent_id
  left join visitors av on av.account_id = s.agent_id
  join comments c on c.share_id = s.id and c.agent_id is not null and c.created_at > p.created_at
  join share_listings sl on sl.share_id = c.share_id and sl.listing_key = c.listing_key and sl.removed_at is null
  where s.agent_id <> self.account_id
  union all
  -- An agent's clients, on the agent's own links, by first name: what they
  -- said (but not the words an ask posts, which are the ask)...
  select 'client-comment:' || c.id, 'client_comment', p.first_name, coalesce(pv.id::text, 'participant:' || p.id),
    pv.id::text, c.body, p.id || ':' || c.listing_key, c.listing_key, c.media_key, c.id::text,
    '/dashboard/shares/' || s.id, null, c.created_at
  from self
  join shares s on s.agent_id = self.account_id
  join comments c on c.share_id = s.id
  join participants p on p.id = c.participant_id
  left join visitors pv on pv.account_id = p.account_id
  where (p.account_id is null or p.account_id <> self.account_id)
    and not exists (
      select 1 from share_asks k
      where k.participant_id = c.participant_id and k.listing_key = c.listing_key and k.asked_at = c.created_at)
  union all
  -- ...the homes they liked, or something in them...
  select 'client-like:' || x.id, 'client_like', p.first_name, coalesce(pv.id::text, 'participant:' || p.id),
    pv.id::text, '', p.id || ':' || x.listing_key, x.listing_key, x.media_key, null,
    '/dashboard/shares/' || s.id, null, x.at
  from self
  join shares s on s.agent_id = self.account_id
  join (
    select r.share_id, r.listing_key, r.participant_id, null::text as media_key, r.updated_at as at,
      r.participant_id || ':' || r.listing_key as id
    from reactions r where r.reaction = 'like'
    union all
    select pl.share_id, pl.listing_key, pl.participant_id, pl.media_key, pl.created_at,
      pl.participant_id || ':' || pl.listing_key || ':' || pl.media_key || ':' || pl.tag
    from photo_likes pl
  ) x on x.share_id = s.id
  join participants p on p.id = x.participant_id
  left join visitors pv on pv.account_id = p.account_id
  where p.account_id is null or p.account_id <> self.account_id
  union all
  -- ...and asking to see one in person.
  select 'client-ask:' || k.participant_id || ':' || k.listing_key, 'client_ask', p.first_name,
    coalesce(pv.id::text, 'participant:' || p.id), pv.id::text, '', p.id || ':' || k.listing_key, k.listing_key, null,
    (select c.id::text from comments c
      where c.share_id = k.share_id and c.listing_key = k.listing_key
        and c.participant_id = k.participant_id and c.created_at = k.asked_at
      limit 1),
    '/dashboard/shares/' || s.id, null, k.asked_at
  from self
  join shares s on s.agent_id = self.account_id
  join share_asks k on k.share_id = s.id
  join participants p on p.id = k.participant_id
  left join visitors pv on pv.account_id = p.account_id
  where p.account_id is null or p.account_id <> self.account_id`;

// The newest events for the page.
const loadEvents = cache(
  (visitorId: string) => sql<EventRow[]>`
    with me as (select activity_seen_at from visitors where id = ${visitorId}),
    events as (${eventsOf(visitorId)})
    select e.id, e.kind, e.who, e.who_id, e.profile_id, e.body, e.about, e.listing_key, e.media_key, e.comment_id,
      e.target, e.homes, e.at, e.at > (select activity_seen_at from me) as unread
    from events e
    order by e.at desc
    limit ${EVENT_LIMIT}`,
);

// The same thing on the same comment (or, for new comments, the same home; for
// a client, the same person and home) on the same day is one row. Days are
// the homes' days, as on profiles (and as the bell counts them, in the database).
const rowKey = (item: { kind: string; about: string; at: Date | string }) =>
  `${item.kind}|${item.about}|${dayOf(item.at)}`;

const PUBLIC_KINDS = new Set<ActivityKind>(["reply", "comment_like", "comment", "like_reply"]);
const CLIENT_KINDS = new Set<ActivityKind>(["client_comment", "client_like", "client_ask"]);
const AGENT_KINDS = new Set<ActivityKind>(["link", "agent_reply", "agent_note"]);

// Who it's from, for a line only the reader sees: their client, or their
// agent. Null for everything else.
export const relationOf = (kind: ActivityKind) =>
  CLIENT_KINDS.has(kind) ? "Your client" : AGENT_KINDS.has(kind) ? "Your agent" : null;

// Where a line goes:
// - a public line: the home, on the photo it's about, with the comment open;
// - an agent's line about a client: their page about the link, at the comment
//   or the home;
// - a client's line from their agent: their link, on that home and comment;
// - a follower, or a link that reached you: as the database says.
function hrefOf(row: EventRow, photoIndex: number | null) {
  const key = row.listing_key ? encodeURIComponent(row.listing_key) : null;
  if (PUBLIC_KINDS.has(row.kind) && key) {
    const query = [photoIndex !== null ? `photo=${photoIndex}` : null, row.comment_id ? `comment=${row.comment_id}` : null];
    const search = query.filter(Boolean).join("&");
    return `/homes/${key}${search ? `?${search}` : ""}`;
  }
  if (CLIENT_KINDS.has(row.kind) && row.target) {
    const spot = row.comment_id ? `#comment-${row.comment_id}` : key ? `#home-${key}` : "";
    return `${row.target}?tab=homes${spot}`;
  }
  if ((row.kind === "agent_reply" || row.kind === "agent_note") && row.target && key) {
    return `${row.target}?home=${key}${row.comment_id ? `&comment=${row.comment_id}` : ""}`;
  }
  return row.target ?? "/activity";
}

// The same events for the page, each with its home's address and a photo,
// and where it goes.
const loadActivity = cache(async (visitorId: string): Promise<ActivityItem[]> => {
  const rows = await loadEvents(visitorId);
  if (rows.length === 0) return [];

  // Each home once: its address, and its photos in order for the thumbnail.
  // And which of the new followers they follow already.
  const keys = [...new Set(rows.flatMap((row) => (row.listing_key ? [row.listing_key] : [])))];
  const followers = rows.flatMap((row) => (row.kind === "follow" ? [row.who_id] : []));
  const [homes, followed] = await Promise.all([
    keys.length > 0
      ? sql<{ listing_key: string; address: string; media: ListingMedia[] | null }[]>`
          select listing_key, data->>'UnparsedAddress' as address, data->'Media' as media
          from listings where listing_key in ${sql(keys)}`
      : [],
    followers.length > 0
      ? sql<{ followed_id: string }[]>`
          select followed_id from follows where follower_id = ${visitorId} and followed_id in ${sql(followers)}`
      : [],
  ]);
  const byKey = new Map(
    homes.map((home) => [
      home.listing_key,
      { address: home.address, media: [...(home.media ?? [])].sort((a, b) => a.Order - b.Order) },
    ]),
  );
  const following = new Set(followed.map((row) => row.followed_id));

  return rows.flatMap((row): ActivityItem[] => {
    const home = row.listing_key ? byKey.get(row.listing_key) : undefined;
    // A line about a home that's gone has nowhere to go.
    if (row.listing_key && !home) return [];
    let index = -1;
    if (home) {
      const spot =
        row.media_key && row.media_key !== FACTS ? home.media.findIndex((m) => mediaKeyOf(m) === row.media_key) : -1;
      index = spot >= 0 && !isVideo(home.media[spot]) ? spot : home.media.findIndex((m) => !isVideo(m));
    }
    return [
      {
        id: row.id,
        kind: row.kind,
        who: row.who,
        whoId: row.who_id,
        profileId: row.profile_id,
        body: row.body,
        about: row.about,
        listingKey: row.listing_key,
        address: home?.address ?? null,
        photo: home && index >= 0 ? { url: home.media[index].MediaURL, index } : null,
        commentId: row.comment_id,
        href: hrefOf(row, index >= 0 ? index : null),
        homes: row.homes,
        following: row.kind === "follow" ? following.has(row.who_id) : null,
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
    const person: ActivityPerson = { id: item.whoId, name: item.who, profileId: item.profileId, photo: null };
    if (!row) {
      rows.set(key, {
        id: item.id,
        kind: item.kind,
        body: item.body,
        about: item.about,
        listingKey: item.listingKey,
        address: item.address,
        photo: item.photo,
        commentId: item.commentId,
        href: item.href,
        homes: item.homes,
        following: item.following,
        at: item.at,
        unread: item.unread,
        people: [person],
      });
      continue;
    }
    if (!row.people.some((known) => known.id === item.whoId)) row.people.push(person);
    row.unread ||= item.unread;
  }
  return [...rows.values()];
}

// Who, as a row says it: "Grace", "Grace and Hannah", "Grace, Hannah and
// Ivy", then "Grace, Hannah and 2 others". `people`: the ones named.
export function whoOf<P extends { name: string }>(people: P[]) {
  const shown = people.length > 3 ? people.slice(0, 2) : people;
  const others = people.length - shown.length;
  return {
    names: shown.map((person) => person.name),
    people: shown,
    others: others > 0 ? `${others} ${others === 1 ? "other" : "others"}` : null,
  };
}

export const whoText = (people: { name: string }[]) => {
  const { names, others } = whoOf(people);
  const all = others ? [...names, others] : names;
  return all.length <= 1 ? (all[0] ?? "") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
};

// What happened, after who: "replied to your comment on 24611 SE Foxglove Pl".
export function describeActivity(row: Pick<ActivityRow, "kind" | "address"> & { homes?: number | null }) {
  const address = row.address ?? "a home";
  switch (row.kind) {
    case "reply":
      return `replied to your comment on ${address}`;
    case "comment_like":
      return `liked your comment on ${address}`;
    case "like_reply":
      return `replied to your likes on ${address}`;
    case "comment":
      return `commented on ${address}, a home you liked`;
    case "follow":
      return "started following you";
    case "link":
      return `sent you ${row.homes === 1 ? "a home" : `${row.homes ?? "some"} homes`}`;
    case "agent_reply":
      return `replied on ${address}`;
    case "agent_note":
      return `left a note on ${address}`;
    case "client_comment":
      return `commented on ${address}`;
    case "client_like":
      return `liked ${address}`;
    case "client_ask":
      return `asked to see ${address}`;
  }
}

// The words under a line, in quotes, where there are any. A like is of your
// own comment; replies and new comments from several people quote the
// newest, so it says whose: "Hannah: “Same, with a coffee in hand.”"
export function quoteOf(row: Pick<ActivityRow, "kind" | "body" | "people">) {
  if (!row.body.trim()) return null;
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

// The page's rows, newest first, with each person's own photo where they've
// added one.
export async function getActivityRows(visitorId: string): Promise<ActivityRow[]> {
  const rows = groupActivity(await loadActivity(visitorId)).slice(0, ROW_LIMIT);
  const photos = await photosFor(rows.flatMap((row) => row.people.flatMap((person) => person.profileId ?? [])));
  return rows.map((row) => ({
    ...row,
    people: row.people.map((person) => ({
      ...person,
      photo: person.profileId ? (photos.get(person.profileId) ?? null) : null,
    })),
  }));
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
