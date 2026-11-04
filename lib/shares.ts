import { randomBytes } from "node:crypto";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import type { Aspect, ReactionState } from "./reactions";

export type CommentTag = "like" | "dislike";

export type ShareAgent = {
  full_name: string;
  brokerage: string;
  photo_data_url: string | null;
  brand_color: string;
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
};

export const newShareToken = () => randomBytes(24).toString("base64url");

export const isShareToken = (token: string) => /^[\w-]{32}$/.test(token);

// A link opens a package two ways: the package's own link (anyone can join
// by giving a first name), or one person's own link (it opens as them).
export async function getShareByToken(token: string) {
  if (!isShareToken(token)) return null;
  const [row] = await sql<(Share & ShareAgent & { person_id: string | null; person_name: string | null })[]>`
    select s.id, s.token, s.agent_id, s.client_name, s.note,
           a.full_name, a.brokerage, a.photo_data_url, a.brand_color,
           p.id as person_id, p.first_name as person_name
    from shares s
    join accounts a on a.id = s.agent_id
    left join participants p on p.share_id = s.id and p.token = ${token}
    where s.token = ${token} or s.id = (select share_id from participants where token = ${token})
    limit 1`;
  if (!row) return null;
  const { full_name, brokerage, photo_data_url, brand_color, person_id, person_name, ...share } = row;
  return {
    share: share as Share,
    agent: { full_name, brokerage, photo_data_url, brand_color } as ShareAgent,
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
    }[]
  >`
    select c.id, c.listing_key, c.participant_id, p.first_name,
           a.full_name as agent_name, c.tag, c.body, c.created_at, c.shared_publicly
    from comments c
    left join participants p on p.id = c.participant_id
    left join accounts a on a.id = c.agent_id
    where c.share_id = ${shareId}
    order by c.created_at`;
  const photoLikes = await sql<
    { listing_key: string; participant_id: string; first_name: string; tag: string; aspect: Aspect | null }[]
  >`
    select pl.listing_key, pl.participant_id, p.first_name, pl.tag, pl.aspect
    from photo_likes pl join participants p on p.id = pl.participant_id
    where pl.share_id = ${shareId}
    order by pl.created_at`;
  return {
    // What each person liked in the photos.
    photoLikes: photoLikes.map((l) => ({
      listingKey: l.listing_key,
      participantId: l.participant_id,
      name: l.first_name,
      tag: l.tag,
      aspect: l.aspect,
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
