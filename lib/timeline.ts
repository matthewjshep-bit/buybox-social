import { sql } from "./db";
import type { Listing } from "./listings/types";
import { likeId, mediaKeyOf, type PhotoLikes } from "./photos";
import { NO_REACTION, publicSideOf, type ReactionState } from "./reactions";

// Everything said and done about a home, as one list of who did what, oldest
// first: comments, and one line per person for their reaction and whatever
// they liked in the photos.

export type TimelineComment = {
  kind: "comment";
  id: string;
  name: string;
  isAgent: boolean;
  body: string;
  at: string;
  mine: boolean;
  parentId: string | null;
  likes: number;
  likedByMe: boolean;
  // On an agent's link: its author shared it on the public page.
  sharedPublicly?: boolean;
  // On a public page: shared by a buyer from a private chat with their agent.
  fromPrivateChat?: boolean;
  // Their public profile, on public pages.
  profileId?: string;
};

export type TimelineReaction = {
  kind: "reaction";
  id: string;
  name: string;
  at: string;
  mine: boolean;
  state: ReactionState;
  // Things liked in the photos, in the order they were liked.
  photos: { tag: string; mediaUrl: string | null }[];
  // On a public page: from someone's private chat with their agent, so no name.
  fromPrivateChat?: boolean;
  // Their public profile, on public pages.
  profileId?: string;
};

export type TimelineItem = TimelineComment | TimelineReaction;

// What private activity is shown as on public pages.
export const ANONYMOUS_BUYER = "A buyer";

type ReactionRow = ReactionState & { listing_key: string; who: string; name: string | null; at: Date };
type PhotoRow = { listing_key: string; who: string; name: string | null; media_key: string; tag: string; at: Date };

// One line per person: their overall reaction plus their photo likes.
function reactionItems(
  listing: Listing,
  reactions: ReactionRow[],
  photos: PhotoRow[],
  options: { me: string | null; anonymous: (who: string) => boolean; profiles?: boolean },
): TimelineReaction[] {
  const url = (mediaKey: string) => listing.Media.find((m) => mediaKeyOf(m) === mediaKey)?.MediaURL ?? null;
  const people = new Map<string, TimelineReaction>();
  const person = (who: string, name: string | null, at: Date) => {
    const anonymous = options.anonymous(who);
    const item = people.get(who) ?? {
      kind: "reaction" as const,
      id: who,
      name: anonymous ? ANONYMOUS_BUYER : (name ?? ANONYMOUS_BUYER),
      at: at.toISOString(),
      mine: who === options.me,
      state: NO_REACTION,
      photos: [],
      ...(anonymous && { fromPrivateChat: true }),
      ...(options.profiles && who.startsWith("v:") && { profileId: who.slice(2) }),
    };
    if (at.toISOString() > item.at) item.at = at.toISOString();
    people.set(who, item);
    return item;
  };
  for (const r of reactions.filter((r) => r.listing_key === listing.ListingKey)) {
    person(r.who, r.name, r.at).state = { reaction: r.reaction, liked: r.liked, disliked: r.disliked };
  }
  for (const p of photos.filter((p) => p.listing_key === listing.ListingKey).sort((a, b) => +a.at - +b.at)) {
    person(p.who, p.name, p.at).photos.push({ tag: p.tag, mediaUrl: url(p.media_key) });
  }
  // Keyed by position, so no one's internal id reaches the page.
  return [...people.values()].map((item, index) => ({ ...item, id: `reaction-${index}` }));
}

const byTime = (a: TimelineItem, b: TimelineItem) => a.at.localeCompare(b.at);

// Public pages. Private activity shows without names, and only its likes: a
// private pass never reaches strangers. Private comments show only when their
// author chose to share them.
export async function getPublicTimelines(listings: Listing[], visitorId: string | null) {
  const timelines = new Map<string, TimelineItem[]>();
  if (listings.length === 0) return timelines;
  const keys = listings.map((l) => l.ListingKey);
  const me = visitorId ? `v:${visitorId}` : null;

  const [comments, shared, publicReactions, privateReactions, publicPhotos, privatePhotos] = await Promise.all([
    sql<
      {
        id: string;
        listing_key: string;
        visitor_id: string;
        first_name: string;
        body: string;
        created_at: Date;
        parent_id: string | null;
        likes: number;
        liked_by_me: boolean;
      }[]
    >`
      select c.id, c.listing_key, c.visitor_id, v.first_name, c.body, c.created_at, c.parent_id,
        (select count(*)::int from public_comment_likes cl where cl.comment_id = c.id) as likes,
        exists (select 1 from public_comment_likes cl
          where cl.comment_id = c.id and cl.visitor_id = ${visitorId}::uuid) as liked_by_me
      from public_comments c join visitors v on v.id = c.visitor_id
      where c.listing_key in ${sql(keys)}`,
    sql<{ id: string; listing_key: string; body: string; created_at: Date }[]>`
      select id, listing_key, body, created_at from comments
      where shared_publicly and listing_key in ${sql(keys)}`,
    sql<ReactionRow[]>`
      select r.listing_key, 'v:' || r.visitor_id as who, v.first_name as name,
        r.reaction, r.liked, r.disliked, r.updated_at as at
      from public_reactions r join visitors v on v.id = r.visitor_id
      where r.listing_key in ${sql(keys)}`,
    sql<ReactionRow[]>`
      select listing_key, 'p:' || participant_id as who, null as name,
        reaction, liked, disliked, updated_at as at
      from reactions
      where listing_key in ${sql(keys)} and (reaction = 'like' or cardinality(liked) > 0)`,
    sql<PhotoRow[]>`
      select pl.listing_key, 'v:' || pl.visitor_id as who, v.first_name as name,
        pl.media_key, pl.tag, pl.created_at as at
      from public_photo_likes pl join visitors v on v.id = pl.visitor_id
      where pl.listing_key in ${sql(keys)}`,
    sql<PhotoRow[]>`
      select listing_key, 'p:' || participant_id as who, null as name, media_key, tag, created_at as at
      from photo_likes where listing_key in ${sql(keys)}`,
  ]);

  // Private reactions only ever show their likes.
  const privateLikes = privateReactions.map((r) => ({ ...r, ...publicSideOf(r)! }));

  for (const listing of listings) {
    const key = listing.ListingKey;
    const items: TimelineItem[] = [
      ...comments
        .filter((c) => c.listing_key === key)
        .map(
          (c): TimelineComment => ({
            kind: "comment",
            id: c.id,
            name: c.first_name,
            isAgent: false,
            body: c.body,
            at: c.created_at.toISOString(),
            mine: c.visitor_id === visitorId,
            parentId: c.parent_id,
            likes: c.likes,
            likedByMe: c.liked_by_me,
            profileId: c.visitor_id,
          }),
        ),
      ...shared
        .filter((c) => c.listing_key === key)
        .map(
          (c): TimelineComment => ({
            kind: "comment",
            id: c.id,
            name: ANONYMOUS_BUYER,
            isAgent: false,
            body: c.body,
            at: c.created_at.toISOString(),
            mine: false,
            parentId: null,
            likes: 0,
            likedByMe: false,
            fromPrivateChat: true,
          }),
        ),
      ...reactionItems(listing, [...publicReactions, ...privateLikes], [...publicPhotos, ...privatePhotos], {
        me,
        anonymous: (who) => who.startsWith("p:"),
        profiles: true,
      }),
    ];
    timelines.set(key, items.sort(byTime));
  }
  return timelines;
}

// An agent's link: everyone on it by name, the agent included, and nothing
// from outside it.
export async function getShareTimelines(shareId: string, listings: Listing[], participantId: string | null) {
  const timelines = new Map<string, TimelineItem[]>();
  if (listings.length === 0) return timelines;
  const me = participantId ? `p:${participantId}` : null;

  const [comments, reactions, photos] = await Promise.all([
    sql<
      {
        id: string;
        listing_key: string;
        participant_id: string | null;
        first_name: string | null;
        agent_name: string | null;
        body: string;
        created_at: Date;
        shared_publicly: boolean;
      }[]
    >`
      select c.id, c.listing_key, c.participant_id, p.first_name, a.full_name as agent_name,
        c.body, c.created_at, c.shared_publicly
      from comments c
      left join participants p on p.id = c.participant_id
      left join accounts a on a.id = c.agent_id
      where c.share_id = ${shareId}`,
    sql<ReactionRow[]>`
      select r.listing_key, 'p:' || r.participant_id as who, p.first_name as name,
        r.reaction, r.liked, r.disliked, r.updated_at as at
      from reactions r join participants p on p.id = r.participant_id
      where r.share_id = ${shareId}`,
    sql<PhotoRow[]>`
      select pl.listing_key, 'p:' || pl.participant_id as who, p.first_name as name,
        pl.media_key, pl.tag, pl.created_at as at
      from photo_likes pl join participants p on p.id = pl.participant_id
      where pl.share_id = ${shareId}`,
  ]);

  for (const listing of listings) {
    const key = listing.ListingKey;
    const items: TimelineItem[] = [
      ...comments
        .filter((c) => c.listing_key === key)
        .map(
          (c): TimelineComment => ({
            kind: "comment",
            id: c.id,
            name: c.first_name ?? c.agent_name ?? "Agent",
            isAgent: c.participant_id === null,
            body: c.body,
            at: c.created_at.toISOString(),
            mine: c.participant_id !== null && c.participant_id === participantId,
            parentId: null,
            likes: 0,
            likedByMe: false,
            sharedPublicly: c.shared_publicly,
          }),
        ),
      ...reactionItems(listing, reactions, photos, { me, anonymous: () => false }),
    ];
    timelines.set(key, items.sort(byTime));
  }
  return timelines;
}

// Photo like counts and your own, for public pages: everyone's, with private
// likes counted but never named.
export async function getPublicPhotoLikes(keys: string[], visitorId: string | null) {
  const result = new Map<string, PhotoLikes>();
  if (keys.length === 0) return result;
  const rows = await sql<{ listing_key: string; media_key: string; tag: string; n: number; mine: boolean }[]>`
    select listing_key, media_key, tag, count(*)::int as n, bool_or(mine) as mine from (
      select listing_key, media_key, tag, visitor_id = ${visitorId}::uuid as mine
      from public_photo_likes where listing_key in ${sql(keys)}
      union all
      select listing_key, media_key, tag, false from photo_likes where listing_key in ${sql(keys)}) x
    group by listing_key, media_key, tag`;
  return collect(keys, rows);
}

// On an agent's link: only the likes of people on that link.
export async function getSharePhotoLikes(shareId: string, keys: string[], participantId: string | null) {
  if (keys.length === 0) return new Map<string, PhotoLikes>();
  const rows = await sql<{ listing_key: string; media_key: string; tag: string; n: number; mine: boolean }[]>`
    select listing_key, media_key, tag, count(*)::int as n,
      bool_or(participant_id = ${participantId}::uuid) as mine
    from photo_likes where share_id = ${shareId}
    group by listing_key, media_key, tag`;
  return collect(keys, rows);
}

function collect(keys: string[], rows: { listing_key: string; media_key: string; tag: string; n: number; mine: boolean }[]) {
  const result = new Map<string, PhotoLikes>(keys.map((key) => [key, { counts: {}, mine: [] }]));
  for (const row of rows) {
    const likes = result.get(row.listing_key) ?? { counts: {}, mine: [] };
    const id = likeId(row.media_key, row.tag);
    likes.counts[id] = row.n;
    if (row.mine) likes.mine.push(id);
    result.set(row.listing_key, likes);
  }
  return result;
}
