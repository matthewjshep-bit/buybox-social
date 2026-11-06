"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { sql } from "@/lib/db";
import {
  checkAnchor,
  commentSchema,
  ensureDevice,
  fail,
  MAX_COMMENTS_PER_MINUTE,
  nameSchema,
  photoLikeSchema,
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
import type { SpotReaction } from "@/lib/photos";
import { findSpot } from "@/lib/public";
import { describeReaction, type ReactionState } from "@/lib/reactions";

const MAX_PARTICIPANTS = 25;

export async function joinThread(token: string, firstName: string): Promise<ActionResult> {
  const name = nameSchema.safeParse(firstName);
  if (!name.success) return fail("Please enter your first name.");
  const found = await getShareByToken(token);
  if (!found) return fail("This link is no longer available.");
  // Someone's own link already knows who they are.
  if (found.person) return { ok: true };

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

// Who's acting on a link. Someone's own link is them; on the package's own
// link the device cookie picks the person. Either way a link can only ever
// act on its own package.
async function personOn(found: NonNullable<Awaited<ReturnType<typeof getShareByToken>>>) {
  return found.person ?? (await getParticipant(found.share.id, await readDevice()));
}

async function resolveActor(token: string, listingKey: string) {
  const found = await getShareByToken(token);
  if (!found || !(await shareHasListing(found.share.id, listingKey))) return null;
  const participant = await personOn(found);
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
        `${actor.participant.first_name} ${describeReaction(state)} at ${address}`,
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
  // Links don't have replies; the slot is kept so the page calls both alike.
  _parentId?: unknown,
  // A spot in a photo it's about, if any.
  spot: unknown = null,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please add your name first.");
  const anchor = await checkAnchor(listingKey, spot);
  if (anchor === false) return fail("That photo isn't there anymore.");
  // A comment goes public only when its author asks, and only once they like
  // the home, so shared quotes never warn other buyers off it.
  const shared = sharePublicly === true && (await likesHome(actor.participant.id, listingKey));

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from comments
    where participant_id = ${actor.participant.id}
      and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  await sql`
    insert into comments (share_id, listing_key, participant_id, body, shared_publicly, media_key, spot)
    values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${parsed.data}, ${shared},
      ${anchor?.mediaKey ?? null}, ${anchor?.tag ?? null})`;
  after(async () => {
    const address = await listingLabel(listingKey);
    await notifyAgent(actor.share.id, `${actor.participant.first_name} commented on ${address}`);
  });
  refresh();
  return { ok: true };
}

const ASK_TO_SEE = "Can we see it in person?";

export type AskResult = { ok: true; already: boolean } | { ok: false; error: string };

// "Ask to see it", from the Contact sheet: says so under the home, as that
// person, and tells the agent at once rather than in the next batched email.
// Once a day per person per home; asking again says it's already asked.
export async function askToSee(token: string, listingKey: string): Promise<AskResult> {
  if (typeof listingKey !== "string" || listingKey.length > 100) return { ok: false, error: "We couldn't find that home." };
  const actor = await resolveActor(token, listingKey);
  if (!actor) return { ok: false, error: "Please add your name first." };
  const inserted = await sql`
    insert into comments (share_id, listing_key, participant_id, body)
    select ${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${ASK_TO_SEE}
    where not exists (
      select 1 from comments
      where participant_id = ${actor.participant.id} and listing_key = ${listingKey}
        and body = ${ASK_TO_SEE} and created_at > now() - interval '24 hours')
    returning id`;
  if (inserted.length === 0) return { ok: true, already: true };
  after(async () => {
    const address = await listingLabel(listingKey);
    await notifyAgent(actor.share.id, `${actor.participant.first_name} asked to see ${address}`, { now: true });
  });
  refresh();
  return { ok: true, already: false };
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
  const participant = await personOn(found);
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

// Liking (or not) something in a photo, or one of the facts, on an agent's
// link. Private to the link, like everything else said there.
export async function likePhotoInShare(
  token: string,
  listingKey: string,
  mediaKey: string,
  tag: string,
  reaction: SpotReaction,
): Promise<ActionResult> {
  const input = photoLikeSchema.safeParse({ listingKey, mediaKey, tag, reaction });
  if (!input.success) return fail("We couldn't save that.");
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please add your name first.");
  const spot = await findSpot(listingKey, mediaKey, tag);
  if (!spot) return fail("That photo isn't there anymore.");
  const where = sql`participant_id = ${actor.participant.id} and listing_key = ${listingKey}
    and media_key = ${mediaKey} and tag = ${tag}`;
  // A like replaces a dislike, and the other way around.
  await sql.begin(async (tx) => {
    if (reaction !== "like") await tx`delete from photo_likes where ${where}`;
    if (reaction !== "dislike") await tx`delete from photo_dislikes where ${where}`;
    if (reaction === "like") {
      await tx`
        insert into photo_likes (share_id, listing_key, participant_id, media_key, tag, aspect)
        values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${mediaKey}, ${tag}, ${spot.aspect})
        on conflict do nothing`;
    } else if (reaction === "dislike") {
      await tx`
        insert into photo_dislikes (share_id, listing_key, participant_id, media_key, tag)
        values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${mediaKey}, ${tag})
        on conflict do nothing`;
    }
  });
  refresh();
  return { ok: true };
}
