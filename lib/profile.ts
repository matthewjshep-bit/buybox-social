import { cache } from "react";
import { sql } from "./db";
import type { Listing, ListingMedia } from "./listings/types";
import { aspectOfFact, aspectOfTag, FACTS, isPointTag, mediaKeyOf, tagNameIn, tagPhrase, tagPosition, thingOf } from "./photos";
import { ASPECT_IDS, aspectLabel, describeReaction, NO_REACTION, type Aspect, type ReactionState } from "./reactions";

// Someone's public page: everything they've liked, passed on and said in
// public, as a feed of one card per home per day. It reads only their own
// public rows (and the names of people they replied to, which are public too):
// what they do on an agent's link never appears here.

// Days start and end here, where the homes are, whoever is looking.
export const PROFILE_TIME_ZONE = "America/Los_Angeles";

// Cards per page, before "Show earlier".
export const PROFILE_PAGE = 20;

// However busy someone is, a page reads at most this many of each kind of thing.
const ROW_LIMIT = 500;

export const PROFILE_FILTERS = { all: "All", liked: "Liked", passed: "Passed", comments: "Comments" } as const;
export type ProfileShow = keyof typeof PROFILE_FILTERS;

export const isProfileShow = (value: unknown): value is ProfileShow =>
  typeof value === "string" && Object.hasOwn(PROFILE_FILTERS, value);

export type PinKind = "like" | "dislike" | "comment";

export type ProfileComment = {
  id: string;
  body: string;
  at: string;
  // What it's about, if it's about a spot or a fact: "the front door".
  spot: string | null;
  // Who it answered, when it's a reply to someone else.
  replyTo: { name: string; profileId: string } | null;
  likes: number;
  replies: number;
};

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
  // The photo of the newest thing they liked or said something about, else
  // the home's first; `index` is its place in the home's photos.
  photo: { url: string; index: number; alt: string; width?: number; height?: number } | null;
  // Where on that photo, newest first: the first one is drawn as their avatar.
  pins: { x: number; y: number; kind: PinKind }[];
  // Other photos of the home they did something on that day.
  otherPhotos: number;
  // The facts they liked or didn't: "the price".
  facts: { kind: "like" | "dislike"; phrase: string }[];
  comments: ProfileComment[];
  // Comments by others they liked. Only ever on their own page.
  likedComments: { author: string; body: string }[];
  liked: boolean;
  passed: boolean;
  commented: boolean;
  // Lower-case things and specifics it's about, for `?about=`.
  about: string[];
};

export type TasteChip = { key: string; label: string; homes: number };

// ---------------------------------------------------------------------------

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

// The heading over a day's cards: "Today", "Yesterday", "Earlier this week",
// then the date ("October 28") for this month and last, then just the month.
export function dayHeading(day: string, now: Date | number = Date.now()) {
  const today = utcDay(dayOf(new Date(now)));
  const date = utcDay(day);
  const days = Math.round((+today - +date) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  const months = (today.getUTCFullYear() - date.getUTCFullYear()) * 12 + today.getUTCMonth() - date.getUTCMonth();
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    ...(months <= 1 ? { day: "numeric" } : { year: "numeric" }),
  });
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

// "the front door"; "a spot in photo 3"; "the price". A copy of `spotName` in
// components/photo-spots.tsx, which is client-only. (C1: import it from lib/photos.ts.)
export function spotName(listing: Listing, spot: { mediaKey: string; tag: string }) {
  if (spot.mediaKey === FACTS) return tagPhrase(spot.tag);
  const index = listing.Media.findIndex((m) => mediaKeyOf(m) === spot.mediaKey);
  const thing = thingOf(listing.Media[index], spot.tag);
  if (thing) return tagPhrase(thing);
  return index >= 0 ? `a spot in photo ${index + 1}` : "a spot in a photo";
}

const isVideo = (photo: ListingMedia) =>
  photo.MediaCategory === "Video" || /\.(mp4|webm|mov)(\?|$)/i.test(photo.MediaURL);

// "Sam", "Sam and Ana", "Sam, Ana and Lee"
const names = (list: string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

// ---------------------------------------------------------------------------

type ReactionRow = ReactionState & { listing_key: string; at: Date };
type SpotRow = { listing_key: string; media_key: string; tag: string; aspect?: Aspect | null; at: Date };
type CommentRow = {
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
};
type CommentLikeRow = { listing_key: string; author: string; body: string; at: Date };

export type ProfileRows = {
  reactions: ReactionRow[];
  likes: SpotRow[];
  dislikes: SpotRow[];
  comments: CommentRow[];
  commentLikes: CommentLikeRow[];
  listings: Map<string, Listing>;
};

// Their public rows, newest first, from before `below` (when given). Comment
// likes they gave only for their own page (`mine`).
const loadRows = cache(async (visitorId: string, below: string | null, mine: boolean): Promise<ProfileRows> => {
  const until = below ? new Date(below) : null;
  const [reactions, likes, dislikes, comments, commentLikes] = await Promise.all([
    sql<ReactionRow[]>`
      select listing_key, reaction, liked, disliked, updated_at as at
      from public_reactions
      where visitor_id = ${visitorId} ${until ? sql`and updated_at < ${until}` : sql``}
      order by updated_at desc
      limit ${ROW_LIMIT}`,
    sql<SpotRow[]>`
      select listing_key, media_key, tag, aspect, created_at as at
      from public_photo_likes
      where visitor_id = ${visitorId} ${until ? sql`and created_at < ${until}` : sql``}
      order by created_at desc
      limit ${ROW_LIMIT}`,
    sql<SpotRow[]>`
      select listing_key, media_key, tag, created_at as at
      from public_photo_dislikes
      where visitor_id = ${visitorId} ${until ? sql`and created_at < ${until}` : sql``}
      order by created_at desc
      limit ${ROW_LIMIT}`,
    // A reply is about whatever the comment it answers is about, and names
    // who wrote that (unless it was them).
    sql<CommentRow[]>`
      select c.id, c.listing_key, c.body, c.created_at as at,
        coalesce(c.media_key, p.media_key) as media_key, coalesce(c.spot, p.spot) as spot,
        pv.id as reply_to_id, pv.first_name as reply_to_name,
        (select count(*)::int from public_comment_likes cl where cl.comment_id = c.id) as likes,
        (select count(*)::int from public_comments r where r.parent_id = c.id) as replies
      from public_comments c
      left join public_comments p on p.id = c.parent_id
      left join visitors pv on pv.id = p.visitor_id and pv.id <> c.visitor_id
      where c.visitor_id = ${visitorId} ${until ? sql`and c.created_at < ${until}` : sql``}
      order by c.created_at desc
      limit ${ROW_LIMIT}`,
    mine
      ? sql<CommentLikeRow[]>`
          select c.listing_key, v.first_name as author, c.body, cl.created_at as at
          from public_comment_likes cl
          join public_comments c on c.id = cl.comment_id
          join visitors v on v.id = c.visitor_id
          where cl.visitor_id = ${visitorId} and c.visitor_id <> ${visitorId}
            ${until ? sql`and cl.created_at < ${until}` : sql``}
          order by cl.created_at desc
          limit ${ROW_LIMIT}`
      : Promise.resolve([] as CommentLikeRow[]),
  ]);

  // Each home once, its photos in order, its status from the column.
  const keys = [
    ...new Set([...reactions, ...likes, ...dislikes, ...comments, ...commentLikes].map((row) => row.listing_key)),
  ];
  const rows = keys.length
    ? await sql<{ listing_key: string; standard_status: string; data: Listing }[]>`
        select listing_key, standard_status, data from listings where listing_key in ${sql(keys)}`
    : [];
  const listings = new Map(
    rows.map((row) => [
      row.listing_key,
      {
        ...row.data,
        StandardStatus: row.standard_status,
        Media: [...row.data.Media].sort((a, b) => a.Order - b.Order),
      },
    ]),
  );
  return { reactions, likes, dislikes, comments, commentLikes, listings };
});

// The person behind a profile: only their first name and when they joined.
export const getProfilePerson = cache(async (visitorId: string) => {
  const [visitor] = await sql<{ id: string; first_name: string; created_at: Date }[]>`
    select id, first_name, created_at from visitors where id::text = ${visitorId}`;
  return visitor ? { id: visitor.id, name: visitor.first_name, since: visitor.created_at.toISOString() } : null;
});

export type ProfilePerson = NonNullable<Awaited<ReturnType<typeof getProfilePerson>>>;

// ---------------------------------------------------------------------------

const photoOf = (listing: Listing, mediaKey: string) => listing.Media.find((m) => mediaKeyOf(m) === mediaKey);

// The specific a liked or disliked spot or fact counts toward.
const aspectOf = (listing: Listing, row: SpotRow): Aspect | null => {
  if (row.aspect !== undefined) return row.aspect;
  if (row.media_key === FACTS) return aspectOfFact(row.tag);
  const photo = photoOf(listing, row.media_key);
  return photo ? aspectOfTag(photo, thingOf(photo, row.tag) ?? row.tag) : null;
};

// The known thing a spot is on ("Front door"), if any. Facts aren't things.
const thingAt = (listing: Listing, mediaKey: string, tag: string) =>
  mediaKey === FACTS ? null : thingOf(photoOf(listing, mediaKey), tag);

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
        c.media_key && c.spot ? spotName(listing, { mediaKey: c.media_key, tag: c.spot }) : null;
      const named = (row: SpotRow) => tagNameIn(listing, row.media_key, row.tag);

      let sentence: string;
      if (b.reaction || likes.length || dislikes.length) {
        sentence = describeReaction(state, likes.map(named), dislikes.map(named));
      } else if (comments.length) {
        const spots = [...new Set(comments.map(commentSpot))];
        sentence =
          spots.length <= 2 && spots.every(Boolean) ? `commented on ${spots.join(" and ")}` : "commented on this home";
      } else {
        const authors = [...new Set(b.commentLikes.map((like) => like.author))];
        sentence =
          b.commentLikes.length === 1 ? `liked ${authors[0]}'s comment` : `liked what ${names(authors)} said`;
      }

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

      const about = new Set<string>([...state.liked, ...state.disliked]);
      for (const row of [...likes, ...dislikes]) {
        const aspect = aspectOf(listing, row);
        if (aspect) about.add(aspect);
        const thing = thingAt(listing, row.media_key, row.tag);
        if (thing) about.add(thing.toLowerCase());
      }
      for (const c of comments) {
        const thing = c.media_key && c.spot ? thingAt(listing, c.media_key, c.spot) : null;
        if (thing) about.add(thing.toLowerCase());
      }

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
          .map(({ kind, row }) => ({ kind, phrase: tagPhrase(row.tag) })),
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
        liked: state.reaction === "like" || likes.length > 0,
        passed: state.reaction === "dislike" || dislikes.length > 0,
        commented: comments.length > 0,
        about: [...about],
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

// The cards that pass the filters.
export function filterCards(cards: ProfileCard[], show: ProfileShow, about: string | null) {
  const topic = about?.toLowerCase();
  return cards.filter(
    (card) =>
      (show === "all" ||
        (show === "liked" && card.liked) ||
        (show === "passed" && card.passed) ||
        (show === "comments" && card.commented)) &&
      (!topic || card.about.includes(topic)),
  );
}

// One page of cards from before `before`, and where the next page starts
// (null when there's nothing earlier). Cards from the very same moment stay on
// one page, so none is skipped.
export function pageOf(cards: ProfileCard[], before: string | null, size = PROFILE_PAGE) {
  const rest = before ? cards.filter((card) => card.at < before) : cards;
  let end = Math.min(size, rest.length);
  while (end < rest.length && rest[end].at === rest[end - 1].at) end++;
  const page = rest.slice(0, end);
  return { cards: page, earlier: end < rest.length ? page[end - 1].at : null };
}

// What `?before=` may hold: a moment, in the same form card times are in.
export function parseBefore(value: unknown) {
  if (typeof value !== "string" || value.length > 40) return null;
  const at = new Date(value);
  return Number.isNaN(+at) ? null : at.toISOString();
}

// What `?about=` may hold: a specific ("kitchen") or a thing ("Front door").
export function parseAbout(value: unknown) {
  if (typeof value !== "string") return null;
  const about = value.trim();
  return about && about.length <= 60 ? about : null;
}

export const aboutLabel = (about: string) =>
  (ASPECT_IDS as string[]).includes(about) ? aspectLabel(about as Aspect) : about;

// What a page starting at `before` reads: everything up to the end of that
// day (no day is longer than 25 hours), so a card from that day comes out
// whole, with what happened earlier that day too.
export const feedBound = (before: string | null) =>
  before ? new Date(+new Date(before) + 25 * 3_600_000).toISOString() : null;

// A page of someone's feed, newest first.
export const getProfileFeed = (
  visitorId: string,
  options: { show?: ProfileShow; about?: string | null; before?: string | null; mine?: boolean } = {},
) => loadFeed(visitorId, options.show ?? "all", options.about ?? null, options.before ?? null, options.mine ?? false);

const loadFeed = cache(
  async (visitorId: string, show: ProfileShow, about: string | null, before: string | null, mine: boolean) => {
    const cards = filterCards(buildCards(await loadRows(visitorId, feedBound(before), mine)), show, about);
    return pageOf(cards, before);
  },
);

// ---------------------------------------------------------------------------

// What a person's page says about them overall: counts, how many homes, a
// photo for the band at the top, and what they keep liking and passing on.
export const getProfileSummary = cache(async (visitorId: string, mine: boolean) => {
  const [[counts], rows] = await Promise.all([
    sql<{ liked: number; passed: number; comments: number; homes: number }[]>`
      select
        (select count(*)::int from (
          select listing_key from public_reactions where visitor_id = ${visitorId} and reaction = 'like'
          union
          select listing_key from public_photo_likes pl where visitor_id = ${visitorId}
            and not exists (select 1 from public_reactions r
              where r.visitor_id = ${visitorId} and r.listing_key = pl.listing_key)) h) as liked,
        (select count(*)::int from public_reactions
          where visitor_id = ${visitorId} and reaction = 'dislike') as passed,
        (select count(*)::int from public_comments where visitor_id = ${visitorId}) as comments,
        (select count(*)::int from (
          select listing_key from public_reactions where visitor_id = ${visitorId}
          union select listing_key from public_photo_likes where visitor_id = ${visitorId}
          union select listing_key from public_photo_dislikes where visitor_id = ${visitorId}
          union select listing_key from public_comments where visitor_id = ${visitorId}) h) as homes`,
    loadRows(visitorId, null, mine),
  ]);
  return { counts, cover: coverOf(rows), taste: tasteOf(rows) };
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

// What they keep liking and passing on, by the number of homes. A thing or
// specific goes on whichever side has more homes, never both. Facts are never
// things, and price and location are left out of what they love. (P2 replaces
// this with the taste story.)
function tasteOf(rows: ProfileRows) {
  // By name, so the specific "Natural light" and the thing "Natural light" are one.
  const tally = new Map<string, { key: string; label: string; liked: Set<string>; passed: Set<string> }>();
  const count = (label: string, side: "liked" | "passed", home: string, aspect?: Aspect) => {
    const entry = tally.get(label.toLowerCase()) ?? { key: label, label, liked: new Set(), passed: new Set() };
    if (aspect) entry.key = aspect;
    entry[side].add(home);
    tally.set(label.toLowerCase(), entry);
  };
  for (const r of rows.reactions) {
    for (const id of r.liked) count(aspectLabel(id), "liked", r.listing_key, id);
    for (const id of r.disliked) count(aspectLabel(id), "passed", r.listing_key, id);
  }
  for (const [list, side] of [
    [rows.likes, "liked"],
    [rows.dislikes, "passed"],
  ] as const) {
    for (const row of list) {
      const listing = rows.listings.get(row.listing_key);
      if (!listing) continue;
      const aspect = aspectOf(listing, row);
      if (aspect) count(aspectLabel(aspect), side, row.listing_key, aspect);
      const thing = thingAt(listing, row.media_key, row.tag);
      if (thing && !isPointTag(thing)) count(thing, side, row.listing_key);
    }
  }
  const all = [...tally.values()].map((e) => ({ ...e, liked: e.liked.size, passed: e.passed.size }));
  const top = (side: "liked" | "passed", skip: string[]) => {
    const other = side === "liked" ? "passed" : "liked";
    return all
      .filter((e) => e[side] > e[other] && !skip.includes(e.key))
      .sort((a, b) => b[side] - a[side] || a.label.localeCompare(b.label))
      .slice(0, 3)
      .map((e): TasteChip => ({ key: e.key, label: e.label, homes: e[side] }));
  };
  return { loves: top("liked", ["price", "location"]), passes: top("passed", []) };
}
