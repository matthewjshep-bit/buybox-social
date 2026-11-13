import { cache } from "react";
import { sql } from "./db";
import { photoUrl } from "./person-photo";
import type { Listing, ListingMedia } from "./listings/types";
import type { ContextSpot } from "./reel-context";
import {
  aspectOfFact,
  aspectOfTag,
  FACTS,
  isPointTag,
  mediaKeyOf,
  spotName,
  tagNameIn,
  tagPhrase,
  tagPosition,
  thingOf,
} from "./photos";
import { ASPECTS, aspectLabel, describeReaction, NO_REACTION, type Aspect, type ReactionState, type Sentiment } from "./reactions";

// Someone's public page: everything they've liked, passed on and said in
// public, as a feed of one card per home per day. It reads their own public
// rows (and the names of people they replied to, which are public too). What
// a client does on an agent's link never appears here. An agent's own marks
// on the homes they send do: what they liked and didn't in each, and their
// notes on them (never their replies to a client, which are that client's
// conversation), as theirs, on their page.

// Days start and end here, where the homes are, whoever is looking.
export const PROFILE_TIME_ZONE = "America/Los_Angeles";

// Cards per page, before "Show earlier".
export const PROFILE_PAGE = 20;

// However busy someone is, a page reads at most this many of each kind of thing.
export const PROFILE_ROW_LIMIT = 500;

export const PROFILE_FILTERS = { all: "All", liked: "Liked", passed: "Passed", comments: "Comments" } as const;
export type ProfileShow = keyof typeof PROFILE_FILTERS;

export const isProfileShow = (value: unknown): value is ProfileShow =>
  typeof value === "string" && Object.hasOwn(PROFILE_FILTERS, value);

// A topic from "Loves" is about what they liked; from "Passes on", what they didn't.
export type TopicSide = "like" | "pass";

export const isTopicSide = (value: unknown): value is TopicSide => value === "like" || value === "pass";

export type PinKind = "like" | "dislike" | "comment";

export type ProfileComment = {
  id: string;
  body: string;
  at: string;
  // What it's about, if it's about a spot or a fact: "the front door".
  spot: { name: string; fact: boolean } | null;
  // Who it answered, when it's a reply to someone else.
  replyTo: { name: string; profileId: string } | null;
  likes: number;
  replies: number;
};

// What you can take back from a card, on your own page: your like or pass on
// the home, your likes and dislikes of what's in it (one per name: "the front
// door"), and your comments, which can't go once someone else has replied.
export type CardControl =
  | { kind: "reaction"; sentiment: Sentiment }
  | { kind: "spots"; sentiment: Sentiment; name: string; spots: { mediaKey: string; tag: string }[] }
  | { kind: "comment"; id: string; body: string; answered: boolean; replies: number };

export type ProfileCard = {
  id: string;
  // The calendar day it all happened on, in PROFILE_TIME_ZONE: "2026-11-06".
  day: string;
  // The newest thing in it.
  at: string;
  home: {
    key: string;
    address: string;
    city: string;
    price: number;
    beds: number;
    baths: number;
    sqft: number;
    active: boolean;
  };
  // What they did, without their name: "liked the front door and kitchen island".
  sentence: string;
  // The same, as anyone else may see it on a new surface (the take on a home
  // in the pop-out): what they liked, or else that they commented, never what
  // they didn't like or passed on ("" when that leaves nothing).
  likeSentence: string;
  // The photo of the newest thing they liked or said something about, else
  // the home's first; `index` is its place in the home's photos.
  photo: { url: string; index: number; alt: string; width?: number; height?: number } | null;
  // Where on that photo, newest first: the first one is drawn as their avatar.
  pins: { x: number; y: number; kind: PinKind }[];
  // Other photos of the home they did something on that day.
  otherPhotos: number;
  // The facts they liked or didn't: "the price" (and its tag, "Price", to open it).
  facts: { kind: "like" | "dislike"; phrase: string; tag: string }[];
  // Everything they picked out in the photos that day, newest first, each
  // once, by name ("the front door"), to go to.
  spots: ContextSpot[];
  comments: ProfileComment[];
  // Comments by others they liked. Only ever on their own page.
  likedComments: { author: string; body: string }[];
  // A day when all they did was like others' comments.
  quiet: boolean;
  // What they can take back from it, on their own page: the like or pass,
  // what's in it (newest first), then their comments as the card shows them.
  controls: CardControl[];
  // In step with the counts at the top: a liked home's likes, a passed home's passes.
  liked: boolean;
  passed: boolean;
  commented: boolean;
  // Lower-case things and specifics it's about, for `?about=`: everything,
  // what they liked, and what they didn't.
  about: string[];
  loves: string[];
  passes: string[];
};

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROFILE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-11-06", the day it was where the homes are.
export const dayOf = (at: Date | string) => DAY.format(new Date(at));

const utcDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// How many days, and calendar months, a day is before today.
export const daysBefore = (day: string, now: Date | number) =>
  Math.round((+utcDay(dayOf(new Date(now))) - +utcDay(day)) / 86_400_000);
const monthsBefore = (day: string, now: Date | number) => {
  const today = utcDay(dayOf(new Date(now)));
  const date = utcDay(day);
  return (today.getUTCFullYear() - date.getUTCFullYear()) * 12 + today.getUTCMonth() - date.getUTCMonth();
};

// The heading over a day's cards: "Today", "Yesterday", "Earlier this week",
// then the date ("October 28") for this month and last, then just the month.
export function dayHeading(day: string, now: Date | number = Date.now()) {
  const days = daysBefore(day, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  return utcDay(day).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    ...(monthsBefore(day, now) <= 1 ? { day: "numeric" } : { year: "numeric" }),
  });
}

// One exact day, to tell two cards of one home apart: "Today", "Yesterday",
// "November 4", or "September 14, 2025" in another year.
export function dayName(day: string, now: Date | number = Date.now()) {
  const days = daysBefore(day, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const date = utcDay(day);
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    ...(date.getUTCFullYear() !== utcDay(dayOf(new Date(now))).getUTCFullYear() && { year: "numeric" }),
  });
}

const CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: PROFILE_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: PROFILE_TIME_ZONE, weekday: "short" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { timeZone: PROFILE_TIME_ZONE, month: "short", day: "numeric" });

// "9:22 pm", where the homes are.
const clockOf = (date: Date) => {
  const part = Object.fromEntries(CLOCK.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part.hour}:${part.minute} ${part.dayPeriod.toLowerCase()}`;
};

// When, beside a card, adding only what its day's heading doesn't say: "2h"
// today, "9:22 pm" under a day, "Wed 9:22 pm" earlier this week, and "Sep 14"
// under a month.
export function cardTime(at: string, now: Date | number = Date.now()) {
  const date = new Date(at);
  const day = dayOf(date);
  const days = daysBefore(day, now);
  if (days <= 0) {
    const minutes = Math.floor((+new Date(now) - +date) / 60_000);
    if (minutes < 1) return "just now";
    return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  }
  if (days === 1) return clockOf(date);
  if (days < 7) return `${WEEKDAY.format(date)} ${clockOf(date)}`;
  return monthsBefore(day, now) <= 1 ? clockOf(date) : MONTH_DAY.format(date);
}

// "March", or "March 2025" when it wasn't this year.
export function sinceLabel(at: string, now: Date | number = Date.now()) {
  const year = (d: Date) => d.toLocaleDateString("en-US", { timeZone: PROFILE_TIME_ZONE, year: "numeric" });
  const date = new Date(at);
  return date.toLocaleDateString("en-US", {
    timeZone: PROFILE_TIME_ZONE,
    month: "long",
    ...(year(date) !== year(new Date(now)) && { year: "numeric" }),
  });
}

// "the front door"; "a spot in photo 3"; "the price": as the reel says it.
export { spotName };

export const isVideo = (photo: ListingMedia) =>
  photo.MediaCategory === "Video" || /\.(mp4|webm|mov)(\?|$)/i.test(photo.MediaURL);

// "Sam", "Sam and Ana", "Sam, Ana and Lee"
const names = (list: string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

export type ReactionRow = ReactionState & { listing_key: string; at: Date };
// `link`: an agent's own, from one of their links, rather than in public. It
// shows like the rest, but is taken back on the link, not from their page.
export type SpotRow = {
  listing_key: string;
  media_key: string;
  tag: string;
  aspect?: Aspect | null;
  at: Date;
  link?: boolean;
};
export type CommentRow = {
  id: string;
  listing_key: string;
  body: string;
  at: Date;
  media_key: string | null;
  spot: string | null;
  reply_to_id: string | null;
  reply_to_name: string | null;
  likes: number;
  replies: number;
  // Replies from anyone else (unknown: treated as all of them).
  others_replies?: number;
  link?: boolean;
};
type CommentLikeRow = { listing_key: string; author: string; body: string; at: Date };

export type ProfileRows = {
  reactions: ReactionRow[];
  likes: SpotRow[];
  dislikes: SpotRow[];
  comments: CommentRow[];
  commentLikes: CommentLikeRow[];
  listings: Map<string, Listing>;
  // Each home's like or pass as it stands now, whenever it was made.
  standing: Map<string, Sentiment>;
  // When a kind of thing had more than PROFILE_ROW_LIMIT to read: the oldest
  // one read. Days up to that one's may be missing things.
  floor: Date | null;
  // Homes they did more with later on the day a page starts from: that day's
  // card for each was on the page before.
  later: Set<string>;
  // The same, leaving out passes, for a page that keeps them private.
  laterKept?: Set<string>;
};

// How far past `before` a page looks for more that same day (no day is longer
// than 25 hours).
const restOfDay = (before: Date) => new Date(+before + 25 * 3_600_000);

// The account behind a page, when it's an agent's: their marks on their own
// links are theirs on their page too.
const agentAccountOf = cache(async (visitorId: string): Promise<string | null> => {
  const [row] = await sql<{ id: string }[]>`
    select a.id from visitors v join accounts a on a.id = v.account_id
    where v.id::text = ${visitorId} and a.role = 'agent'`;
  return row?.id ?? null;
});

// An agent's likes (or dislikes) of things in the homes on their own links.
// (With no agent, nothing.)
const agentMarks = (account: string | null, reaction: "like" | "dislike") => sql`
  from share_agent_likes al join shares s on s.id = al.share_id
  where s.agent_id = ${account} and al.reaction = ${reaction}`;

// An agent's own notes on the homes on their links: what they wrote on a
// spot or a fact, or about a home before any client had said anything there.
// Never a reply: that's the client's conversation, and stays on the link.
const agentNotes = (account: string | null) => sql`
  from comments c join shares s on s.id = c.share_id
  where s.agent_id = ${account} and c.agent_id = ${account}
    and c.parent_id is null and c.reply_to_participant is null
    and (c.spot is not null or not exists (
      select 1 from comments x
      where x.share_id = c.share_id and x.listing_key = c.listing_key
        and x.participant_id is not null and x.created_at < c.created_at))`;

// Each thing once: the first of each in `rows` (the public one, before the
// same from a link), newest first.
function onceEach<T extends { at: Date }>(rows: T[], key: (row: T) => string) {
  const seen = new Set<string>();
  return rows
    .filter((row) => !seen.has(key(row)) && Boolean(seen.add(key(row))))
    .sort((a, b) => +b.at - +a.at)
    .slice(0, PROFILE_ROW_LIMIT);
}
const spotKey = (row: SpotRow) => `${row.listing_key}|${row.media_key}|${row.tag}`;

// Their public rows, newest first, from before `before` (when given), and an
// agent's own from their links. Comment likes they gave only for their own
// page (`mine`).
const loadRows = cache(async (visitorId: string, before: string | null, mine: boolean): Promise<ProfileRows> => {
  const until = before ? new Date(before) : null;
  const end = until && restOfDay(until);
  const account = await agentAccountOf(visitorId);
  const linkMarks = (reaction: "like" | "dislike") =>
    account
      ? sql<SpotRow[]>`
          select al.listing_key, al.media_key, al.tag, al.created_at as at, true as link
          ${agentMarks(account, reaction)} ${until ? sql`and al.created_at < ${until}` : sql``}
          order by al.created_at desc
          limit ${PROFILE_ROW_LIMIT}`
      : Promise.resolve([] as SpotRow[]);
  const [reactions, publicLikes, publicDislikes, publicComments, commentLikes, after, linkLikes, linkDislikes, notes] =
    await Promise.all([
    sql<ReactionRow[]>`
      select listing_key, reaction, liked, disliked, updated_at as at
      from public_reactions
      where visitor_id = ${visitorId} ${until ? sql`and updated_at < ${until}` : sql``}
      order by updated_at desc
      limit ${PROFILE_ROW_LIMIT}`,
    sql<SpotRow[]>`
      select listing_key, media_key, tag, aspect, created_at as at
      from public_photo_likes
      where visitor_id = ${visitorId} ${until ? sql`and created_at < ${until}` : sql``}
      order by created_at desc
      limit ${PROFILE_ROW_LIMIT}`,
    sql<SpotRow[]>`
      select listing_key, media_key, tag, created_at as at
      from public_photo_dislikes
      where visitor_id = ${visitorId} ${until ? sql`and created_at < ${until}` : sql``}
      order by created_at desc
      limit ${PROFILE_ROW_LIMIT}`,
    // A reply is about whatever the comment it answers is about, and names
    // who wrote that (unless it was them).
    sql<CommentRow[]>`
      select c.id, c.listing_key, c.body, c.created_at as at,
        coalesce(c.media_key, p.media_key) as media_key, coalesce(c.spot, p.spot) as spot,
        pv.id as reply_to_id, pv.first_name as reply_to_name,
        (select count(*)::int from public_comment_likes cl where cl.comment_id = c.id) as likes,
        (select count(*)::int from public_comments r where r.parent_id = c.id) as replies,
        (select count(*)::int from public_comments r
          where r.parent_id = c.id and r.visitor_id <> c.visitor_id) as others_replies
      from public_comments c
      left join public_comments p on p.id = c.parent_id
      -- (Or, for a reply to someone's likes, them.)
      left join visitors pv on pv.id = coalesce(p.visitor_id, c.reply_to_visitor) and pv.id <> c.visitor_id
      where c.visitor_id = ${visitorId} ${until ? sql`and c.created_at < ${until}` : sql``}
      order by c.created_at desc
      limit ${PROFILE_ROW_LIMIT}`,
    mine
      ? sql<CommentLikeRow[]>`
          select c.listing_key, v.first_name as author, c.body, cl.created_at as at
          from public_comment_likes cl
          join public_comments c on c.id = cl.comment_id
          join visitors v on v.id = c.visitor_id
          where cl.visitor_id = ${visitorId} and c.visitor_id <> ${visitorId}
            ${until ? sql`and cl.created_at < ${until}` : sql``}
          order by cl.created_at desc
          limit ${PROFILE_ROW_LIMIT}`
      : Promise.resolve([] as CommentLikeRow[]),
    // The first thing they did on each home at or after `before`, that day or
    // the next, and the first that wasn't a pass.
    until && end
      ? sql<{ listing_key: string; at: Date; kept_at: Date | null }[]>`
          select listing_key, min(at) as at, min(at) filter (where not pass) as kept_at from (
            select listing_key, updated_at as at, reaction = 'dislike' as pass from public_reactions
              where visitor_id = ${visitorId} and updated_at >= ${until} and updated_at < ${end}
            union all
            select listing_key, created_at, exists (select 1 from public_reactions r
                where r.visitor_id = ${visitorId} and r.listing_key = pl.listing_key and r.reaction = 'dislike')
              from public_photo_likes pl
              where visitor_id = ${visitorId} and created_at >= ${until} and created_at < ${end}
            union all
            select listing_key, created_at, true from public_photo_dislikes
              where visitor_id = ${visitorId} and created_at >= ${until} and created_at < ${end}
            union all
            select listing_key, created_at, false from public_comments
              where visitor_id = ${visitorId} and created_at >= ${until} and created_at < ${end}
            union all
            select al.listing_key, al.created_at, al.reaction = 'dislike' from share_agent_likes al
              join shares s on s.id = al.share_id
              where s.agent_id = ${account} and al.created_at >= ${until} and al.created_at < ${end}
            union all
            select c.listing_key, c.created_at, false ${agentNotes(account)}
              and c.created_at >= ${until} and c.created_at < ${end}
            ${
              mine
                ? sql`union all
                    select c.listing_key, cl.created_at, false from public_comment_likes cl
                    join public_comments c on c.id = cl.comment_id
                    where cl.visitor_id = ${visitorId} and c.visitor_id <> ${visitorId}
                      and cl.created_at >= ${until} and cl.created_at < ${end}`
                : sql``
            }
          ) t
          group by listing_key`
      : Promise.resolve([] as { listing_key: string; at: Date; kept_at: Date | null }[]),
    linkMarks("like"),
    linkMarks("dislike"),
    account
      ? sql<CommentRow[]>`
          select * from (
            select distinct on (c.listing_key, c.spot, c.body) c.id, c.listing_key, c.body, c.created_at as at,
              c.media_key, c.spot, null::uuid as reply_to_id, null::text as reply_to_name,
              (select count(*)::int from share_comment_likes cl where cl.comment_id = c.id) as likes,
              (select count(*)::int from comments r where r.parent_id = c.id) as replies,
              true as link
            ${agentNotes(account)} ${until ? sql`and c.created_at < ${until}` : sql``}
            -- The same note on several links is one note: the newest.
            order by c.listing_key, c.spot, c.body, c.created_at desc
          ) n
          order by at desc
          limit ${PROFILE_ROW_LIMIT}`
      : Promise.resolve([] as CommentRow[]),
  ]);
  // A thing liked in public and on a link (or on two links) is liked once.
  const likes = onceEach([...publicLikes, ...linkLikes], spotKey);
  const dislikes = onceEach([...publicDislikes, ...linkDislikes], spotKey);
  const comments = [...publicComments, ...notes].sort((a, b) => +b.at - +a.at);

  // Each home once, its photos in order, its status from the column, and
  // their like or pass on it as it stands.
  const keys = [
    ...new Set([...reactions, ...likes, ...dislikes, ...comments, ...commentLikes].map((row) => row.listing_key)),
  ];
  const homes = keys.length
    ? await sql<{ listing_key: string; standard_status: string; data: Listing; reaction: Sentiment | null }[]>`
        select l.listing_key, l.standard_status, l.data, r.reaction
        from listings l
        left join public_reactions r on r.listing_key = l.listing_key and r.visitor_id = ${visitorId}
        where l.listing_key in ${sql(keys)}`
    : [];
  const listings = new Map(
    homes.map((row) => [
      row.listing_key,
      {
        ...row.data,
        StandardStatus: row.standard_status,
        Media: [...row.data.Media].sort((a, b) => a.Order - b.Order),
      },
    ]),
  );
  const standing = new Map(homes.flatMap((row) => (row.reaction ? [[row.listing_key, row.reaction] as const] : [])));
  const floors = [reactions, publicLikes, publicDislikes, publicComments, commentLikes, linkLikes, linkDislikes, notes].flatMap((list) =>
    list.length >= PROFILE_ROW_LIMIT ? [+list.at(-1)!.at] : [],
  );
  const day = until && dayOf(until);
  return {
    reactions,
    likes,
    dislikes,
    comments,
    commentLikes,
    listings,
    standing,
    floor: floors.length ? new Date(Math.max(...floors)) : null,
    later: new Set(after.filter((row) => dayOf(row.at) === day).map((row) => row.listing_key)),
    laterKept: new Set(
      after.filter((row) => row.kept_at && dayOf(row.kept_at) === day).map((row) => row.listing_key),
    ),
  };
});

// Their rows as someone else sees them when they keep passes private: no
// passes, nothing they did on a home they passed on (a like there would give
// the pass away), no spots or facts they didn't like, and nothing said against
// a home they liked. Comments stay: they're words, not passes.
// (Where the read stopped short stays as it was: at worst a page ends a little sooner.)
export function withoutPasses(rows: ProfileRows): ProfileRows {
  return {
    ...rows,
    reactions: rows.reactions.filter((r) => r.reaction !== "dislike").map((r) => ({ ...r, disliked: [] })),
    likes: rows.likes.filter((row) => rows.standing.get(row.listing_key) !== "dislike"),
    dislikes: [],
    standing: new Map([...rows.standing].filter(([, sentiment]) => sentiment !== "dislike")),
    later: rows.laterKept ?? rows.later,
  };
}

// Everything public they've done, newest first, for what their page says
// about them overall (their taste). Read once per page, with the feed's first page.
export const getProfileRows = (visitorId: string, mine: boolean) => loadRows(visitorId, null, mine);

// The person behind a profile: only their first name, when they joined,
// whether they're an agent (whose face is ink, as everywhere) and what they
// keep off their page.
export const getProfilePerson = cache(async (visitorId: string) => {
  const [visitor] = await sql<
    {
      id: string;
      first_name: string;
      created_at: Date;
      hide_passes: boolean;
      taste_hidden: unknown;
      is_agent: boolean;
      photo_v: string | null;
    }[]
  >`
    select v.id, v.created_at, v.hide_passes, v.taste_hidden,
      -- An account with no name yet has none here either, even where an
      -- older visitor row stood in with "Someone".
      case when a.id is not null and btrim(a.full_name) = '' then '' else v.first_name end as first_name,
      coalesce(a.role = 'agent', false) as is_agent, left(md5(a.photo_data_url), 10) as photo_v
    from visitors v left join accounts a on a.id = v.account_id
    where v.id::text = ${visitorId}`;
  if (!visitor) return null;
  const hidden = Array.isArray(visitor.taste_hidden) ? visitor.taste_hidden : [];
  return {
    id: visitor.id,
    name: visitor.first_name,
    since: visitor.created_at.toISOString(),
    isAgent: visitor.is_agent,
    // Their own photo, where they've added one.
    photo: photoUrl(visitor.id, visitor.photo_v),
    hidePasses: visitor.hide_passes,
    // Lower-case keys of the things their taste says that they've switched off.
    tasteHidden: hidden.filter((key): key is string => typeof key === "string").map((key) => key.toLowerCase()),
  };
});

export type ProfilePerson = NonNullable<Awaited<ReturnType<typeof getProfilePerson>>>;

export const photoOf = (listing: Listing, mediaKey: string) => listing.Media.find((m) => mediaKeyOf(m) === mediaKey);

// The specific a liked or disliked spot or fact counts toward.
export const aspectOf = (listing: Listing, row: SpotRow): Aspect | null => {
  if (row.aspect !== undefined) return row.aspect;
  if (row.media_key === FACTS) return aspectOfFact(row.tag);
  const photo = photoOf(listing, row.media_key);
  return photo ? aspectOfTag(photo, thingOf(photo, row.tag) ?? row.tag) : null;
};

// The known thing a spot is on ("Front door"), if any. Facts aren't things.
export const thingAt = (listing: Listing, mediaKey: string, tag: string) =>
  mediaKey === FACTS ? null : thingOf(photoOf(listing, mediaKey), tag);

// Named things a sentence lists on one side before "and 2 more".
const SENTENCE_THINGS = 3;

// What they did that day, short enough to take in at a glance: at most three
// things a side, newest first, then "and 2 more". Unnamed spots are left to
// the pins once something on that side has a name, and facts to their chips
// once there's anything else to say.
function sentenceOf(listing: Listing, reaction: ReactionRow | null, likes: SpotRow[], dislikes: SpotRow[]) {
  type Item = { name: string; at: number; fact: boolean };
  const items = (aspects: Aspect[], rows: SpotRow[]): Item[] => [
    ...(reaction ? aspects.map((aspect) => ({ name: aspectLabel(aspect), at: +reaction.at, fact: false })) : []),
    ...rows.map((row) => ({
      name: tagNameIn(listing, row.media_key, row.tag),
      at: +row.at,
      fact: row.media_key === FACTS,
    })),
  ];
  const liked = items(reaction?.liked ?? [], likes);
  const disliked = items(reaction?.disliked ?? [], dislikes);
  const moreThanFacts = Boolean(reaction) || [...liked, ...disliked].some((item) => !item.fact);
  const side = (list: Item[]) => {
    const kept = list.filter((item) => !(item.fact && moreThanFacts));
    const named = kept.filter((item) => !isPointTag(item.name));
    if (named.length === 0) return kept.map((item) => item.name);
    const seen = new Set<string>();
    const unique = named
      .sort((a, b) => b.at - a.at)
      .filter((item) => !seen.has(item.name.toLowerCase()) && Boolean(seen.add(item.name.toLowerCase())))
      .map((item) => item.name);
    return unique.length > SENTENCE_THINGS + 1
      ? [...unique.slice(0, SENTENCE_THINGS), `${unique.length - SENTENCE_THINGS} more`]
      : unique;
  };
  return describeReaction({ reaction: reaction?.reaction ?? null, liked: [], disliked: [] }, side(liked), side(disliked));
}

// "a second", "a third"… for spots with no name that share a photo.
const ORDINALS = ["second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

// One way to take back each thing they liked (or didn't) on a card, by how
// it reads: two spots on the front door are one "the front door". Spots with
// no name stay apart, each its own: "a spot in photo 3", "a second spot in
// photo 3". Newest first.
function spotControls(listing: Listing, sentiment: Sentiment, rows: SpotRow[]): CardControl[] {
  const byName = new Map<string, { mediaKey: string; tag: string }[]>();
  const unnamed = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => +b.at - +a.at)) {
    const spot = { mediaKey: row.media_key, tag: row.tag };
    let name = spotName(listing, spot);
    const photo = listing.Media.find((m) => mediaKeyOf(m) === row.media_key);
    if (row.media_key !== FACTS && !thingOf(photo, row.tag)) {
      const n = unnamed.get(name) ?? 0;
      unnamed.set(name, n + 1);
      if (n > 0) name = name.replace(/^a spot/, ORDINALS[n - 1] ? `a ${ORDINALS[n - 1]} spot` : `spot ${n + 1}`);
    }
    byName.set(name, [...(byName.get(name) ?? []), spot]);
  }
  return [...byName].map(([name, spots]) => ({ kind: "spots", sentiment, name, spots }));
}

// One card per home per day, newest first, from rows as `loadRows` gives them.
export function buildCards(rows: ProfileRows): ProfileCard[] {
  type Bucket = {
    listing: Listing;
    day: string;
    at: Date;
    reaction: ReactionRow | null;
    likes: SpotRow[];
    dislikes: SpotRow[];
    comments: CommentRow[];
    commentLikes: CommentLikeRow[];
  };
  const buckets = new Map<string, Bucket>();
  const bucket = (row: { listing_key: string; at: Date }) => {
    const listing = rows.listings.get(row.listing_key);
    if (!listing) return null;
    const day = dayOf(row.at);
    const id = `${row.listing_key}|${day}`;
    const entry = buckets.get(id) ?? {
      listing,
      day,
      at: row.at,
      reaction: null,
      likes: [],
      dislikes: [],
      comments: [],
      commentLikes: [],
    };
    if (row.at > entry.at) entry.at = row.at;
    buckets.set(id, entry);
    return entry;
  };
  // The overall reaction belongs to the day it was last changed.
  for (const row of rows.reactions) {
    const entry = bucket(row);
    if (entry) entry.reaction = row;
  }
  for (const row of rows.likes) bucket(row)?.likes.push(row);
  for (const row of rows.dislikes) bucket(row)?.dislikes.push(row);
  for (const row of rows.comments) bucket(row)?.comments.push(row);
  for (const row of rows.commentLikes) bucket(row)?.commentLikes.push(row);

  const oldestFirst = <T extends { at: Date }>(list: T[]) => [...list].sort((a, b) => +a.at - +b.at);

  return [...buckets.entries()]
    .map(([id, b]): ProfileCard => {
      const { listing } = b;
      const state: ReactionState = b.reaction
        ? { reaction: b.reaction.reaction, liked: b.reaction.liked, disliked: b.reaction.disliked }
        : NO_REACTION;
      const likes = oldestFirst(b.likes);
      const dislikes = oldestFirst(b.dislikes);
      const comments = oldestFirst(b.comments);
      const commentSpot = (c: CommentRow) =>
        c.media_key && c.spot
          ? { name: spotName(listing, { mediaKey: c.media_key, tag: c.spot }), fact: c.media_key === FACTS }
          : null;

      const commented = () => {
        const spots = [...new Set(comments.map((c) => commentSpot(c)?.name ?? null))];
        return spots.length <= 2 && spots.every(Boolean) ? `commented on ${spots.join(" and ")}` : "commented on this home";
      };
      let sentence: string;
      if (b.reaction || likes.length || dislikes.length) {
        sentence = sentenceOf(listing, b.reaction, likes, dislikes);
      } else if (comments.length) {
        sentence = commented();
      } else {
        const authors = [...new Set(b.commentLikes.map((like) => like.author))];
        sentence =
          b.commentLikes.length === 1 ? `liked ${authors[0]}'s comment` : `liked what ${names(authors)} said`;
      }

      // Only the good side: a like (or the specifics they liked, even on a
      // home they passed on), and what they liked in it.
      const kept: ReactionRow | null =
        b.reaction && (b.reaction.reaction === "like" || b.reaction.liked.length > 0)
          ? { ...b.reaction, reaction: b.reaction.reaction === "like" ? "like" : null, disliked: [] }
          : null;
      const likeSentence =
        kept || likes.length ? sentenceOf(listing, kept, likes, []) : comments.length ? commented() : "";

      // Everything that day on a photo (not a fact), newest first.
      const onPhotos = [
        ...likes.map((row) => ({ mediaKey: row.media_key, tag: row.tag, at: row.at, kind: "like" as const })),
        ...dislikes.map((row) => ({ mediaKey: row.media_key, tag: row.tag, at: row.at, kind: "dislike" as const })),
        ...comments.flatMap((c) =>
          c.media_key && c.spot ? [{ mediaKey: c.media_key, tag: c.spot, at: c.at, kind: "comment" as const }] : [],
        ),
      ]
        .flatMap((spot) => {
          const index = spot.mediaKey === FACTS ? -1 : listing.Media.findIndex((m) => mediaKeyOf(m) === spot.mediaKey);
          return index >= 0 && !isVideo(listing.Media[index]) ? [{ ...spot, index }] : [];
        })
        .sort((a, b) => +b.at - +a.at);

      const index = onPhotos[0]?.index ?? listing.Media.findIndex((m) => !isVideo(m));
      const media = index >= 0 ? listing.Media[index] : undefined;
      // Pins only land in the right place on a photo of known size.
      const sized = media?.ImageWidth && media?.ImageHeight ? media : null;
      const pinned = new Set<string>();
      const pins = sized
        ? onPhotos
            .filter((spot) => spot.index === index && !pinned.has(spot.tag) && Boolean(pinned.add(spot.tag)))
            .flatMap((spot) => {
              const at = tagPosition(sized, spot.tag);
              return at ? [{ ...at, kind: spot.kind }] : [];
            })
            .slice(0, 4)
        : [];

      // What it's about on each side: the specifics, and the things spots are on.
      const topics = (aspects: Aspect[], list: SpotRow[]) => {
        const about = new Set<string>(aspects);
        for (const row of list) {
          const aspect = aspectOf(listing, row);
          if (aspect) about.add(aspect);
          const thing = thingAt(listing, row.media_key, row.tag);
          if (thing) about.add(thing.toLowerCase());
        }
        return about;
      };
      const loves = topics(state.liked, likes);
      const passes = topics(state.disliked, dislikes);
      const about = new Set([...loves, ...passes]);
      for (const c of comments) {
        const thing = c.media_key && c.spot ? thingAt(listing, c.media_key, c.spot) : null;
        if (thing) about.add(thing.toLowerCase());
      }

      // In step with the counts: a home they like (or haven't liked or passed
      // on overall) counts its likes; a home they passed on, its passes.
      const standing = rows.standing.get(listing.ListingKey) ?? null;

      return {
        id,
        day: b.day,
        at: b.at.toISOString(),
        home: {
          key: listing.ListingKey,
          address: listing.UnparsedAddress,
          city: listing.City,
          price: listing.ListPrice,
          beds: listing.BedroomsTotal,
          baths: listing.BathroomsTotalInteger,
          sqft: listing.LivingArea,
          active: listing.StandardStatus === "Active",
        },
        sentence,
        likeSentence,
        photo: media
          ? {
              url: media.MediaURL,
              index,
              alt: media.ShortDescription ?? `${listing.UnparsedAddress}, photo ${index + 1}`,
              width: media.ImageWidth,
              height: media.ImageHeight,
            }
          : null,
        pins,
        otherPhotos: new Set(onPhotos.map((spot) => spot.index).filter((i) => i !== index)).size,
        facts: [
          ...likes.filter((row) => row.media_key === FACTS).map((row) => ({ kind: "like" as const, row })),
          ...dislikes.filter((row) => row.media_key === FACTS).map((row) => ({ kind: "dislike" as const, row })),
        ]
          .sort((a, b) => +a.row.at - +b.row.at)
          .map(({ kind, row }) => ({ kind, phrase: tagPhrase(row.tag), tag: row.tag })),
        spots: onPhotos.flatMap((spot, i) =>
          onPhotos.findIndex((other) => other.mediaKey === spot.mediaKey && other.tag === spot.tag && other.kind === spot.kind) === i
            ? [{ mediaKey: spot.mediaKey, tag: spot.tag, kind: spot.kind, name: spotName(listing, spot) }]
            : [],
        ),
        comments: comments.map((c) => ({
          id: c.id,
          body: c.body,
          at: c.at.toISOString(),
          spot: commentSpot(c),
          replyTo: c.reply_to_id && c.reply_to_name ? { name: c.reply_to_name, profileId: c.reply_to_id } : null,
          likes: c.likes,
          replies: c.replies,
        })),
        likedComments: oldestFirst(b.commentLikes).map((like) => ({ author: like.author, body: like.body })),
        quiet: !b.reaction && !likes.length && !dislikes.length && !comments.length,
        controls: [
          ...(b.reaction?.reaction ? [{ kind: "reaction" as const, sentiment: b.reaction.reaction }] : []),
          // (What's from a link is taken back there.)
          ...spotControls(listing, "like", likes.filter((row) => !row.link)),
          ...spotControls(listing, "dislike", dislikes.filter((row) => !row.link)),
          ...comments.filter((c) => !c.link).map((c) => ({
            kind: "comment" as const,
            id: c.id,
            body: c.body,
            answered: (c.others_replies ?? c.replies) > 0,
            replies: c.replies,
          })),
        ],
        liked: state.reaction === "like" || (likes.length > 0 && standing !== "dislike"),
        passed: state.reaction === "dislike" || (dislikes.length > 0 && standing === "dislike"),
        commented: comments.length > 0,
        about: [...about],
        loves: [...loves],
        passes: [...passes],
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

// The cards that pass the filters. A topic from a chip matches only its side.
export function filterCards(
  cards: ProfileCard[],
  show: ProfileShow,
  about: string | null,
  side: TopicSide | null = null,
) {
  const topic = about?.toLowerCase();
  return cards.filter(
    (card) =>
      (show === "all" ||
        (show === "liked" && card.liked) ||
        (show === "passed" && card.passed) ||
        (show === "comments" && card.commented)) &&
      (!topic || (side === "like" ? card.loves : side === "pass" ? card.passes : card.about).includes(topic)),
  );
}

// The first `size` cards, and where the next page starts (null when that was
// all of them). Cards from the very same moment stay on one page, so none is skipped.
export function pageOf(cards: ProfileCard[], size = PROFILE_PAGE) {
  let end = Math.min(size, cards.length);
  while (end < cards.length && cards[end].at === cards[end - 1].at) end++;
  const page = cards.slice(0, end);
  return { cards: page, earlier: end < cards.length ? page[end - 1].at : null };
}

export type FeedFilters = { show: ProfileShow; about: string | null; side: TopicSide | null };

// One page from rows read before `before`: whole cards, none twice and none
// skipped. The card for the day `before` falls on, of a home they did more
// with later that day, was on the page before. When a kind of thing ran past
// the read limit, days up to its oldest one may be missing things, so they
// wait for the next page, which reads from there; unless one day alone held
// more than a read's worth, when its newest cards show as they are rather
// than never.
export function feedPage(rows: ProfileRows, filters: FeedFilters, before: string | null, size = PROFILE_PAGE) {
  const day = before && dayOf(before);
  let cards = buildCards(rows).filter((card) => !(card.day === day && rows.later.has(card.home.key)));
  let boundary: string | null = null;
  if (rows.floor) {
    const floor = rows.floor.toISOString();
    const cut = dayOf(rows.floor);
    const whole = cards.filter((card) => card.day > cut);
    cards = whole.length ? whole : cards.filter((card) => card.at >= floor);
    boundary = whole.length ? whole.at(-1)!.at : floor;
  }
  const page = pageOf(filterCards(cards, filters.show, filters.about, filters.side), size);
  return { cards: page.cards, earlier: page.earlier ?? boundary };
}

// What `?before=` may hold: a moment after the site began and before
// tomorrow, in the same form card times are in.
export function parseBefore(value: unknown) {
  if (typeof value !== "string" || value.length > 40) return null;
  const at = +new Date(value);
  if (Number.isNaN(at) || at < Date.UTC(2000, 0, 1) || at > Date.now() + 86_400_000) return null;
  return new Date(at).toISOString();
}

// What `?about=` may hold, before it's checked against what they've done.
export function parseAbout(value: unknown) {
  if (typeof value !== "string") return null;
  const about = value.trim();
  return about && about.length <= 60 ? about : null;
}

// A page of someone's feed, newest first. `passes: false` leaves out what
// they passed on, for someone else's view when they keep that private.
export const getProfileFeed = (
  visitorId: string,
  options: Partial<FeedFilters> & { before?: string | null; mine?: boolean; passes?: boolean } = {},
) =>
  loadFeed(
    visitorId,
    options.show ?? "all",
    options.about ?? null,
    options.side ?? null,
    options.before ?? null,
    options.mine ?? false,
    options.passes ?? true,
  );

// A filter can pass over everything one read holds, so a page reads further
// back until it has something, a few reads at most.
const loadFeed = cache(
  async (
    visitorId: string,
    show: ProfileShow,
    about: string | null,
    side: TopicSide | null,
    before: string | null,
    mine: boolean,
    passes: boolean,
  ) => {
    let from = before;
    for (let read = 0; read < 4; read++) {
      const rows = await loadRows(visitorId, from, mine);
      const page = feedPage(passes ? rows : withoutPasses(rows), { show, about, side }, from);
      if (page.cards.length > 0 || !page.earlier) return page;
      from = page.earlier;
    }
    return { cards: [] as ProfileCard[], earlier: from };
  },
);

// What a person's page says about them overall: counts, how many homes, a
// photo for the band at the top, and the topics `?about=` may name. Without
// `passes`, as someone else sees it when they keep passes private.
export const getProfileSummary = cache(async (visitorId: string, mine: boolean, passes = true) => {
  const account = await agentAccountOf(visitorId);
  const [[counts], rows] = await Promise.all([
    sql<{ liked: number; passed: number; comments: number; homes: number }[]>`
      select
        (select count(*)::int from (
          select listing_key from public_reactions where visitor_id = ${visitorId} and reaction = 'like'
          union
          select listing_key from public_photo_likes pl where visitor_id = ${visitorId}
            and not exists (select 1 from public_reactions r
              where r.visitor_id = ${visitorId} and r.listing_key = pl.listing_key)
          union
          select al.listing_key ${agentMarks(account, "like")}) h) as liked,
        (select count(*)::int from public_reactions
          where visitor_id = ${visitorId} and reaction = 'dislike') as passed,
        (select count(*)::int from public_comments where visitor_id = ${visitorId})
          + (select count(*)::int from (select distinct c.listing_key, c.spot, c.body ${agentNotes(account)}) n) as comments,
        (select count(*)::int from (
          select listing_key from public_reactions where visitor_id = ${visitorId}
            ${passes ? sql`` : sql`and reaction = 'like'`}
          union select listing_key from public_photo_likes pl where visitor_id = ${visitorId}
            ${
              passes
                ? sql``
                : sql`and not exists (select 1 from public_reactions r
                    where r.visitor_id = ${visitorId} and r.listing_key = pl.listing_key and r.reaction = 'dislike')`
            }
          ${passes ? sql`union select listing_key from public_photo_dislikes where visitor_id = ${visitorId}` : sql``}
          union select listing_key from public_comments where visitor_id = ${visitorId}
          union select al.listing_key ${agentMarks(account, "like")}
          ${passes ? sql`union select al.listing_key ${agentMarks(account, "dislike")}` : sql``}
          union select c.listing_key ${agentNotes(account)}) h) as homes`,
    loadRows(visitorId, null, mine),
  ]);
  const seen = passes ? rows : withoutPasses(rows);
  return { counts: passes ? counts : { ...counts, passed: 0 }, cover: coverOf(seen), topics: topicsOf(seen) };
});

// The photo they liked the most spots in (the newest, on a tie).
function coverOf(rows: ProfileRows) {
  const photos = new Map<string, { url: string; n: number }>();
  for (const like of rows.likes) {
    const listing = rows.listings.get(like.listing_key);
    const photo = listing && like.media_key !== FACTS ? photoOf(listing, like.media_key) : undefined;
    if (!photo || isVideo(photo)) continue;
    const key = `${like.listing_key}|${like.media_key}`;
    photos.set(key, { url: photo.MediaURL, n: (photos.get(key)?.n ?? 0) + 1 });
  }
  let best: { url: string; n: number } | null = null;
  for (const photo of photos.values()) if (!best || photo.n > best.n) best = photo;
  return best?.url ?? null;
}

// Every topic `?about=` may name, by its lower-case key, and how it reads:
// the specifics ("exterior": "Exterior") and the things they've liked, not
// liked or talked about ("wraparound porch": "Wraparound porch"). Anything
// else in the address is ignored, so nobody can put words on someone's page.
function topicsOf(rows: ProfileRows) {
  const topics = new Map<string, string>(ASPECTS.map((aspect) => [aspect.id, aspect.label]));
  const add = (listingKey: string, mediaKey: string | null, tag: string | null) => {
    const listing = rows.listings.get(listingKey);
    const thing = listing && mediaKey && tag ? thingAt(listing, mediaKey, tag) : null;
    if (thing && !topics.has(thing.toLowerCase())) topics.set(thing.toLowerCase(), thing);
  };
  for (const row of [...rows.likes, ...rows.dislikes]) add(row.listing_key, row.media_key, row.tag);
  for (const c of rows.comments) add(c.listing_key, c.media_key, c.spot);
  return topics;
}
