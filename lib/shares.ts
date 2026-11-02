import { randomBytes } from "node:crypto";
import { sql } from "./db";
import type { Listing } from "./listings/types";

export type Reaction = "love" | "maybe" | "pass";
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
  reaction: Reaction;
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

export async function getShareByToken(token: string) {
  if (!isShareToken(token)) return null;
  const [row] = await sql<(Share & ShareAgent)[]>`
    select s.id, s.token, s.agent_id, s.client_name, s.note,
           a.full_name, a.brokerage, a.photo_data_url, a.brand_color
    from shares s join agents a on a.id = s.agent_id
    where s.token = ${token}`;
  if (!row) return null;
  const { full_name, brokerage, photo_data_url, brand_color, ...share } = row;
  return {
    share: share as Share,
    agent: { full_name, brokerage, photo_data_url, brand_color } as ShareAgent,
  };
}

export async function getShareListings(shareId: string) {
  const rows = await sql<{ data: Listing; standard_status: string }[]>`
    select l.data, l.standard_status
    from share_listings sl join listings l on l.listing_key = sl.listing_key
    where sl.share_id = ${shareId}
    order by sl.position`;
  return rows.map((row) => ({
    ...row.data,
    StandardStatus: row.standard_status,
    Media: [...row.data.Media].sort((a, b) => a.Order - b.Order),
  }));
}

export async function getThread(shareId: string) {
  const reactions = await sql<
    { listing_key: string; participant_id: string; first_name: string; reaction: Reaction }[]
  >`
    select r.listing_key, r.participant_id, p.first_name, r.reaction
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
    left join agents a on a.id = c.agent_id
    where c.share_id = ${shareId}
    order by c.created_at`;
  return {
    reactions: reactions.map(
      (r): ThreadReaction => ({
        listingKey: r.listing_key,
        participantId: r.participant_id,
        name: r.first_name,
        reaction: r.reaction,
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
    where share_id = ${shareId} and listing_key = ${listingKey}`;
  return Boolean(row);
}
