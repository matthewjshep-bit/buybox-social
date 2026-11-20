"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getViewAs, requireAgent, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { homesToSend } from "@/lib/send-search";
import { escapeLike } from "@/lib/format";
import { findable, NAME_LONGEST } from "@/lib/people";
import { photoUrl } from "@/lib/person-photo";
import {
  AGENT_NAME_MOST,
  BROKERAGE_MOST,
  contactEmailSchema,
  contactPhoneSchema,
  isBrandColor,
  isDuplicate,
  JPEG_DATA_URL,
  mlsAgentIdProblem,
  PROFILE_PHOTO_MOST_CHARS,
} from "@/lib/profile-fields";
import { ensureAccountVisitor } from "@/lib/public";
import {
  firstNameSchema,
  pickError,
  pickSchema,
  type PersonOption,
  type PersonPick,
} from "@/lib/people-picker";
import { addHomesToLink, letThemKnow, ownShareOf as ownShare, replyToClient, sendHomes } from "@/lib/sending";
import {
  confidantOf,
  ensureAgentProfile,
  invitePerson,
  isShareToken,
  newcomerProblem,
  reserveSendTokenFor,
  resolvePicks,
  TOO_MANY_STRANGERS,
  tooManyStrangers,
  type Newcomer,
} from "@/lib/shares";

export type FormState = { error?: string };

// The fields an agent can get wrong on their profile, and what they typed, so a
// mistake says which one and nothing has to be typed again.
export type ContactField = "contactPhone" | "contactEmail" | "mlsAgentId";
export type ProfileState = FormState & {
  field?: ContactField;
  // Saved, and still on the page (Edit profile).
  saved?: boolean;
  values?: { brokerage: string; contactPhone: string; contactEmail: string; mlsAgentId: string };
};

// (Each part checked as lib/profile-fields.ts says, the same as the admin API.)
const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(AGENT_NAME_MOST),
  brokerage: z.string().trim().max(BROKERAGE_MOST),
  brandColor: z.string().refine(isBrandColor),
  photo: z
    .string()
    .max(PROFILE_PHOTO_MOST_CHARS)
    .refine((value) => value === "" || JPEG_DATA_URL.test(value)),
});

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const agent = await requireAgent();
  const values = {
    brokerage: String(form.get("brokerage") ?? ""),
    contactPhone: String(form.get("contactPhone") ?? "").trim(),
    contactEmail: String(form.get("contactEmail") ?? "").trim().toLowerCase(),
    mlsAgentId: String(form.get("mlsAgentId") ?? "").trim(),
  };
  const parsed = profileSchema.safeParse({
    fullName: form.get("fullName"),
    brokerage: values.brokerage,
    brandColor: form.get("brandColor"),
    photo: form.get("photo") ?? "",
  });
  // (From Edit profile, where their photo has its own place: it isn't sent, and stays as it is.)
  const keepPhoto = !form.has("photo");
  if (!parsed.success) return { error: "Please add your name and choose a color.", values };
  const phone = contactPhoneSchema.safeParse(values.contactPhone);
  if (!phone.success) {
    return { error: "Please enter a phone number with the area code, or leave it empty.", field: "contactPhone", values };
  }
  const email = contactEmailSchema.safeParse(values.contactEmail);
  if (!email.success) {
    return { error: "Please enter a valid email address, or leave it empty.", field: "contactEmail", values };
  }
  // Their MLS ID: empty, or letters, numbers and dashes, and only one whose
  // listings are under their name. Their listings go by it.
  const mlsProblem = await mlsAgentIdProblem(values.mlsAgentId, parsed.data.fullName);
  if (mlsProblem) return { error: mlsProblem, field: "mlsAgentId", values };
  try {
    await sql`
      update accounts set
        full_name = ${parsed.data.fullName},
        brokerage = ${parsed.data.brokerage},
        brand_color = ${parsed.data.brandColor},
        photo_data_url = ${keepPhoto ? sql`photo_data_url` : parsed.data.photo || null},
        contact_phone = ${phone.data},
        contact_email = ${email.data},
        mls_agent_id = ${values.mlsAgentId}
      where id = ${agent.id}`;
  } catch (error) {
    // One profile per MLS ID.
    if (isDuplicate(error)) return { error: "That MLS ID is on another profile.", field: "mlsAgentId", values };
    throw error;
  }
  // Their public page, made now if they had none and named as they just
  // named themselves: an agent with a name can be found (Search, People)
  // from the moment they've said who they are.
  await ensureAccountVisitor({ ...agent, full_name: parsed.data.fullName });
  // The frame around the page is drawn again too, so a new colour reaches the
  // header's logo straight away.
  refresh();
  // Among their other settings, saving stays put and says so; setting up for
  // the first time goes on to their clients.
  if (form.get("stay")) return { saved: true, values };
  redirect("/dashboard");
}

// Whether people on Porchcard may hear from us about what the agent just did.
// Never while an admin is looking at the site as the agent: nobody is emailed
// on their behalf.
const mayNotify = async () => ({ notify: !(await getViewAs()) });

// A new link: its homes, a note, and the people it's for, each with their
// own link (lib/sending.ts, the same as the API sends them).
export async function createShare(input: {
  listingKeys: string[];
  people: PersonPick[];
  note: string;
}): Promise<FormState> {
  // (Anyone signed in can send homes; an agent's go to their clients.)
  const agent = await requireUser();
  const made = await sendHomes(agent, input, await mayNotify());
  if ("error" in made) return { error: made.error };
  // On to the link as their client will see it, to like and say what they
  // think (the last step), and from there to the link, ready to copy.
  redirect(`/s/${made.token}?step=thoughts`);
}

const uuid = z.uuid();

// Homes as an agent types one's address (or MLS number) on the way to
// sending it: a few, the closest first, each with only what a suggestion
// shows and its first photo. Not ones on the link they're adding to.
export async function suggestHomes(query: string, shareId?: string): Promise<Listing[]> {
  // (Anyone signed in can send homes; an agent's go to their clients.)
  const agent = await requireUser();
  if (typeof query !== "string" || query.trim().length < 2) return [];
  let onLink: string[] = [];
  if (shareId) {
    if (!(await ownShare(agent.id, shareId))) return [];
    onLink = (
      await sql<{ listing_key: string }[]>`
        select listing_key from share_listings where share_id = ${shareId} and removed_at is null`
    ).map((row) => row.listing_key);
  }
  const homes = await homesToSend(agent.id, query, { onLink, limit: 6 });
  return homes.map((home) => ({ ...home, Media: [...home.Media].sort((a, b) => a.Order - b.Order).slice(0, 1) }));
}

const searchSchema = z.object({
  // (As long as a name to look for may be, here and in Search.)
  query: z.string().max(NAME_LONGEST),
  shareId: z.uuid().optional(),
  exclude: z.array(z.uuid()).max(25).optional(),
});

// How many of each kind of suggestion the people picker shows, and in all.
const MOST = { client: 5, follow: 3, member: 5, recent: 6, all: 8 };

// "Your client · 2 links".
const clientLine = (links: number) => `Your client · ${links} ${links === 1 ? "link" : "links"}`;

// Who an agent might be sending homes to, for the people picker: first their
// clients (anyone on their links), then people they follow or who follow
// them, then, once two letters are typed, anyone on Porchcard a stranger can
// find (lib/people.ts `findable`, the same people Search finds: never someone
// whose only presence is on another person's link). Matched only on the start
// of a public first name, never an email or a last name, and only what anyone
// could see on someone's page comes back: their first name and photo. Anyone already on the link (`shareId`) or already picked (`exclude`)
// is left out. Nothing typed: their most recent clients.
export async function searchPeople(input: {
  query: string;
  shareId?: string;
  exclude?: string[];
}): Promise<PersonOption[]> {
  // (Anyone signed in can send homes; an agent's go to their clients.)
  const agent = await requireUser();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];
  const query = parsed.data.query.trim().replace(/\s+/g, " ");
  // An email finds nobody, so typing one can't tell whether they're here.
  if (query.includes("@")) return [];
  const { shareId } = parsed.data;
  if (shareId && !(await ownShare(agent.id, shareId))) return [];
  const exclude = new Set(parsed.data.exclude ?? []);
  const prefix = `${escapeLike(query.toLowerCase())}%`;
  // People already on the link: by account, and by name for those who haven't signed up.
  const onLink = sql`select account_id from participants where share_id = ${shareId ?? null}::uuid and account_id is not null`;
  const namesOnLink = sql`
    select lower(btrim(first_name)) from participants where share_id = ${shareId ?? null}::uuid and account_id is null`;

  type Row = { visitor_id: string | null; name: string; photo_v: string | null; role: string | null };
  const [clients, follows, members] = await Promise.all([
    sql<(Row & { links: number })[]>`
      select v.id as visitor_id, coalesce(nullif(btrim(v.first_name), ''), c.name) as name,
        left(md5(a.photo_data_url), 10) as photo_v, a.role, c.links
      from (
        select coalesce(p.account_id::text, 'n:' || lower(btrim(p.first_name))) as who,
          (array_agg(p.account_id order by s.created_at desc))[1] as account_id,
          (array_agg(btrim(p.first_name) order by s.created_at desc))[1] as name,
          count(distinct s.id)::int as links,
          max(s.created_at) as last_sent
        from participants p join shares s on s.id = p.share_id
        where s.agent_id = ${agent.id}
          and (p.account_id is null or p.account_id <> ${agent.id})
          and btrim(p.first_name) <> ''
          and lower(btrim(p.first_name)) like ${prefix}
          and (p.account_id is null or p.account_id not in (${onLink}))
          and (p.account_id is not null or lower(btrim(p.first_name)) not in (${namesOnLink}))
        group by 1
      ) c
      left join accounts a on a.id = c.account_id
      left join visitors v on v.account_id = c.account_id
      order by c.last_sent desc
      limit 12`,
    query
      ? sql<(Row & { i_follow: boolean; follows_me: boolean })[]>`
          select v.id as visitor_id, btrim(v.first_name) as name, left(md5(a.photo_data_url), 10) as photo_v, a.role,
            bool_or(f.follower_id = me.id) as i_follow, bool_or(f.followed_id = me.id) as follows_me
          from visitors me
          join follows f on f.follower_id = me.id or f.followed_id = me.id
          join visitors v on v.id = case when f.follower_id = me.id then f.followed_id else f.follower_id end
          join accounts a on a.id = v.account_id
          where me.account_id = ${agent.id}
            and a.role is not null and a.id <> ${agent.id}
            and btrim(v.first_name) <> '' and lower(v.first_name) like ${prefix}
            and a.id not in (${onLink})
          group by v.id, a.id
          order by max(f.created_at) desc
          limit 12`
      : [],
    query.length >= 2
      ? sql<Row[]>`
          select v.id as visitor_id, btrim(v.first_name) as name, left(md5(a.photo_data_url), 10) as photo_v, a.role
          from visitors v join accounts a on a.id = v.account_id
          where v.account_id is not null and lower(v.first_name) like ${prefix}
            and ${findable()} and a.id <> ${agent.id}
            and a.id not in (${onLink})
          order by lower(btrim(v.first_name)) = ${query.toLowerCase()} desc, v.created_at desc
          limit 12`
      : [],
  ]);

  const seen = new Set<string>();
  const options: PersonOption[] = [];
  const add = (option: PersonOption, room: number) => {
    if (seen.has(option.key) || options.filter((o) => o.group === option.group).length >= room) return;
    seen.add(option.key);
    options.push(option);
  };
  const onPorchcard = (row: Row) => Boolean(row.visitor_id && row.role && !exclude.has(row.visitor_id));
  // Someone already picked is no suggestion, in any group.
  for (const id of exclude) seen.add(`v:${id}`);
  for (const row of clients) {
    const context = clientLine(row.links);
    const room = query ? MOST.client : MOST.recent;
    if (row.visitor_id && row.role) {
      if (onPorchcard(row)) {
        add(
          {
            key: `v:${row.visitor_id}`,
            pick: { visitorId: row.visitor_id },
            name: row.name,
            photo: photoUrl(row.visitor_id, row.photo_v),
            group: "client",
            context,
            agent: row.role === "agent",
          },
          room,
        );
      }
      continue;
    }
    // A past client who never signed up: only their name, to type again.
    add(
      { key: `n:${row.name.toLowerCase()}`, pick: { name: row.name }, name: row.name, photo: null, group: "client", context, agent: false },
      room,
    );
  }
  for (const row of follows) {
    if (!onPorchcard(row)) continue;
    add(
      {
        key: `v:${row.visitor_id}`,
        pick: { visitorId: row.visitor_id! },
        name: row.name,
        photo: photoUrl(row.visitor_id!, row.photo_v),
        group: "follow",
        context: row.i_follow && row.follows_me ? "You follow each other" : row.follows_me ? "Follows you" : "You follow",
        agent: row.role === "agent",
      },
      MOST.follow,
    );
  }
  for (const row of members) {
    if (!onPorchcard(row)) continue;
    add(
      {
        key: `v:${row.visitor_id}`,
        pick: { visitorId: row.visitor_id! },
        name: row.name,
        photo: photoUrl(row.visitor_id!, row.photo_v),
        group: "member",
        context: row.role === "agent" ? "Agent on Porchcard" : "On Porchcard",
        agent: row.role === "agent",
      },
      MOST.member,
    );
  }
  return options.slice(0, MOST.all);
}

// Asking before someone joins a link whose one person was told only they and
// the agent see what they say: who that is, and who would be added.
export type AddPersonState = FormState & { confirm?: { confidant: string; newcomer: string } };

// The person a form names: someone picked from Porchcard (`visitorId`), or a
// first name typed in.
const formPick = (form: FormData): unknown => {
  const visitorId = form.get("visitorId");
  return typeof visitorId === "string" && visitorId ? { visitorId } : { name: String(form.get("firstName") ?? "") };
};

// Adds someone to a package, with their own link. If the one person on it
// was promised that only they and the agent see their words, the newcomer
// would see them all, so it's done only once the agent has said so
// (`confirm`), and never for a form that didn't ask. Someone on Porchcard is
// theirs from the start, and hears about it from us.
export async function addPerson(shareId: string, _: AddPersonState, form: FormData): Promise<AddPersonState> {
  const agent = await requireAgent();
  const raw = formPick(form);
  const pick = pickSchema.safeParse(raw);
  if (!pick.success) return { error: pickError(raw) };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that link." };
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from participants where share_id = ${shareId}`;
  if (count >= 25) return { error: "That's as many people as one link can have." };
  const resolved = await resolvePicks(sql, agent.id, [pick.data]);
  if ("error" in resolved) return { error: resolved.error };
  const [person] = resolved.people;
  if (!person) return { error: "Please enter their first name." };
  const problem = await newcomerProblem(sql, shareId, [person]);
  if (problem) return { error: problem };
  if (await tooManyStrangers(sql, agent.id, [person])) return { error: TOO_MANY_STRANGERS };
  const confidant = await confidantOf(shareId);
  if (confidant && form.get("confirm") !== "yes") {
    return { confirm: { confidant: confidant.first_name, newcomer: person.firstName } };
  }
  let added: { id: string };
  try {
    added = await invitePerson(shareId, person);
  } catch (error) {
    if (isDuplicate(error)) return { error: `${person.firstName} is already on this link.` };
    throw error;
  }
  if (person.accountId) await letThemKnow(agent.id, [added.id], await mayNotify());
  refresh();
  return {};
}

// Fixes the first name of someone on a link who hasn't signed up (a typo,
// say); the link's name follows. Someone who has signed up goes by their own.
export async function renamePerson(shareId: string, personId: string, _: FormState, form: FormData): Promise<FormState> {
  const agent = await requireAgent();
  const typed = String(form.get("firstName") ?? "");
  const name = firstNameSchema.safeParse(typed);
  if (!name.success) return { error: pickError({ name: typed }) };
  if (!uuid.safeParse(personId).success || !(await ownShare(agent.id, shareId))) {
    return { error: "We couldn't find them on this link." };
  }
  const [person] = await sql<{ bound: boolean }[]>`
    select account_id is not null as bound from participants where id = ${personId} and share_id = ${shareId}`;
  if (!person) return { error: "They're not on this link anymore." };
  if (person.bound) return { error: "They've signed up, so their name is their own." };
  const [same] = await sql`
    select 1 from participants
    where share_id = ${shareId} and id <> ${personId} and account_id is null
      and lower(btrim(first_name)) = ${name.data.toLowerCase()}`;
  if (same) return { error: `${name.data} is already on this link.` };
  const renamed = await sql`
    update participants set first_name = ${name.data}
    where id = ${personId} and share_id = ${shareId} and account_id is null
    returning id`;
  if (renamed.length === 0) return { error: "They've signed up, so their name is their own." };
  refresh();
  return {};
}

// Takes someone off a package: their own link stops working, and what they
// liked, passed on and said there goes with them. Never the last one on it.
// (The link's name follows, in the database.)
export async function removePerson(shareId: string, personId: string): Promise<FormState> {
  const agent = await requireAgent();
  if (!uuid.safeParse(personId).success || !(await ownShare(agent.id, shareId))) {
    return { error: "We couldn't find them on this link." };
  }
  const people = await sql<{ id: string }[]>`select id from participants where share_id = ${shareId}`;
  if (!people.some((person) => person.id === personId)) return { error: "They're not on this link anymore." };
  if (people.length === 1) return { error: "They're the only one on this link." };
  // (Never the last one, even with two taken off at once.)
  const gone = await sql`
    delete from participants
    where id = ${personId} and share_id = ${shareId}
      and (select count(*) from participants where share_id = ${shareId}) > 1
    returning id`;
  if (gone.length === 0) return { error: "They're the only one on this link." };
  refresh();
  return {};
}

// A suggested home, added straight to the package, from the link's own page:
// the agent stays there. (Nobody is emailed about it, as it's always been.)
export async function addSuggestedHome(shareId: string, listingKey: string): Promise<void> {
  const agent = await requireAgent();
  const result = await addHomesToLink(agent.id, shareId, [listingKey], { notify: false });
  if ("error" in result) return;
  redirect(`/dashboard/shares/${shareId}`);
}

const welcomeSchema = z.object({
  headline: z.string().trim().max(90),
  note: z.string().trim().max(500),
});

// What the link's welcome screen says: the headline (empty for the standard
// line) and the agent's note under it. Clients see it the next time they open it.
export async function updateWelcome(shareId: string, _: FormState, form: FormData): Promise<FormState> {
  const agent = await requireAgent();
  const parsed = welcomeSchema.safeParse({ headline: form.get("headline") ?? "", note: form.get("note") ?? "" });
  if (!parsed.success) return { error: "Headlines can be up to 90 characters, and notes up to 500." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that link." };
  await sql`update shares set headline = ${parsed.data.headline}, note = ${parsed.data.note} where id = ${shareId}`;
  refresh();
  return {};
}

// Takes a home off the client's link, or puts it back. Nothing the client said
// about it is lost: it still shows to the agent and feeds the client's profile.
export async function setHomeRemoved(shareId: string, listingKey: string, removed: boolean): Promise<void> {
  const agent = await requireAgent();
  if (!(await ownShare(agent.id, shareId))) return;
  await sql`
    update share_listings set removed_at = ${removed ? sql`now()` : null}
    where share_id = ${shareId} and listing_key = ${listingKey}`;
  refresh();
}

// "Send more homes": more homes onto a link, and then the link, ready to
// copy or send again, as when it was first made. Whoever on it is on
// Porchcard hears about the new homes from us (lib/sending.ts), after the
// page has answered.
export async function addHomesToShare(shareId: string, listingKeys: string[]): Promise<FormState> {
  const agent = await requireAgent();
  const result = await addHomesToLink(agent.id, shareId, listingKeys, await mayNotify());
  if ("error" in result) return { error: result.error };
  redirect(`/dashboard/shares/${shareId}/sent`);
}

// The agent's word in a home's conversation on their link (lib/sending.ts).
// `to`: the client it answers, so on a link with several people it sits under
// that person's line.
export async function replyAsAgent(
  shareId: string,
  listingKey: string,
  body: string,
  to: string | null = null,
): Promise<FormState> {
  const agent = await requireAgent();
  const result = await replyToClient(agent.id, shareId, listingKey, body, to);
  if ("error" in result) return { error: result.error };
  refresh();
  return {};
}

// One tap on Send, from any home: the phone's share sheet opens on a link the
// server made before the tap, and then the agent can say who it's for.

export type SendToken = { token: string } | { error: "profile" | "signed-out" };

// A link name for this page's next Send. Each page gets its own, so two open
// tabs never hand out the same link. Pages ask in the background, so someone
// who has signed out meanwhile is told so here, not sent to sign in.
export async function reserveSendToken(): Promise<SendToken> {
  const agent = await getCurrentUser();
  if (agent?.role !== "agent") return { error: "signed-out" };
  // Clients should know who it's from.
  if (!agent.full_name) return { error: "profile" };
  return { token: await reserveSendTokenFor(agent.id) };
}

// A page closed, or was given a newer link, so the name it held goes: it no
// longer counts towards the agent's 20, and can never become a link.
export async function dropSendToken(token: string): Promise<void> {
  const agent = await getCurrentUser();
  if (agent?.role !== "agent" || typeof token !== "string" || !isShareToken(token)) return;
  await sql`delete from share_token_pool where token = ${token} and agent_id = ${agent.id}`;
}

export type ClaimResult = { shareId: string; nextToken: string } | { error: string };

const claimSchema = z.object({
  token: z.string().refine(isShareToken),
  listingKey: z.string().min(1).max(100),
});

// Send was tapped: the link it just handed to the share sheet becomes a link
// for that one home, a new one each time, so one client's link is never
// another's. Trying again with the same link and home gives the same link.
export async function claimQuickShare(input: { token: string; listingKey: string }): Promise<ClaimResult> {
  const agent = await requireAgent();
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success || !agent.full_name) return { error: "That link didn't save. Tap Send again." };
  const { token, listingKey } = parsed.data;

  const claimed = await sql.begin(async (tx) => {
    // Only homes still for sale, as on any new link.
    const [home] = await tx`
      select 1 from listings where listing_key = ${listingKey} and standard_status = 'Active'
        and (owner_account_id is null or owner_account_id = ${agent.id}
             or coalesce((data->>'Hidden')::boolean, false) = false)`;
    if (!home) return null;
    // Only a name this agent was given, in the last day, and only once.
    const [fresh] = await tx`
      delete from share_token_pool
      where token = ${token} and agent_id = ${agent.id} and created_at > now() - interval '24 hours'
      returning token`;
    if (!fresh) return null;
    const [share] = await tx<{ id: string }[]>`
      insert into shares (token, agent_id, note, quick)
      values (${token}, ${agent.id}, '', true)
      returning id`;
    await tx`
      insert into share_listings (share_id, listing_key, position)
      values (${share.id}, ${listingKey}, 0)`;
    return share.id;
  });
  const [made] = claimed
    ? [{ id: claimed }]
    : await sql<{ id: string }[]>`
        select s.id from shares s join share_listings sl on sl.share_id = s.id
        where s.token = ${token} and s.agent_id = ${agent.id} and s.quick and sl.listing_key = ${listingKey}`;
  if (!made) return { error: "That link didn't save. Tap Send again." };
  return { shareId: made.id, nextToken: await reserveSendTokenFor(agent.id) };
}

// Nobody has opened the link (`s`), joined it or said anything on it yet.
// (The agent's own notes on it don't count: theirs to take back with it. Nor
// do the people they named on it, until one of them signs in there.)
const unopened = () => sql`
  not exists (select 1 from share_opens o where o.share_id = s.id)
  and not exists (
    select 1 from participants p
    where p.share_id = s.id and (p.invited_at is null or p.linked_at is not null))
  and not exists (select 1 from comments c where c.share_id = s.id and c.participant_id is not null)`;

export type ReleaseResult = { released: boolean; opened?: boolean };

// Takes back a link from Send: the share sheet was closed without sending, or
// the agent changed their mind straight away. Only while no one has used it.
export async function releaseQuickShare(shareId: string): Promise<ReleaseResult> {
  const agent = await requireAgent();
  if (!uuid.safeParse(shareId).success) return { released: false };
  const deleted = await sql`
    delete from shares s
    where s.id = ${shareId} and s.agent_id = ${agent.id} and s.quick
      and s.created_at > now() - interval '1 hour' and ${unopened()}
    returning s.id`;
  if (deleted.length) return { released: true };
  const [kept] = await sql<{ opened: boolean }[]>`
    select not (${unopened()}) as opened from shares s
    where s.id = ${shareId} and s.agent_id = ${agent.id}`;
  return { released: false, opened: kept?.opened ?? false };
}

// Deletes a link sent by mistake, for good, from the Links page. Only the
// agent's own, only with nobody named on it, and only while no one has opened
// it, joined it or said anything on it: once a client has used a link it stays.
export async function deleteShare(shareId: string): Promise<FormState> {
  const agent = await requireAgent();
  if (!uuid.safeParse(shareId).success) return { error: "We couldn't find that link." };
  const deleted = await sql`
    delete from shares s
    where s.id = ${shareId} and s.agent_id = ${agent.id} and ${unopened()}
      and not exists (select 1 from participants p where p.share_id = s.id)
    returning s.id`;
  if (deleted.length === 0) {
    const [kept] = await sql<{ id: string }[]>`
      select id from shares where id = ${shareId} and agent_id = ${agent.id}`;
    // (Gone already, from another tab: the list catches up.)
    if (kept) return { error: "This link has been opened or named, so it stays." };
  }
  refresh();
  return {};
}

const quickNameSchema = z.object({
  people: z.array(pickSchema).max(6),
  note: z.string().trim().max(500),
});

// Who a link from Send was for, and a note: each person is added to it with a
// link of their own, and it's named for them, so the link greets them by name
// the next time it loads, with no new link to send. Nobody is emailed: the
// agent has just sent it themselves. Returns the names given, including anyone
// who had already joined under one of them.
export async function nameQuickShare(
  shareId: string,
  input: { people: PersonPick[]; note: string },
): Promise<FormState & { names?: string[] }> {
  const agent = await requireAgent();
  const parsed = quickNameSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "people"
      ? { error: pickError(input?.people) }
      : { error: "Notes can be up to 500 characters." };
  }
  if (!uuid.safeParse(shareId).success) return { error: "We couldn't find that link." };
  const [share] = await sql`select 1 from shares where id = ${shareId} and agent_id = ${agent.id} and quick`;
  if (!share) return { error: "We couldn't find that link." };
  const resolved = await resolvePicks(sql, agent.id, parsed.data.people);
  if ("error" in resolved) return { error: resolved.error };
  // Someone may already have joined through the link the agent texted before
  // naming it (joining means signing up, so newcomerProblem never sees them).
  // A typed first name that matches theirs is them: adding it again would put a
  // second, empty "Toby" on the link beside the real one.
  const joined = new Set(
    (
      await sql<{ name: string }[]>`
        select lower(btrim(first_name)) as name from participants
        where share_id = ${shareId} and invited_at is null and account_id is not null`
    ).map((row) => row.name),
  );
  const people: Newcomer[] = resolved.people.filter(
    (person) => person.accountId || !joined.has(person.firstName.toLowerCase()),
  );
  const problem = people.length ? await newcomerProblem(sql, shareId, people) : null;
  if (problem) return { error: problem };
  if (await tooManyStrangers(sql, agent.id, people)) return { error: TOO_MANY_STRANGERS };
  try {
    await sql.begin(async (tx) => {
      await tx`update shares set note = ${parsed.data.note} where id = ${shareId}`;
      for (const person of people) await invitePerson(shareId, person, tx);
    });
  } catch (error) {
    if (isDuplicate(error)) return { error: "One of them is already on this link." };
    throw error;
  }
  if (people.some((person) => person.accountId)) await ensureAgentProfile(agent.id);
  return { names: resolved.people.map((person) => person.firstName) };
}

export type RecentShare = {
  id: string;
  clientName: string;
  homes: number;
  // The first home on their link, so two links can be told apart.
  firstAddress: string | null;
  sentAt: string;
};

// The clients a home from Send might really be for: the latest few, one per
// name. Every Send makes its own link, so one client can have several; the
// newest is the one they're most likely to have open.
export async function listRecentShares(): Promise<RecentShare[]> {
  const agent = await requireAgent();
  const rows = await sql<{ id: string; client_name: string; homes: number; first_address: string | null; created_at: Date }[]>`
    select * from (
      select distinct on (lower(s.client_name)) s.id, s.client_name, s.created_at,
        (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
        (select l.data->>'UnparsedAddress'
           from share_listings sl join listings l on l.listing_key = sl.listing_key
           where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as first_address
      from shares s
      where s.agent_id = ${agent.id} and s.client_name <> ''
      order by lower(s.client_name), s.created_at desc
    ) newest
    order by created_at desc
    limit 6`;
  return rows.map((row) => ({
    id: row.id,
    clientName: row.client_name,
    homes: row.homes,
    firstAddress: row.first_address,
    sentAt: row.created_at.toISOString(),
  }));
}

// The newest link this agent sent someone they just picked again (by their
// account, or by name for someone who never signed up), other than `except`:
// a home from Send might belong on it instead.
export async function newestLinkFor(pick: PersonPick, except?: string): Promise<RecentShare | null> {
  const agent = await requireAgent();
  const parsed = pickSchema.safeParse(pick);
  if (!parsed.success) return null;
  const other = except && uuid.safeParse(except).success ? except : null;
  const who =
    "visitorId" in parsed.data
      ? sql`p.account_id = (select account_id from visitors where id = ${parsed.data.visitorId})`
      : sql`p.account_id is null and lower(btrim(p.first_name)) = ${parsed.data.name.toLowerCase()}`;
  const [row] = await sql<{ id: string; client_name: string; homes: number; first_address: string | null; created_at: Date }[]>`
    select s.id, s.client_name, s.created_at,
      (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
      (select l.data->>'UnparsedAddress'
         from share_listings sl join listings l on l.listing_key = sl.listing_key
         where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as first_address
    from shares s join participants p on p.share_id = s.id
    where s.agent_id = ${agent.id} and (${other}::uuid is null or s.id <> ${other}::uuid) and ${who}
    order by s.created_at desc
    limit 1`;
  if (!row) return null;
  return {
    id: row.id,
    clientName: row.client_name,
    homes: row.homes,
    firstAddress: row.first_address,
    sentAt: row.created_at.toISOString(),
  };
}

export type MoveResult = { clientName: string; closed: boolean } | { error: string };

// A home from Send was meant for a client who already has a link: it goes on
// theirs, as if added from the dashboard, and the new link stops working if no
// one has used it yet.
export async function moveQuickShare(shareId: string, targetShareId: string): Promise<MoveResult> {
  const agent = await requireAgent();
  if (!uuid.safeParse(shareId).success || shareId === targetShareId) return { error: "We couldn't find that link." };
  const [home] = await sql<{ listing_key: string; active: boolean }[]>`
    select sl.listing_key,
      l.standard_status = 'Active'
        and (l.owner_account_id is null or l.owner_account_id = ${agent.id}
             or coalesce((l.data->>'Hidden')::boolean, false) = false) as active
    from shares s
    join share_listings sl on sl.share_id = s.id
    join listings l on l.listing_key = sl.listing_key
    where s.id = ${shareId} and s.agent_id = ${agent.id} and s.quick
    order by sl.position limit 1`;
  if (!home) return { error: "We couldn't find that link." };
  if (!(await ownShare(agent.id, targetShareId))) return { error: "We couldn't find that client." };
  if (!home.active) return { error: "That home is no longer available." };

  const closed = await sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(position), -1) + 1 as next from share_listings where share_id = ${targetShareId}`;
    // A home sent before and removed comes back, with its history intact.
    await tx`
      insert into share_listings (share_id, listing_key, position)
      values (${targetShareId}, ${home.listing_key}, ${next})
      on conflict (share_id, listing_key) do update set removed_at = null`;
    const deleted = await tx`
      delete from shares s
      where s.id = ${shareId} and s.agent_id = ${agent.id} and s.quick and ${unopened()}
      returning s.id`;
    return deleted.length > 0;
  });
  const [target] = await sql<{ client_name: string }[]>`
    select client_name from shares where id = ${targetShareId}`;
  return { clientName: target?.client_name ?? "", closed };
}

// A moment to the microsecond, as the database keeps it and the link's page reads it.
const EXACT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

// The agent has looked at a link's page, with everything up to `latest` (the
// newest thing a client did that the page showed), so the dashboard stops
// marking it as new. Something newer still counts as new.
export async function markShareSeen(shareId: string, latest: string): Promise<void> {
  const agent = await requireAgent();
  if (!uuid.safeParse(shareId).success || typeof latest !== "string" || !EXACT_TIME.test(latest)) return;
  await sql`
    update shares set agent_seen_at = greatest(agent_seen_at, least(${latest}::timestamptz, now()))
    where id = ${shareId} and agent_id = ${agent.id}`;
}

export async function removeComment(commentId: string): Promise<void> {
  const agent = await requireAgent();
  if (!uuid.safeParse(commentId).success) return;
  await sql`
    delete from comments c using shares s
    where c.id = ${commentId} and s.id = c.share_id and s.agent_id = ${agent.id}`;
  refresh();
}
