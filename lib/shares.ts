import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { mediaKeyOf, tagNameIn } from "./photos";
import { describeReaction, type Aspect, type ReactionState } from "./reactions";

export type CommentTag = "like" | "dislike";

// What a link shows of its agent. The contact fields are only what the agent
// chose to show clients, never their login email or sign-up phone.
export type ShareAgent = {
  full_name: string;
  brokerage: string;
  photo_data_url: string | null;
  brand_color: string;
  // Digits only, or empty.
  contact_phone: string;
  // Empty unless the agent set one.
  contact_email: string;
};

export type Share = {
  id: string;
  token: string;
  agent_id: string;
  client_name: string;
  note: string;
};

export type ThreadReaction = {
  listingKey: string;
  participantId: string;
  name: string;
  state: ReactionState;
};

export type ThreadComment = {
  id: string;
  listingKey: string;
  participantId: string | null;
  name: string;
  isAgent: boolean;
  tag: CommentTag | null;
  body: string;
  createdAt: string;
  sharedPublicly: boolean;
  // The spot in a photo it's about ("@62.3,68.1" or "Covered porch"), or one of
  // the facts (media key "facts", tag "Price").
  spot?: { mediaKey: string; tag: string } | null;
};

export const newShareToken = () => randomBytes(24).toString("base64url");

export const isShareToken = (token: string) => /^[\w-]{32}$/.test(token);

// Everything clients have done on links, one row each: a reaction (when last
// changed), a comment, a like or dislike in a photo or on a fact. The agent's
// own replies aren't in it. Columns: share_id, listing_key, participant_id, at.
export const clientActivity = () => sql`
  select share_id, listing_key, participant_id, updated_at as at from reactions
  union all
  select share_id, listing_key, participant_id, created_at from comments where participant_id is not null
  union all
  select share_id, listing_key, participant_id, created_at from photo_likes
  union all
  select share_id, listing_key, participant_id, created_at from photo_dislikes`;

// A device, as one link knows it when counting opens: hashed with the link, so
// the stored value can't be matched to the device's own token or across links.
export const deviceHashFor = (device: string, shareId: string) =>
  createHash("sha256").update(device + shareId).digest("base64url");

export type ShareOpen = {
  // The person's first name on the link, once they've given it.
  name: string | null;
  // Null stands for everyone who hasn't given a name yet, together.
  participantId: string | null;
  lastAt: string;
};

// Who has had a link open, and when they last did, newest first: for the agent
// only. Anything someone did on it counts too, so a link sent before opens
// were counted still shows who has been on it.
export async function getShareOpens(shareId: string) {
  const rows = await sql<{ participant_id: string | null; first_name: string | null; last_at: Date }[]>`
    select x.participant_id, p.first_name, max(x.at) as last_at
    from (
      select participant_id, last_at as at from share_opens where share_id = ${shareId}
      union all
      select participant_id, at from (${clientActivity()}) a where a.share_id = ${shareId}
    ) x
    left join participants p on p.id = x.participant_id
    group by x.participant_id, p.first_name
    order by last_at desc`;
  return rows.map(
    (row): ShareOpen => ({ name: row.first_name, participantId: row.participant_id, lastAt: row.last_at.toISOString() }),
  );
}

// The most link names one agent's open pages can hold at once, waiting for Send.
const POOL_SIZE = 20;

// A link name for an agent's next Send, made here so the browser never picks
// one. It's no link until Send claims it (claimQuickShare), and a name left
// unused for a day goes, as do the oldest when there are too many.
export async function reserveSendTokenFor(agentId: string) {
  const token = newShareToken();
  await sql.begin(async (tx) => {
    await tx`
      delete from share_token_pool
      where agent_id = ${agentId} and created_at <= now() - interval '24 hours'`;
    await tx`
      delete from share_token_pool where token in (
        select token from share_token_pool where agent_id = ${agentId}
        order by created_at desc offset ${POOL_SIZE - 1})`;
    await tx`insert into share_token_pool (token, agent_id) values (${token}, ${agentId})`;
  });
  return token;
}

// A link opens a package two ways: the package's own link (anyone can join
// by giving a first name), or one person's own link (it opens as them).
export async function getShareByToken(token: string) {
  if (!isShareToken(token)) return null;
  const [row] = await sql<(Share & ShareAgent & { person_id: string | null; person_name: string | null })[]>`
    select s.id, s.token, s.agent_id, s.client_name, s.note,
           a.full_name, a.brokerage, a.photo_data_url, a.brand_color, a.contact_phone, a.contact_email,
           p.id as person_id, p.first_name as person_name
    from shares s
    join accounts a on a.id = s.agent_id
    left join participants p on p.share_id = s.id and p.token = ${token}
    where s.token = ${token} or s.id = (select share_id from participants where token = ${token})
    limit 1`;
  if (!row) return null;
  const {
    full_name,
    brokerage,
    photo_data_url,
    brand_color,
    contact_phone,
    contact_email,
    person_id,
    person_name,
    ...share
  } = row;
  return {
    share: share as Share,
    agent: { full_name, brokerage, photo_data_url, brand_color, contact_phone, contact_email } as ShareAgent,
    // Set when the link is someone's own.
    person: person_id ? { id: person_id, first_name: person_name! } : null,
  };
}

// The people an agent added to a package, each with their own link.
export async function getInvitees(shareId: string) {
  return sql<{ id: string; first_name: string; token: string }[]>`
    select id, first_name, token from participants
    where share_id = ${shareId} and token is not null
    order by invited_at, first_name`;
}

// Adds someone to a package with their own link. Returns their link token.
export async function invitePerson(shareId: string, firstName: string, tx: typeof sql = sql) {
  const token = newShareToken();
  await tx`
    insert into participants (share_id, device_token, first_name, token, invited_at)
    values (${shareId}, ${`invite:${token}`}, ${firstName}, ${token}, now())`;
  return token;
}

// The homes on a share. Clients only ever see the ones still on their link;
// the agent's view also includes homes they removed, flagged with `removedAt`.
export async function getShareListings(shareId: string, { includeRemoved = false } = {}) {
  const rows = await sql<{ data: Listing; standard_status: string; removed_at: Date | null }[]>`
    select l.data, l.standard_status, sl.removed_at
    from share_listings sl join listings l on l.listing_key = sl.listing_key
    where sl.share_id = ${shareId} and (${includeRemoved} or sl.removed_at is null)
    order by sl.position`;
  return rows.map((row) => ({
    ...row.data,
    StandardStatus: row.standard_status,
    Media: [...row.data.Media].sort((a, b) => a.Order - b.Order),
    removedAt: row.removed_at?.toISOString() ?? null,
  }));
}

export async function getThread(shareId: string) {
  const reactions = await sql<
    ({ listing_key: string; participant_id: string; first_name: string } & ReactionState)[]
  >`
    select r.listing_key, r.participant_id, p.first_name, r.reaction, r.liked, r.disliked
    from reactions r join participants p on p.id = r.participant_id
    where r.share_id = ${shareId}
    order by r.updated_at`;
  const comments = await sql<
    {
      id: string;
      listing_key: string;
      participant_id: string | null;
      first_name: string | null;
      agent_name: string | null;
      tag: CommentTag | null;
      body: string;
      created_at: Date;
      shared_publicly: boolean;
      media_key: string | null;
      spot: string | null;
    }[]
  >`
    select c.id, c.listing_key, c.participant_id, p.first_name,
           a.full_name as agent_name, c.tag, c.body, c.created_at, c.shared_publicly, c.media_key, c.spot
    from comments c
    left join participants p on p.id = c.participant_id
    left join accounts a on a.id = c.agent_id
    where c.share_id = ${shareId}
    order by c.created_at`;
  const photoLikes = await sql<
    { listing_key: string; participant_id: string; first_name: string; tag: string; aspect: Aspect | null; media_key: string; data: Listing }[]
  >`
    select pl.listing_key, pl.participant_id, p.first_name, pl.tag, pl.aspect, pl.media_key, l.data
    from photo_likes pl
    join participants p on p.id = pl.participant_id
    join listings l on l.listing_key = pl.listing_key
    where pl.share_id = ${shareId}
    order by pl.created_at`;
  const photoDislikes = await sql<
    { listing_key: string; participant_id: string; first_name: string; tag: string; media_key: string; data: Listing }[]
  >`
    select pd.listing_key, pd.participant_id, p.first_name, pd.tag, pd.media_key, l.data
    from photo_dislikes pd
    join participants p on p.id = pd.participant_id
    join listings l on l.listing_key = pd.listing_key
    where pd.share_id = ${shareId}
    order by pd.created_at`;
  return {
    // What each person didn't like, in the photos or the facts ("Price").
    photoDislikes: photoDislikes.map((l) => ({
      listingKey: l.listing_key,
      participantId: l.participant_id,
      name: l.first_name,
      tag: tagNameIn(l.data, l.media_key, l.tag),
      mediaKey: l.media_key,
    })),
    // What each person liked in the photos.
    photoLikes: photoLikes.map((l) => ({
      listingKey: l.listing_key,
      participantId: l.participant_id,
      name: l.first_name,
      // A spot reads as the thing it's on ("the front door").
      tag: tagNameIn(l.data, l.media_key, l.tag),
      aspect: l.aspect,
      mediaKey: l.media_key,
    })),
    reactions: reactions.map(
      (r): ThreadReaction => ({
        listingKey: r.listing_key,
        participantId: r.participant_id,
        name: r.first_name,
        state: { reaction: r.reaction, liked: r.liked, disliked: r.disliked },
      }),
    ),
    comments: comments.map(
      (c): ThreadComment => ({
        id: c.id,
        listingKey: c.listing_key,
        participantId: c.participant_id,
        name: c.first_name ?? c.agent_name ?? "Agent",
        isAgent: c.participant_id === null,
        tag: c.tag,
        body: c.body,
        createdAt: c.created_at.toISOString(),
        sharedPublicly: c.shared_publicly,
        spot: c.media_key && c.spot ? { mediaKey: c.media_key, tag: c.spot } : null,
      }),
    ),
  };
}

export async function getParticipant(shareId: string, deviceToken: string | undefined) {
  if (!deviceToken) return null;
  const [participant] = await sql<{ id: string; first_name: string }[]>`
    select id, first_name from participants
    where share_id = ${shareId} and device_token = ${deviceToken}`;
  return participant ?? null;
}

export async function shareHasListing(shareId: string, listingKey: string) {
  const [row] = await sql`
    select 1 from share_listings
    where share_id = ${shareId} and listing_key = ${listingKey} and removed_at is null`;
  return Boolean(row);
}

// Something one person liked or didn't in a home: a tag in a photo (or on the
// facts), as it was saved.
export type TakeMark = { mediaKey: string; tag: string };

// Which photo of the home a mark is on, counting from 1, or 0 for the facts.
export const photoNumberOf = (listing: Listing, mediaKey: string) =>
  listing.Media.findIndex((photo) => mediaKeyOf(photo) === mediaKey) + 1;

// "a spot in photo 2", "2 spots in photo 3", "3 spots in photos 1 and 4".
export function spotsWhere(listing: Listing, spots: TakeMark[]) {
  const photos = [...new Set(spots.map((s) => photoNumberOf(listing, s.mediaKey)))].filter((n) => n > 0).sort((a, b) => a - b);
  if (photos.length === 0) return null;
  const where = photos.length === 1 ? `photo ${photos[0]}` : `photos ${photos.slice(0, -1).join(", ")} and ${photos.at(-1)}`;
  return spots.length === 1 ? `a spot in ${where}` : `${spots.length} spots in ${where}`;
}

// One person's take on a home, for the agent, worded as the link words it
// ("liked the kitchen and a spot in a photo"), except that it says which photo
// a spot is in: the agent has no photo open beside it.
export function describeTake(listing: Listing, state: ReactionState, likes: TakeMark[], dislikes: TakeMark[]) {
  const named = (marks: TakeMark[]) => marks.map((m) => tagNameIn(listing, m.mediaKey, m.tag));
  const likeTags = named(likes);
  const dislikeTags = named(dislikes);
  let text = describeReaction(state, likeTags, dislikeTags);
  // Spots that aren't on a named thing keep their "@x,y" name.
  const side = (marks: TakeMark[], tags: string[]) => {
    const spots = marks.filter((_, i) => tags[i].startsWith("@"));
    if (spots.length === 0) return null;
    return { from: spots.length === 1 ? "a spot in a photo" : `${spots.length} spots in the photos`, to: spotsWhere(listing, spots) };
  };
  const liked = side(likes, likeTags);
  const disliked = side(dislikes, dislikeTags);
  // Only "passed, didn't like … but liked …" names the dislikes first.
  const order = text.startsWith("passed, didn't like") ? [disliked, liked] : [liked, disliked];
  let from = 0;
  for (const part of order) {
    if (!part) continue;
    const at = text.indexOf(part.from, from);
    if (at < 0) continue;
    const to = part.to ?? part.from;
    text = text.slice(0, at) + to + text.slice(at + part.from.length);
    from = at + to.length;
  }
  return text;
}
