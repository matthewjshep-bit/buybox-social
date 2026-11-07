"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
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
  deviceHashFor,
  getParticipant,
  getShareByToken,
  getShareListings,
  shareHasListing,
} from "@/lib/shares";
import type { SpotReaction } from "@/lib/photos";
import { findSpot } from "@/lib/public";
import { describeReaction, type ReactionState } from "@/lib/reactions";

const MAX_PARTICIPANTS = 25;
const MAX_OPEN_DEVICES = 200;

export async function joinThread(token: string, firstName: string): Promise<ActionResult> {
  const name = nameSchema.safeParse(firstName);
  if (!name.success) return fail("Please enter your first name.");
  const found = await getShareByToken(token);
  if (!found) return fail("This link is no longer available.");
  // The agent never joins their own link as someone on it.
  const preview = await previewing(found);
  if (preview) return fail(`${preview} Nothing here is saved.`);
  // Someone's own link already knows who they are.
  if (found.person) return { ok: true };

  const device = await ensureDevice();
  if (!(await getParticipant(found.share.id, device))) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from participants where share_id = ${found.share.id}`;
    if (count >= MAX_PARTICIPANTS) return fail("This conversation is full.");
    const [joined] = await sql<{ id: string }[]>`
      insert into participants (share_id, device_token, first_name)
      values (${found.share.id}, ${device}, ${name.data})
      on conflict (share_id, device_token) do nothing
      returning id`;
    // The agent's "opened it" line can now say who.
    if (joined) {
      await sql`
        update share_opens set participant_id = ${joined.id}
        where share_id = ${found.share.id} and device_hash = ${deviceHashFor(device, found.share.id)}
          and participant_id is null`;
    }
  }
  refresh();
  return { ok: true };
}

// Tells the agent their link was opened, and when: called by the page once it's
// on screen, so link previews and crawlers don't count. A device counts again
// only after 10 minutes, and the agent's own look at their link never counts.
// `photosSeen` is how many photos this device has looked at so far.
export async function recordOpen(token: string, photosSeen?: unknown): Promise<void> {
  const found = await getShareByToken(token);
  if (!found) return;
  const viewer = await getCurrentUser();
  if (viewer?.id === found.share.agent_id) return;
  const photos = Number.isInteger(photosSeen) ? Math.min(Math.max(photosSeen as number, 0), 10_000) : 0;

  const device = await ensureDevice();
  const participant = found.person ?? (await getParticipant(found.share.id, device));
  const hash = deviceHashFor(device, found.share.id);
  // Past MAX_OPEN_DEVICES, only devices already counted are updated, so a link
  // that gets passed around (or a script without cookies) can't grow forever.
  const [opened] = await sql<{ first: boolean }[]>`
    insert into share_opens (share_id, device_hash, participant_id, photos_seen)
    select ${found.share.id}::uuid, ${hash}::text, ${participant?.id ?? null}::uuid, ${photos}::int
    where (select count(*) from share_opens where share_id = ${found.share.id}) < ${MAX_OPEN_DEVICES}::int
      or exists (select 1 from share_opens where share_id = ${found.share.id} and device_hash = ${hash})
    on conflict (share_id, device_hash) do update set
      last_at = now(),
      participant_id = coalesce(excluded.participant_id, share_opens.participant_id)
    where share_opens.last_at < now() - interval '10 minutes'
    returning first_at = last_at as first`;
  if (photos > 0) {
    await sql`
      update share_opens set photos_seen = greatest(photos_seen, ${photos})
      where share_id = ${found.share.id} and device_hash = ${hash}`;
  }
  // The first time a device opens it, the agent hears about it: in an email of
  // its own, at most one every 10 minutes, apart from the one about what the
  // client then likes or says.
  if (opened?.first) {
    after(async () => {
      const homes = await getShareListings(found.share.id);
      const link =
        homes.length === 0
          ? "your link"
          : `your link to ${homes.length === 1 ? homes[0].UnparsedAddress : `${homes.length} homes`}`;
      await notifyAgent(
        found.share.id,
        participant
          ? `${participant.first_name} opened ${link}`
          : found.share.client_name
            ? `Your link for ${found.share.client_name} was opened`
            : `${link[0].toUpperCase()}${link.slice(1)} was opened`,
        { open: true },
      );
    });
  }
}

type Found = NonNullable<Awaited<ReturnType<typeof getShareByToken>>>;

// The agent opening their own link (Preview, on the client's page) sees what
// the client sees, but nothing they tap or write there is saved as anyone:
// not as the client, not as an open, and no email goes out. Says so, naming
// who they're previewing, or null for everyone else.
async function previewing(found: Found) {
  const viewer = await getCurrentUser();
  if (viewer?.id !== found.share.agent_id) return null;
  const who = found.person?.first_name ?? found.share.client_name;
  if (!who) return "You're previewing your link.";
  return `You're previewing what ${who} ${!found.person && /[&,]| and /i.test(who) ? "see" : "sees"}.`;
}

// Who's acting on a link. Someone's own link is them; on the package's own
// link the device cookie picks the person. Either way a link can only ever
// act on its own package.
async function personOn(found: Found) {
  return found.person ?? (await getParticipant(found.share.id, await readDevice()));
}

async function resolveActor(token: string, listingKey: string) {
  const found = await getShareByToken(token);
  if (!found || !(await shareHasListing(found.share.id, listingKey))) return null;
  const preview = await previewing(found);
  if (preview) return { preview };
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
  if ("preview" in actor) return fail(`${actor.preview} Nothing here is saved.`);

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
  if ("preview" in actor) return fail(`${actor.preview} To say something, reply from your dashboard.`);
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
  const found = await getShareByToken(token);
  if (!found) return { ok: false, error: "This link is no longer available." };
  // The agent may have taken the home off the link while the sheet was open.
  if (!(await shareHasListing(found.share.id, listingKey))) {
    return { ok: false, error: "That home isn't on this link anymore." };
  }
  const preview = await previewing(found);
  if (preview) return { ok: false, error: `${preview} Nothing was sent.` };
  const participant = await personOn(found);
  if (!participant) return { ok: false, error: "Please add your name first." };
  // The ask's own record says whether they've asked today, not the words of a
  // comment. Claiming it is a single step, so two taps at once ask only once.
  const asked = await sql.begin(async (tx) => {
    const [fresh] = await tx`
      insert into share_asks (participant_id, listing_key, share_id)
      values (${participant.id}, ${listingKey}, ${found.share.id})
      on conflict (participant_id, listing_key) do update set asked_at = now(), share_id = excluded.share_id
      where share_asks.asked_at < now() - interval '24 hours'
      returning asked_at`;
    if (!fresh) return false;
    await tx`
      insert into comments (share_id, listing_key, participant_id, body)
      values (${found.share.id}, ${listingKey}, ${participant.id}, ${ASK_TO_SEE})`;
    return true;
  });
  if (!asked) return { ok: true, already: true };
  after(async () => {
    const address = await listingLabel(listingKey);
    await notifyAgent(found.share.id, `${participant.first_name} asked to see ${address}`, { now: true });
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
  const preview = await previewing(found);
  if (preview) return fail(`${preview} Nothing here is saved.`);
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
  if ("preview" in actor) return fail(`${actor.preview} Nothing here is saved.`);
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
