import { createHash } from "node:crypto";
import { sql } from "./db";
import { agentFirstName } from "./format";
import type { Listing } from "./listings/types";
import { likeId, mediaKeyOf, tagNameIn, type PhotoLikes } from "./photos";
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
  // The spot in a photo it's about ("the front door"), if it's about one.
  spot?: { mediaKey: string; tag: string };
  // On an agent's link: who said it, as a key that stays the same and gives
  // nothing away, so two people of the same first name stay two people.
  personKey?: string;
  // On an agent's link: the agent hearted it. Their first name, for "Liked by
  // Jordan". Never on public pages.
  likedBy?: string;
};

export type TimelineReaction = {
  kind: "reaction";
  id: string;
  name: string;
  at: string;
  mine: boolean;
  state: ReactionState;
  // When they last changed their reaction to the home itself, if they have one.
  reactedAt?: string;
  // Things liked in the photos (and the facts: "Price"), in the order they
  // were liked; and those they didn't like.
  photos: PhotoThing[];
  photoDislikes: PhotoThing[];
  // On a public page: from someone's private chat with their agent, so no name.
  fromPrivateChat?: boolean;
  // Their public profile, on public pages.
  profileId?: string;
  // On an agent's link: who, as a key that stays the same and gives nothing away.
  personKey?: string;
  // What a reply to them answers, for the comment box ("like:" and who they
  // are, as the page may know them): none for someone shown without a name.
  replyRef?: string;
  // On an agent's link: the agent's own likes, from their first pass. Never
  // one of the clients, so never counted among them.
  isAgent?: boolean;
};

// One thing liked (or not) in a photo or the facts: what it reads as ("Front
// door"), and exactly where and when: the photo, the tag as it was left
// ("@62.3,68.1" or "Front door") and the time.
export type PhotoThing = { tag: string; mediaUrl: string | null; mediaKey?: string; spot?: string; at?: string };

export type TimelineItem = TimelineComment | TimelineReaction;

// What private activity is shown as on public pages.
export const ANONYMOUS_BUYER = "A buyer";

type ReactionRow = ReactionState & { listing_key: string; who: string; name: string | null; at: Date };
type PhotoRow = { listing_key: string; who: string; name: string | null; media_key: string; tag: string; at: Date };

// One line per person: their overall reaction plus their photo likes and dislikes.
function reactionItems(
  listing: Listing,
  reactions: ReactionRow[],
  photos: PhotoRow[],
  dislikes: PhotoRow[],
  options: {
    me: string | null;
    anonymous: (who: string) => boolean;
    profiles?: boolean;
    personKey?: (who: string) => string;
    // What a reply to someone answers (null: they can't be answered).
    replyRef?: (who: string) => string | null;
    // Filled in with each person's line, by who they are.
    ids?: Map<string, string>;
  },
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
      photoDislikes: [],
      ...(anonymous && { fromPrivateChat: true }),
      ...(options.profiles && who.startsWith("v:") && { profileId: who.slice(2) }),
      ...(options.personKey && { personKey: options.personKey(who) }),
      ...(!anonymous && options.replyRef?.(who) && { replyRef: options.replyRef(who)! }),
      ...(who === AGENT && { isAgent: true }),
    };
    if (at.toISOString() > item.at) item.at = at.toISOString();
    people.set(who, item);
    return item;
  };
  for (const r of reactions.filter((r) => r.listing_key === listing.ListingKey)) {
    const item = person(r.who, r.name, r.at);
    item.state = { reaction: r.reaction, liked: r.liked, disliked: r.disliked };
    item.reactedAt = r.at.toISOString();
  }
  const mine = (rows: PhotoRow[]) =>
    rows.filter((p) => p.listing_key === listing.ListingKey).sort((a, b) => +a.at - +b.at);
  // A spot reads as the thing it's on ("the front door").
  const named = (p: PhotoRow): PhotoThing => ({
    tag: tagNameIn(listing, p.media_key, p.tag),
    mediaUrl: url(p.media_key),
    mediaKey: p.media_key,
    spot: p.tag,
    at: p.at.toISOString(),
  });
  for (const p of mine(photos)) person(p.who, p.name, p.at).photos.push(named(p));
  for (const p of mine(dislikes)) person(p.who, p.name, p.at).photoDislikes.push(named(p));
  // Keyed by position, so no one's internal id reaches the page.
  return [...people.entries()].map(([who, item], index) => {
    const id = `reaction-${index}`;
    options.ids?.set(who, id);
    return { ...item, id };
  });
}

const byTime = (a: TimelineItem, b: TimelineItem) => a.at.localeCompare(b.at);

// Who the agent is among the people on their link.
const AGENT = "agent";

// Who someone is on a link, without their id: the same on every load, and
// different on every link. `who` is "p:" and their participant id.
export const sharePersonKey = (shareId: string, who: string) =>
  createHash("md5").update(`${shareId}:${who}`).digest("hex").slice(0, 16);

const spotOf = (c: { media_key: string | null; spot: string | null }) =>
  c.media_key && c.spot ? { spot: { mediaKey: c.media_key, tag: c.spot } } : {};

// Public pages. Private activity shows without names, and only its likes: a
// private pass never reaches strangers. Private comments show only when their
// author chose to share them.
export async function getPublicTimelines(listings: Listing[], visitorId: string | null) {
  const timelines = new Map<string, TimelineItem[]>();
  if (listings.length === 0) return timelines;
  const keys = listings.map((l) => l.ListingKey);
  const me = visitorId ? `v:${visitorId}` : null;

  const [comments, shared, publicReactions, privateReactions, publicPhotos, privatePhotos, publicDislikes] = await Promise.all([
    sql<
      {
        id: string;
        listing_key: string;
        visitor_id: string;
        first_name: string;
        body: string;
        created_at: Date;
        parent_id: string | null;
        reply_to_visitor: string | null;
        likes: number;
        liked_by_me: boolean;
        media_key: string | null;
        spot: string | null;
      }[]
    >`
      select c.id, c.listing_key, c.visitor_id, v.first_name, c.body, c.created_at, c.parent_id,
        c.reply_to_visitor, c.media_key, c.spot,
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
    // Dislikes on agents' links stay there, like a private pass.
    sql<PhotoRow[]>`
      select pd.listing_key, 'v:' || pd.visitor_id as who, v.first_name as name,
        pd.media_key, pd.tag, pd.created_at as at
      from public_photo_dislikes pd join visitors v on v.id = pd.visitor_id
      where pd.listing_key in ${sql(keys)}`,
  ]);

  // Private reactions only ever show their likes.
  const privateLikes = privateReactions.map((r) => ({ ...r, ...publicSideOf(r)! }));

  for (const listing of listings) {
    const key = listing.ListingKey;
    // Each person's line first, so a reply to their likes can go under it.
    const ids = new Map<string, string>();
    const reactions = reactionItems(listing, [...publicReactions, ...privateLikes], [...publicPhotos, ...privatePhotos], publicDislikes, {
      me,
      anonymous: (who) => who.startsWith("p:"),
      profiles: true,
      replyRef: (who) => (who.startsWith("v:") ? `like:${who.slice(2)}` : null),
      ids,
    });
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
            // (A reply to someone whose likes have since gone stands on its own.)
            parentId: c.parent_id ?? (c.reply_to_visitor ? (ids.get(`v:${c.reply_to_visitor}`) ?? null) : null),
            likes: c.likes,
            likedByMe: c.liked_by_me,
            profileId: c.visitor_id,
            ...spotOf(c),
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
            // Never where in the photo: a private comment's spot stays on its link.
          }),
        ),
      ...reactions,
    ];
    timelines.set(key, items.sort(byTime));
  }
  return timelines;
}

// An agent's link: everyone on it by name, the agent included, and nothing
// from outside it.
export async function getShareTimelines(shareId: string, listings: Listing[], participantId: string | null) {
  // (The agent's own likes, from their first pass, are a line of their own.)
  const timelines = new Map<string, TimelineItem[]>();
  if (listings.length === 0) return timelines;
  const me = participantId ? `p:${participantId}` : null;
  // Who someone is on this link, without their id: the same on every load.
  const personKey = (who: string) => sharePersonKey(shareId, who);

  const [comments, reactions, photos, dislikes, agentLikes] = await Promise.all([
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
        media_key: string | null;
        spot: string | null;
        liked_by: string | null;
        parent_id: string | null;
        reply_to_participant: string | null;
      }[]
    >`
      select c.id, c.listing_key, c.participant_id, p.first_name, a.full_name as agent_name,
        c.body, c.created_at, c.shared_publicly, c.media_key, c.spot, c.parent_id, c.reply_to_participant,
        -- The link's agent, when they've hearted it.
        (select coalesce(la.full_name, '') from share_comment_likes l
          join shares s on s.id = c.share_id
          left join accounts la on la.id = s.agent_id
          where l.comment_id = c.id) as liked_by
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
    sql<PhotoRow[]>`
      select pd.listing_key, 'p:' || pd.participant_id as who, p.first_name as name,
        pd.media_key, pd.tag, pd.created_at as at
      from photo_dislikes pd join participants p on p.id = pd.participant_id
      where pd.share_id = ${shareId}`,
    sql<PhotoRow[]>`
      select al.listing_key, ${AGENT}::text as who, a.full_name as name, al.media_key, al.tag, al.created_at as at
      from share_agent_likes al join shares s on s.id = al.share_id join accounts a on a.id = s.agent_id
      where al.share_id = ${shareId}`,
  ]);

  for (const listing of listings) {
    const key = listing.ListingKey;
    const ids = new Map<string, string>();
    const people = reactionItems(listing, reactions, [...photos, ...agentLikes], dislikes, {
      me,
      anonymous: () => false,
      personKey,
      // (The agent's likes are answered in a comment of one's own.)
      replyRef: (who) => (who === AGENT ? null : `like:${personKey(who)}`),
      ids,
    });
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
            parentId: c.parent_id ?? (c.reply_to_participant ? (ids.get(`p:${c.reply_to_participant}`) ?? null) : null),
            likes: 0,
            likedByMe: false,
            sharedPublicly: c.shared_publicly,
            personKey: personKey(c.participant_id ? `p:${c.participant_id}` : AGENT),
            ...(c.liked_by !== null && { likedBy: agentFirstName(c.liked_by) }),
            ...spotOf(c),
          }),
        ),
      ...people,
    ];
    timelines.set(key, items.sort(byTime));
  }
  return timelines;
}

type CountRow = { listing_key: string; media_key: string; tag: string; n: number; mine: boolean; disliked: boolean };

// Photo like and dislike counts and your own, for public pages: everyone's
// likes, with private ones counted but never named; dislikes only from public
// pages, since one on an agent's link is private.
export async function getPublicPhotoLikes(keys: string[], visitorId: string | null) {
  if (keys.length === 0) return new Map<string, PhotoLikes>();
  const rows = await sql<CountRow[]>`
    select listing_key, media_key, tag, disliked, count(*)::int as n, bool_or(mine) as mine from (
      select listing_key, media_key, tag, false as disliked, visitor_id = ${visitorId}::uuid as mine
      from public_photo_likes where listing_key in ${sql(keys)}
      union all
      select listing_key, media_key, tag, false, false from photo_likes where listing_key in ${sql(keys)}
      union all
      select listing_key, media_key, tag, true, visitor_id = ${visitorId}::uuid
      from public_photo_dislikes where listing_key in ${sql(keys)}) x
    group by listing_key, media_key, tag, disliked`;
  return collect(keys, rows);
}

// On an agent's link: only the likes and dislikes of people on that link. The
// agent's own likes count only for the agent (`agent`), as theirs.
export async function getSharePhotoLikes(
  shareId: string,
  keys: string[],
  participantId: string | null,
  { agent = false } = {},
) {
  if (keys.length === 0) return new Map<string, PhotoLikes>();
  const rows = await sql<CountRow[]>`
    select listing_key, media_key, tag, disliked, count(*)::int as n,
      bool_or(mine) as mine from (
      select listing_key, media_key, tag, false as disliked, participant_id = ${participantId}::uuid as mine
      from photo_likes where share_id = ${shareId}
      union all
      select listing_key, media_key, tag, true, participant_id = ${participantId}::uuid
      from photo_dislikes where share_id = ${shareId}
      union all
      select listing_key, media_key, tag, false, true
      from share_agent_likes where share_id = ${shareId} and ${agent}) x
    group by listing_key, media_key, tag, disliked`;
  return collect(keys, rows);
}

function collect(keys: string[], rows: CountRow[]) {
  const empty = (): PhotoLikes => ({ counts: {}, mine: [], dislikes: {}, mineDisliked: [] });
  const result = new Map<string, PhotoLikes>(keys.map((key) => [key, empty()]));
  for (const row of rows) {
    const likes = result.get(row.listing_key) ?? empty();
    const id = likeId(row.media_key, row.tag);
    (row.disliked ? likes.dislikes : likes.counts)[id] = row.n;
    if (row.mine) (row.disliked ? likes.mineDisliked : likes.mine).push(id);
    result.set(row.listing_key, likes);
  }
  return result;
}
