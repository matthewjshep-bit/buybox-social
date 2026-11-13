import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import type { PersonPick } from "./people-picker";
import { isPointTag, tagNameIn } from "./photos";
import { describeReaction, spotPlace, spotsIn, type Aspect, type ReactionState } from "./reactions";

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
  // The welcome screen's headline in the agent's words; empty for the standard line.
  headline: string;
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
  // A reply: whose comment (or whose likes) it answers.
  replyTo?: { name: string; likes: boolean } | null;
};

// What a link is called, worked out the way the database does it; and its
// name wherever it's shown (lib/people-picker.ts, so the browser has them too).
export { linkTitle, peopleTitle } from "./people-picker";

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
  // The most photos one of their devices has looked at on the link.
  photosSeen: number;
};

// "saw 3 of 4 photos", "saw all 4 photos" ("saw the photo", for a link with
// one): how much of a link someone looked at, of the photos on it now. Null
// before they've looked at any.
export function photosSeenLine(seen: number, photos: number) {
  const n = Math.min(seen, photos);
  if (n <= 0) return null;
  if (photos === 1) return "saw the photo";
  return `saw ${n === photos ? `all ${photos}` : `${n} of ${photos}`} photos`;
}

// "45 sec", "3 min", "1 hr 5 min": time spent, for the agent.
export function duration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ""}`;
}

// Where people spent their time on links (share_home_views), for the agent:
// per link and home, the seconds it was on screen, every device together, and
// the most of its photos one device looked at. Keyed `${shareId}:${listingKey}`.
export type HomeView = { seconds: number; photosSeen: number };
export const homeViewKey = (shareId: string, listingKey: string) => `${shareId}:${listingKey}`;
export async function getHomeViews(shareIds: string[]): Promise<Map<string, HomeView>> {
  if (shareIds.length === 0) return new Map();
  const rows = await sql<{ share_id: string; listing_key: string; seconds: number; photos_seen: number }[]>`
    select share_id, listing_key, sum(seconds)::int as seconds, max(photos_seen)::int as photos_seen
    from share_home_views
    where share_id in ${sql(shareIds)}
    group by share_id, listing_key`;
  return new Map(
    rows.map((row) => [homeViewKey(row.share_id, row.listing_key), { seconds: row.seconds, photosSeen: row.photos_seen }]),
  );
}

// Who has had a link open, and when they last did, newest first: for the agent
// only. Anything someone did on it counts too, so a link sent before opens
// were counted still shows who has been on it.
export async function getShareOpens(shareId: string) {
  const rows = await sql<
    { participant_id: string | null; first_name: string | null; last_at: Date; photos_seen: number }[]
  >`
    select x.participant_id, p.first_name, max(x.at) as last_at, max(x.photos_seen)::int as photos_seen
    from (
      select participant_id, last_at as at, photos_seen from share_opens where share_id = ${shareId}
      union all
      select participant_id, at, 0 from (${clientActivity()}) a where a.share_id = ${shareId}
    ) x
    left join participants p on p.id = x.participant_id
    group by x.participant_id, p.first_name
    order by last_at desc`;
  return rows.map(
    (row): ShareOpen => ({
      name: row.first_name,
      participantId: row.participant_id,
      lastAt: row.last_at.toISOString(),
      photosSeen: row.photos_seen,
    }),
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
    select s.id, s.token, s.agent_id, s.client_name, s.note, s.headline,
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

// Someone signed in, on a link: their place on it. On someone's own link,
// that person, theirs from the first time they're signed in there (unless
// they're on the package already another way, which stays theirs). Otherwise
// their own place on the package (a browser's from before they signed in
// became theirs then). Null when they have none yet, or when the link is
// someone else's own. `claim: false` only looks. Claiming also links them to
// the agent, once (linkOnce): someone the agent added from Porchcard is theirs
// already, and is linked the first time they act there.
export async function accountParticipant(
  found: { share: Pick<Share, "id">; person: { id: string; first_name: string } | null },
  accountId: string,
  { claim = true } = {},
) {
  const [mine] = await sql<{ id: string; first_name: string; linked: boolean }[]>`
    select id, first_name, linked_at is not null as linked
    from participants where share_id = ${found.share.id} and account_id = ${accountId}`;
  const own = mine ? { id: mine.id, first_name: mine.first_name } : null;
  if (mine && claim && !mine.linked) await linkOnce(accountId, mine.id);
  if (!found.person) return own;
  const [person] = await sql<{ id: string; first_name: string; account_id: string | null }[]>`
    select id, first_name, account_id from participants where id = ${found.person.id}`;
  if (!person) return own;
  if (person.account_id === accountId) return { id: person.id, first_name: person.first_name };
  if (person.account_id) return null;
  if (own) return own;
  if (claim) {
    // (Someone else signed in there a moment ago: then it's theirs.)
    const [claimed] = await sql`
      update participants set account_id = ${accountId}
      where id = ${person.id} and account_id is null
      returning id`;
    if (!claimed) return null;
    await linkOnce(accountId, person.id);
  }
  return { id: person.id, first_name: person.first_name };
}

// The agent's own profile, under their own first name, made the first time
// it's needed: so their clients can follow them, and so the homes they send
// someone on Porchcard can say who they're from.
export async function ensureAgentProfile(agentId: string) {
  await sql`
    insert into visitors (device_token, first_name, account_id)
    select 'account:' || a.id, split_part(regexp_replace(btrim(a.full_name), '[[:space:]]+', ' ', 'g'), ' ', 1), a.id
    from accounts a where a.id = ${agentId}
    on conflict do nothing`;
}

// Someone with an account just became theirs on an agent's link (claimed their
// own link, joined a package's, or signed in on a browser that was on one):
// they have a profile, and they and the agent follow each other. Only ever
// through linkOnce, so it happens once for each agent and client: either can
// stop following later, and nothing here starts it again.
export async function joinedLink(accountId: string, shareId: string) {
  await ensureLinkProfile(accountId);
  const [agent] = await sql<{ agent_id: string }[]>`select agent_id from shares where id = ${shareId}`;
  if (!agent || agent.agent_id === accountId) return;
  await ensureAgentProfile(agent.agent_id);
  await sql`
    insert into follows (follower_id, followed_id)
    select one.id, other.id
    from visitors one, visitors other
    where (one.account_id, other.account_id) in ((${accountId}::uuid, ${agent.agent_id}::uuid), (${agent.agent_id}::uuid, ${accountId}::uuid))
    on conflict do nothing`;
}

// A place on an agent's link counts as someone's for the first time (they
// claimed it, joined, signed in, or opened a link the agent added them to):
// the first time this agent and this client are linked at all, they follow
// each other (joinedLink). After that, a new link from the same agent never
// starts it again, so someone who stopped following their agent stays that
// way. Any other call only makes sure they have a profile.
export async function linkOnce(accountId: string, participantId: string) {
  const [linked] = await sql<{ share_id: string; agent_id: string }[]>`
    update participants p set linked_at = now()
    from shares s
    where p.id = ${participantId} and p.account_id = ${accountId} and p.linked_at is null and s.id = p.share_id
    returning p.share_id, s.agent_id`;
  if (linked) {
    const [before] = await sql`
      select 1 from participants q join shares s on s.id = q.share_id
      where q.account_id = ${accountId} and s.agent_id = ${linked.agent_id}
        and q.id <> ${participantId} and q.linked_at is not null
      limit 1`;
    if (!before) return joinedLink(accountId, linked.share_id);
  }
  await ensureLinkProfile(accountId);
}

// Someone with an account on an agent's link has a profile, so wherever they
// appear on the agent's pages their name can link to it: made the first time,
// under the first name on their account, or else the one they have on a link.
// (Only for people on links: anyone else's is made when they first need it.)
export async function ensureLinkProfile(accountId: string) {
  await sql`
    insert into visitors (device_token, first_name, account_id)
    select 'account:' || a.id,
      coalesce(
        nullif(split_part(regexp_replace(btrim(a.full_name), '[[:space:]]+', ' ', 'g'), ' ', 1), ''),
        (select p.first_name from participants p where p.account_id = a.id order by p.created_at limit 1),
        ''),
      a.id
    from accounts a
    where a.id = ${accountId} and exists (select 1 from participants p where p.account_id = a.id)
    on conflict do nothing`;
}

// The people an agent added to a package, each with their own link.
export async function getInvitees(shareId: string) {
  return sql<{ id: string; first_name: string; token: string }[]>`
    select id, first_name, token from participants
    where share_id = ${shareId} and token is not null
    order by invited_at, position nulls last, created_at, first_name`;
}

// Everyone on a link, by first name: the people the agent added, and anyone
// who joined through the link anyone can open. Only ever shown on the link
// itself, to the people on it.
export async function getShareMembers(shareId: string) {
  const rows = await sql<{ first_name: string }[]>`
    select first_name from participants
    where share_id = ${shareId}
    order by invited_at nulls last, position nulls last, created_at, first_name`;
  return rows.map((row) => row.first_name);
}

// Whether what one person says on their own link is between them and the agent
// alone: nobody else is on it, and the package's own link (which anyone holding
// it can read without joining) was never out. That's so only for a link the
// agent made with this person on it from the start, never a quick send, and
// never once anyone has opened the package's own link.
export async function isPrivateTo(shareId: string, personId: string) {
  const [row] = await sql<{ alone: boolean }[]>`
    select (
      not s.quick
      and p.invited_at is not null and p.invited_at <= s.created_at
      and not exists (select 1 from participants o where o.share_id = s.id and o.id <> p.id)
      and not exists (
        select 1 from share_opens o left join participants q on q.id = o.participant_id
        where o.share_id = s.id and (o.participant_id is null or q.token is null))
    ) as alone
    from shares s join participants p on p.share_id = s.id and p.id = ${personId}
    where s.id = ${shareId}`;
  return row?.alone ?? false;
}

// The one person on a link who has been told that what they say there is
// between them and the agent alone (isPrivateTo), while that's still so.
// Anyone added after them would see all of it, so the agent is asked first.
export async function confidantOf(shareId: string) {
  const people = await sql<{ id: string; first_name: string }[]>`
    select id, first_name from participants where share_id = ${shareId} limit 2`;
  if (people.length !== 1) return null;
  return (await isPrivateTo(shareId, people[0].id)) ? people[0] : null;
}

// How the agent came to add someone: a first name they typed, or someone on
// Porchcard who is already their client, who follows them, or whom they found
// by name. Only the person's own follow counts: an agent following someone is
// one click of theirs, so it says nothing about whether that person knows them.
export type AddedFrom = "name" | "client" | "follow" | "search";

// Someone about to be added to a link, as the server worked them out: never
// the browser's say-so.
export type Newcomer = { firstName: string; accountId: string | null; addedFrom: AddedFrom };

type Db = postgres.ISql;

// The people an agent picked, as who they really are: a typed first name, or
// someone's public profile, which must be a finished sign-up with a first
// name, and never the agent. The same person (or the same typed name) twice
// counts once.
export async function resolvePicks(
  tx: Db,
  agentId: string,
  picks: PersonPick[],
): Promise<{ people: Newcomer[] } | { error: string }> {
  const people: Newcomer[] = [];
  for (const pick of picks) {
    if ("name" in pick) {
      const firstName = pick.name.trim().replace(/\s+/g, " ");
      if (!firstName) continue;
      const lower = firstName.toLowerCase();
      if (people.some((p) => !p.accountId && p.firstName.toLowerCase() === lower)) continue;
      people.push({ firstName, accountId: null, addedFrom: "name" });
      continue;
    }
    const [found] = await tx<
      { first_name: string; account_id: string; role: string | null; client: boolean; follow: boolean }[]
    >`
      select btrim(v.first_name) as first_name, v.account_id, a.role,
        exists (
          select 1 from participants p join shares s on s.id = p.share_id
          where p.account_id = v.account_id and s.agent_id = ${agentId}) as client,
        exists (
          select 1 from follows f join visitors me on me.account_id = ${agentId}
          where f.follower_id = v.id and f.followed_id = me.id) as follow
      from visitors v join accounts a on a.id = v.account_id
      where v.id = ${pick.visitorId}`;
    if (found?.account_id === agentId) return { error: "That's you." };
    if (!found || !found.role || !found.first_name) return { error: "We couldn't find them on Porchcard." };
    if (people.some((p) => p.accountId === found.account_id)) continue;
    people.push({
      firstName: found.first_name.slice(0, 40),
      accountId: found.account_id,
      addedFrom: found.client ? "client" : found.follow ? "follow" : "search",
    });
  }
  return { people };
}

// Why these people can't join this link, if they can't: someone with an
// account is on a link only once, and two people who haven't signed up can't
// share a first name there (the agent couldn't tell them apart). Nobody who
// hasn't signed up is ever matched to someone who has.
export async function newcomerProblem(tx: Db, shareId: string, people: Newcomer[]) {
  const accounts = people.flatMap((p) => (p.accountId ? [p.accountId] : []));
  const names = people.flatMap((p) => (p.accountId ? [] : [p.firstName.toLowerCase()]));
  const [taken] = await tx<{ first_name: string }[]>`
    select first_name from participants
    where share_id = ${shareId}
      and ((account_id is not null and account_id in ${tx(accounts.length ? accounts : ["00000000-0000-0000-0000-000000000000"])})
        or (account_id is null and lower(btrim(first_name)) in ${tx(names.length ? names : [""])}))
    limit 1`;
  if (!taken) return null;
  const name = people.find((p) => p.firstName.toLowerCase() === taken.first_name.trim().toLowerCase())?.firstName;
  return `${name ?? taken.first_name.trim()} is already on this link.`;
}

// Someone an agent found on Porchcard but has never met: at most this many a
// day, so links can't be used to reach strangers in bulk. Counted from
// agent_reach, which taking someone off a link (or their leaving) never
// deletes, so removing and re-adding people can't reset it. The same person
// twice in a day counts once.
const STRANGERS_PER_DAY = 20;
export const TOO_MANY_STRANGERS =
  "You've added a lot of people you haven't met on Porchcard today. Try again tomorrow, or type their first name instead.";

export async function tooManyStrangers(tx: Db, agentId: string, people: Newcomer[]) {
  const strangers = [...new Set(people.flatMap((p) => (p.addedFrom === "search" && p.accountId ? [p.accountId] : [])))];
  if (strangers.length === 0) return false;
  const recent = await tx<{ account_id: string }[]>`
    select account_id from agent_reach
    where agent_id = ${agentId} and found_at > now() - interval '24 hours'`;
  const already = new Set(recent.map((row) => row.account_id));
  const adding = strangers.filter((id) => !already.has(id)).length;
  return adding > 0 && recent.length + adding > STRANGERS_PER_DAY;
}

// Adds someone to a package with their own link, after everyone already on
// it. Someone on Porchcard is theirs from the start (`accountId`). Returns
// their place and their link's token.
export async function invitePerson(
  shareId: string,
  { firstName, accountId = null, addedFrom = "name" }: { firstName: string; accountId?: string | null; addedFrom?: AddedFrom },
  tx: Db = sql,
) {
  const token = newShareToken();
  const [person] = await tx<{ id: string }[]>`
    insert into participants (share_id, device_token, first_name, token, invited_at, position, account_id, added_from)
    values (${shareId}, ${`invite:${token}`}, ${firstName}, ${token}, now(),
      (select coalesce(max(position), -1) + 1 from participants where share_id = ${shareId}),
      ${accountId}, ${addedFrom})
    returning id`;
  // Someone the agent had never met counts toward their day's strangers,
  // here rather than on the link, so it outlasts their place on it.
  if (accountId && addedFrom === "search") {
    await tx`
      insert into agent_reach (agent_id, account_id, found_at)
      select agent_id, ${accountId}, now() from shares where id = ${shareId}
      on conflict (agent_id, account_id) do update set found_at = excluded.found_at`;
  }
  return { id: person.id, token };
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
      reply_to_name: string | null;
      reply_to_likes: boolean;
    }[]
  >`
    select c.id, c.listing_key, c.participant_id, p.first_name,
           a.full_name as agent_name, c.tag, c.body, c.created_at, c.shared_publicly, c.media_key, c.spot,
           -- Whose comment, or whose likes, a reply answers.
           coalesce(pp.first_name, pa.full_name, rp.first_name) as reply_to_name,
           c.reply_to_participant is not null as reply_to_likes
    from comments c
    left join participants p on p.id = c.participant_id
    left join accounts a on a.id = c.agent_id
    left join comments pc on pc.id = c.parent_id
    left join participants pp on pp.id = pc.participant_id
    left join accounts pa on pa.id = pc.agent_id
    left join participants rp on rp.id = c.reply_to_participant
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
        replyTo: c.reply_to_name ? { name: c.reply_to_name, likes: c.reply_to_likes } : null,
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

// "a spot outside", "2 spots in the kitchen": the spots with no name among
// someone's marks on a home, one phrase per place.
export const spotsWhere = (listing: Listing, spots: TakeMark[]) =>
  spotsIn(spots.map((spot) => spotPlace(listing, spot.mediaKey)));

// One person's take on a home, for the agent, worded as the link words it,
// except that a spot with no name says where it is ("liked the kitchen and a
// spot outside"): the agent has no photo open beside it.
export function describeTake(listing: Listing, state: ReactionState, likes: TakeMark[], dislikes: TakeMark[]) {
  const words = (marks: TakeMark[]) =>
    marks.map((mark) => {
      const tag = tagNameIn(listing, mark.mediaKey, mark.tag);
      return isPointTag(tag) ? { place: spotPlace(listing, mark.mediaKey) } : tag;
    });
  return describeReaction(state, words(likes), words(dislikes));
}
