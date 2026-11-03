"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { sql } from "@/lib/db";
import {
  commentSchema,
  ensureDevice,
  fail,
  MAX_COMMENTS_PER_MINUTE,
  nameSchema,
  reactionSchema,
  readDevice,
  type ActionResult,
} from "@/lib/engagement";
import { notifyAgent } from "@/lib/notify";
import {
  getParticipant,
  getShareByToken,
  shareHasListing,
} from "@/lib/shares";
import { describeReaction, type ReactionState } from "@/lib/reactions";

const MAX_PARTICIPANTS = 25;

export async function joinThread(token: string, firstName: string): Promise<ActionResult> {
  const name = nameSchema.safeParse(firstName);
  if (!name.success) return fail("Please enter your first name.");
  const found = await getShareByToken(token);
  if (!found) return fail("This link is no longer available.");

  const device = await ensureDevice();
  if (!(await getParticipant(found.share.id, device))) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from participants where share_id = ${found.share.id}`;
    if (count >= MAX_PARTICIPANTS) return fail("This conversation is full.");
    await sql`
      insert into participants (share_id, device_token, first_name)
      values (${found.share.id}, ${device}, ${name.data})
      on conflict (share_id, device_token) do nothing`;
  }
  refresh();
  return { ok: true };
}

// The token picks the share and the device cookie picks the person, so a link
// can only ever act on its own thread.
async function resolveActor(token: string, listingKey: string) {
  const found = await getShareByToken(token);
  if (!found || !(await shareHasListing(found.share.id, listingKey))) return null;
  const participant = await getParticipant(found.share.id, await readDevice());
  return participant ? { share: found.share, participant } : null;
}

const likesHome = async (participantId: string, listingKey: string) => {
  const [row] = await sql`
    select 1 from reactions
    where participant_id = ${participantId} and listing_key = ${listingKey} and reaction = 'like'`;
  return Boolean(row);
};

const listingLabel = async (listingKey: string) => {
  const [row] = await sql<{ address: string }[]>`
    select data->>'UnparsedAddress' as address from listings where listing_key = ${listingKey}`;
  return row?.address ?? "a listing";
};

// Saves someone's whole reaction to a home: overall like or dislike plus any
// specifics. Clearing everything removes it.
export async function setReaction(
  token: string,
  listingKey: string,
  input: ReactionState,
): Promise<ActionResult> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return fail("We couldn't save that reaction.");
  const state = parsed.data;
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please add your name first.");

  if (state.reaction === null) {
    await sql`
      delete from reactions
      where share_id = ${actor.share.id} and listing_key = ${listingKey}
        and participant_id = ${actor.participant.id}`;
  } else {
    await sql`
      insert into reactions (share_id, listing_key, participant_id, reaction, liked, disliked)
      values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${state.reaction},
              ${state.liked}::text[], ${state.disliked}::text[])
      on conflict (share_id, listing_key, participant_id)
      do update set reaction = excluded.reaction, liked = excluded.liked,
        disliked = excluded.disliked, updated_at = now()`;
    after(async () => {
      const address = await listingLabel(listingKey);
      await notifyAgent(
        actor.share.id,
        `${actor.participant.first_name} ${describeReaction(state, { pass: true })} at ${address}`,
      );
    });
  }
  refresh();
  return { ok: true };
}

export async function addComment(
  token: string,
  listingKey: string,
  body: string,
  sharePublicly = false,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please add your name first.");
  // A comment goes public only when its author asks, and only once they like
  // the home, so shared quotes never warn other buyers off it.
  const shared = sharePublicly === true && (await likesHome(actor.participant.id, listingKey));

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from comments
    where participant_id = ${actor.participant.id}
      and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  await sql`
    insert into comments (share_id, listing_key, participant_id, body, shared_publicly)
    values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${parsed.data}, ${shared})`;
  after(async () => {
    const address = await listingLabel(listingKey);
    await notifyAgent(actor.share.id, `${actor.participant.first_name} commented on ${address}`);
  });
  refresh();
  return { ok: true };
}

// Lets an author take back a comment they shared publicly, or share it after all.
export async function setCommentSharing(
  token: string,
  commentId: string,
  shared: boolean,
): Promise<ActionResult> {
  const found = await getShareByToken(token);
  if (!found || typeof commentId !== "string" || commentId.length > 64) {
    return fail("We couldn't find that comment.");
  }
  const participant = await getParticipant(found.share.id, await readDevice());
  if (!participant) return fail("We couldn't find that comment.");
  // Taking a comment back is always allowed; sharing it needs a like.
  const updated = await sql`
    update comments c set shared_publicly = ${shared === true}
    where c.id::text = ${commentId} and c.share_id = ${found.share.id}
      and c.participant_id = ${participant.id}
      and (${shared !== true} or exists (
        select 1 from reactions r
        where r.participant_id = c.participant_id and r.listing_key = c.listing_key
          and r.reaction = 'like'))
    returning c.id`;
  if (updated.length === 0) return fail("We couldn't find that comment.");
  refresh();
  return { ok: true };
}
