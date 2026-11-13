"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { firstName as accountFirstName, getCurrentUser } from "@/lib/auth";
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
  linkOnce,
  getParticipant,
  accountParticipant,
  getShareByToken,
  getShareListings,
  shareHasListing,
  type Share,
} from "@/lib/shares";
import type { SpotReaction } from "@/lib/photos";
import { findSpot } from "@/lib/public";
import { describeReaction, type ReactionState } from "@/lib/reactions";
import { sharePersonKey } from "@/lib/timeline";

const MAX_PARTICIPANTS = 25;
const MAX_OPEN_DEVICES = 200;

// Joining the conversation on a link takes an account (made right on the
// link, NameGate): signed in, they're on it by their account's name (or the
// one they give, if it has none yet). Someone's own link is theirs from the
// first time they're signed in there; anyone else's own link isn't.
export async function joinThread(token: string, firstName: string): Promise<ActionResult> {
  const found = await getShareByToken(token);
  if (!found) return fail("This link is no longer available.");
  // The agent never joins their own link as someone on it.
  const preview = await previewing(found);
  if (preview) return fail(`${preview} Nothing here is saved.`);
  const account = await getCurrentUser();
  if (!account?.role) return fail("Please sign up or sign in first.");
  let name = accountFirstName(account);
  if (!name) {
    const given = nameSchema.safeParse(firstName);
    if (!given.success) return fail("Please enter your first name.");
    name = given.data;
    await sql`update accounts set full_name = ${name} where id = ${account.id} and full_name = ''`;
  }

  if (found.person) {
    const me = await accountParticipant(found, account.id);
    if (!me) return fail(`This link is just for ${found.person.first_name}. Ask for a link of your own.`);
    refresh();
    return { ok: true };
  }
  if (!(await accountParticipant(found, account.id))) {
    // A quick Send the agent named for one person, opened through the link
    // they sent: someone joining by that name is that person, so the agent
    // sees one of them, not two. Anyone else joins as themselves.
    const [named] = await sql<{ id: string }[]>`
      update participants p set account_id = ${account.id}, device_token = ${`account:${account.id}`}
      where p.share_id = ${found.share.id} and p.account_id is null and p.invited_at is not null
        and lower(btrim(p.first_name)) = ${name.trim().toLowerCase()}
        and (select count(*) from participants q where q.share_id = p.share_id and q.invited_at is not null) = 1
        and exists (select 1 from shares s where s.id = p.share_id and s.quick)
      returning p.id`;
    let joined = named;
    if (!joined) {
      const [{ count }] = await sql<{ count: number }[]>`
        select count(*)::int as count from participants where share_id = ${found.share.id}`;
      if (count >= MAX_PARTICIPANTS) return fail("This conversation is full.");
      [joined] = await sql<{ id: string }[]>`
        insert into participants (share_id, device_token, first_name, account_id)
        values (${found.share.id}, ${`account:${account.id}`}, ${name}, ${account.id})
        on conflict do nothing
        returning id`;
    }
    if (joined) await linkOnce(account.id, joined.id);
    // The agent's "opened it" line can now say who.
    const device = await readDevice();
    if (joined && device) {
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
  // Who opened it: someone's own link is them; otherwise whoever's signed in,
  // or this browser's place on it from before.
  const account = viewer?.role ? viewer : null;
  const participant =
    found.person ??
    (account ? await accountParticipant(found, account.id, { claim: false }) : null) ??
    (await getParticipant(found.share.id, device));
  // Someone the agent added from Porchcard, opening their link signed in:
  // the first time, they and the agent follow each other (once, ever).
  if (account && participant) await linkOnce(account.id, participant.id);
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

// The most seconds one report can add to a home: the page reports every
// half-minute or so, and when it's put away.
const MAX_SECONDS_PER_REPORT = 300;

// Where someone spent their time on the link, for the agent: how long each
// home was on their screen while they were using it, since the page last said,
// and how many of its photos they've looked at. Only from a device whose open
// was counted (recordOpen), and never the agent's own look.
export async function recordHomeTime(token: string, homes: unknown): Promise<void> {
  if (!Array.isArray(homes) || homes.length === 0 || homes.length > 50) return;
  const found = await getShareByToken(token);
  if (!found) return;
  const viewer = await getCurrentUser();
  if (viewer?.id === found.share.agent_id) return;
  const device = await readDevice();
  if (!device) return;
  const rows = homes.flatMap((home) => {
    const { listingKey, seconds, photos } = (home ?? {}) as Record<string, unknown>;
    if (typeof listingKey !== "string" || listingKey.length > 100) return [];
    const s = Number.isInteger(seconds) ? Math.min(Math.max(seconds as number, 0), MAX_SECONDS_PER_REPORT) : 0;
    const p = Number.isInteger(photos) ? Math.min(Math.max(photos as number, 0), 1000) : 0;
    return s > 0 || p > 0 ? [{ listingKey, seconds: s, photos: p }] : [];
  });
  if (rows.length === 0) return;
  const hash = deviceHashFor(device, found.share.id);
  for (const row of rows) {
    // Only a home on this link, from a device counted as opening it.
    await sql`
      insert into share_home_views (share_id, listing_key, device_hash, seconds, photos_seen)
      select ${found.share.id}::uuid, ${row.listingKey}::text, ${hash}::text, ${row.seconds}::int, ${row.photos}::int
      where exists (select 1 from share_listings where share_id = ${found.share.id} and listing_key = ${row.listingKey})
        and exists (select 1 from share_opens where share_id = ${found.share.id} and device_hash = ${hash})
      on conflict (share_id, listing_key, device_hash) do update set
        seconds = share_home_views.seconds + excluded.seconds,
        photos_seen = greatest(share_home_views.photos_seen, excluded.photos_seen),
        last_at = now()`;
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

// Who's acting on a link: always someone signed in (NameGate saw to that),
// as their place on it. Someone's own link is them once it's theirs. Either
// way a link can only ever act on its own package.
async function personOn(found: Found) {
  const account = await getCurrentUser();
  if (!account?.role) return null;
  return accountParticipant(found, account.id);
}

// (The agent on their own link: `preview` says so, and `found` is the link,
// for what they can do there, their own first pass.)
type Actor = { preview: string; found: Found } | { share: Share; participant: { id: string; first_name: string } };

async function resolveActor(token: string, listingKey: string): Promise<Actor | null> {
  const found = await getShareByToken(token);
  if (!found || !(await shareHasListing(found.share.id, listingKey))) return null;
  const preview = await previewing(found);
  if (preview) return { preview, found };
  const participant = await personOn(found);
  return participant ? { share: found.share, participant } : null;
}

// What a reply answers, if it is one: a comment on this link, or someone's
// likes here ("like:" and who they are on the link, as the page has it).
// Replies go one level deep, and only ever among the people on this link.
async function replyTarget(
  shareId: string,
  listingKey: string,
  parentId: unknown,
): Promise<{ parent: string | null; replyTo: string | null } | { error: string }> {
  if (typeof parentId !== "string" || !parentId) return { parent: null, replyTo: null };
  if (parentId.startsWith("like:")) {
    const key = parentId.slice(5);
    const people = await sql<{ id: string }[]>`select id from participants where share_id = ${shareId}`;
    const person = people.find((p) => sharePersonKey(shareId, `p:${p.id}`) === key);
    const [liked] = person
      ? await sql`
          select 1 from reactions
          where share_id = ${shareId} and listing_key = ${listingKey} and participant_id = ${person.id}
          union all
          select 1 from photo_likes
          where share_id = ${shareId} and listing_key = ${listingKey} and participant_id = ${person.id}
          union all
          select 1 from photo_dislikes
          where share_id = ${shareId} and listing_key = ${listingKey} and participant_id = ${person.id}
          limit 1`
      : [];
    if (!person || !liked) return { error: "Those likes aren't there anymore." };
    return { parent: null, replyTo: person.id };
  }
  if (parentId.length > 64) return { error: "That comment isn't there anymore." };
  const [found] = await sql`
    select 1 from comments
    where id::text = ${parentId} and share_id = ${shareId} and listing_key = ${listingKey}
      and parent_id is null and reply_to_participant is null`;
  if (!found) return { error: "That comment isn't there anymore." };
  return { parent: parentId, replyTo: null };
}

// The agent's first pass on their own link: a note on the home, or on one
// thing in it (the price, a spot in a photo), or a reply to someone there.
// Everyone on the link reads it as the agent's; no email goes out about it.
async function addAgentNote(
  found: Found,
  listingKey: string,
  body: string,
  parentId: unknown,
  spot: unknown,
): Promise<ActionResult> {
  const target = await replyTarget(found.share.id, listingKey, parentId);
  if ("error" in target) return fail(target.error);
  const reply = target.parent !== null || target.replyTo !== null;
  const anchor = reply ? null : await checkAnchor(listingKey, spot);
  if (anchor === false) return fail("That photo isn't there anymore.");
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from comments
    where agent_id = ${found.share.agent_id} and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");
  await sql`
    insert into comments (share_id, listing_key, agent_id, body, media_key, spot, parent_id, reply_to_participant)
    values (${found.share.id}, ${listingKey}, ${found.share.agent_id}, ${body},
      ${anchor?.mediaKey ?? null}, ${anchor?.tag ?? null}, ${target.parent}::uuid, ${target.replyTo}::uuid)`;
  refresh();
  return { ok: true };
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
  if (!actor) return fail("Please sign up or sign in first.");
  // The heart on a home is the client's say; the agent's is in their notes.
  if ("preview" in actor) return fail("The heart is for your client. Tap the price, or anything in a photo, to leave a note.");

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
      await notifyAgent(actor.share.id, `${actor.participant.first_name} ${describeReaction(state)} at ${address}`, {
        anchor: `home-${listingKey}`,
      });
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
  // What it answers, if it's a reply: a comment on this link, or someone's
  // likes here ("like:" and who they are on the link, as the page has it).
  parentId: unknown = null,
  // A spot in a photo it's about, if any.
  spot: unknown = null,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  const actor = await resolveActor(token, listingKey);
  if (!actor) return fail("Please sign up or sign in first.");
  if ("preview" in actor) return addAgentNote(actor.found, listingKey, parsed.data, parentId, spot);
  const target = await replyTarget(actor.share.id, listingKey, parentId);
  if ("error" in target) return fail(target.error);
  const { parent, replyTo } = target;
  const reply = parent !== null || replyTo !== null;
  // A reply is about whatever it answers.
  const anchor = reply ? null : await checkAnchor(listingKey, spot);
  if (anchor === false) return fail("That photo isn't there anymore.");
  // A comment goes public only when its author asks, and only once they like
  // the home, so shared quotes never warn other buyers off it. Replies never do.
  const shared = !reply && sharePublicly === true && (await likesHome(actor.participant.id, listingKey));

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from comments
    where participant_id = ${actor.participant.id}
      and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  const [comment] = await sql<{ id: string }[]>`
    insert into comments (share_id, listing_key, participant_id, body, shared_publicly, media_key, spot,
      parent_id, reply_to_participant)
    values (${actor.share.id}, ${listingKey}, ${actor.participant.id}, ${parsed.data}, ${shared},
      ${anchor?.mediaKey ?? null}, ${anchor?.tag ?? null}, ${parent}::uuid, ${replyTo}::uuid)
    returning id`;
  after(async () => {
    const address = await listingLabel(listingKey);
    await notifyAgent(actor.share.id, `${actor.participant.first_name} ${reply ? "replied" : "commented"} on ${address}`, {
      anchor: `comment-${comment.id}`,
    });
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
  if (!participant) return { ok: false, error: "Please sign up or sign in first." };
  // The ask's own record says whether they've asked today, not the words of a
  // comment. Claiming it is a single step, so two taps at once ask only once.
  const asked = await sql.begin(async (tx): Promise<string | null> => {
    const [fresh] = await tx`
      insert into share_asks (participant_id, listing_key, share_id)
      values (${participant.id}, ${listingKey}, ${found.share.id})
      on conflict (participant_id, listing_key) do update set asked_at = now(), share_id = excluded.share_id
      where share_asks.asked_at < now() - interval '24 hours'
      returning asked_at`;
    if (!fresh) return null;
    const [comment] = await tx<{ id: string }[]>`
      insert into comments (share_id, listing_key, participant_id, body)
      values (${found.share.id}, ${listingKey}, ${participant.id}, ${ASK_TO_SEE})
      returning id`;
    return comment.id;
  });
  if (!asked) return { ok: true, already: true };
  after(async () => {
    const address = await listingLabel(listingKey);
    await notifyAgent(found.share.id, `${participant.first_name} asked to see ${address}`, {
      now: true,
      anchor: `comment-${asked}`,
    });
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
  if (!actor) return fail("Please sign up or sign in first.");
  const spot = await findSpot(listingKey, mediaKey, tag);
  if (!spot) return fail("That photo isn't there anymore.");
  // The agent's first pass: what they like or don't, for everyone on the link
  // to see. A like replaces a dislike, and the other way around.
  if ("preview" in actor) {
    const shareId = actor.found.share.id;
    if (reaction) {
      await sql`
        insert into share_agent_likes (share_id, listing_key, media_key, tag, reaction)
        values (${shareId}, ${listingKey}, ${mediaKey}, ${tag}, ${reaction})
        on conflict (share_id, listing_key, media_key, tag)
        do update set reaction = excluded.reaction, created_at = now()`;
    } else {
      await sql`
        delete from share_agent_likes
        where share_id = ${shareId} and listing_key = ${listingKey} and media_key = ${mediaKey} and tag = ${tag}`;
    }
    refresh();
    return { ok: true };
  }
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
