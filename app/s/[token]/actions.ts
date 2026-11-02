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
  type CommentTag,
  type Reaction,
} from "@/lib/shares";

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

const listingLabel = async (listingKey: string) => {
  const [row] = await sql<{ address: string }[]>`
    select data->>'UnparsedAddress' as address from listings where listing_key = ${listingKey}`;
  return row?.address ?? "a listing";
};

const REACTION_VERBS: Record<Reaction, string> = {
  love: "loved",
  maybe: "said maybe to",
  pass: "passed on",
};

export async function setReaction(
  token: string,
  listingKey: string,
  reaction: Reaction | null,
): Promise<ActionResult> {
  if (!reactionSchema.safeParse(reaction).success) return fail("Unknown reaction.");
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please add your name first.");

  if (reaction === null) {
    await sql`
      delete from reactions
      where share_id = ${actor.share.id} and listing_key = ${listingKey}
        and participant_id = ${actor.participant.id}`;
  } else {
    await sql`
      insert into reactions (share_id, listing_key, participant_id, reaction)
      values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${reaction})
      on conflict (share_id, listing_key, participant_id)
      do update set reaction = excluded.reaction, updated_at = now()`;
    after(async () => {
      const address = await listingLabel(listingKey);
      await notifyAgent(
        actor.share.id,
        `${actor.participant.first_name} ${REACTION_VERBS[reaction]} ${address}`,
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
  tag: CommentTag | null,
  sharePublicly = false,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse({ body, tag });
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  // Only "Like" comments can go public, and only when their author says so.
  const shared = sharePublicly === true && parsed.data.tag === "like";
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please add your name first.");

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from comments
    where participant_id = ${actor.participant.id}
      and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  await sql`
    insert into comments (share_id, listing_key, participant_id, tag, body, shared_publicly)
    values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${parsed.data.tag},
            ${parsed.data.body}, ${shared})`;
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
  const updated = await sql`
    update comments set shared_publicly = ${shared === true}
    where id::text = ${commentId} and share_id = ${found.share.id}
      and participant_id = ${participant.id} and tag = 'like'
    returning id`;
  if (updated.length === 0) return fail("We couldn't find that comment.");
  refresh();
  return { ok: true };
}
