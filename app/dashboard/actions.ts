"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, requireAgent } from "@/lib/auth";
import { isContactPhone, phoneDigits } from "@/lib/contact";
import { sql } from "@/lib/db";
import { BRAND_COLORS } from "@/lib/format";
import { confidantOf, invitePerson, isShareToken, newShareToken, reserveSendTokenFor } from "@/lib/shares";

export type FormState = { error?: string };

// The fields an agent can get wrong on their profile, and what they typed, so a
// mistake says which one and nothing has to be typed again.
export type ContactField = "contactPhone" | "contactEmail";
export type ProfileState = FormState & {
  field?: ContactField;
  values?: { brokerage: string; contactPhone: string; contactEmail: string };
};

const PHOTO_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  brokerage: z.string().trim().max(80),
  brandColor: z.string().refine((value) => BRAND_COLORS.some((c) => c.value === value)),
  photo: z
    .string()
    .max(200_000)
    .refine((value) => value === "" || PHOTO_PATTERN.test(value)),
});

// A phone for clients: empty, or a real number with its area code. Kept as
// digits only, so the text and call links on a link are built from nothing else.
const contactPhoneSchema = z
  .string()
  .max(30)
  .regex(/^[\d\s().+-]*$/)
  .transform(phoneDigits)
  .refine((digits) => digits === "" || isContactPhone(digits));

const contactEmailSchema = z.union([z.literal(""), z.email().max(254)]);

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const agent = await requireAgent();
  const values = {
    brokerage: String(form.get("brokerage") ?? ""),
    contactPhone: String(form.get("contactPhone") ?? "").trim(),
    contactEmail: String(form.get("contactEmail") ?? "").trim().toLowerCase(),
  };
  const parsed = profileSchema.safeParse({
    fullName: form.get("fullName"),
    brokerage: values.brokerage,
    brandColor: form.get("brandColor"),
    photo: form.get("photo") ?? "",
  });
  if (!parsed.success) return { error: "Please add your name and choose a color.", values };
  const phone = contactPhoneSchema.safeParse(values.contactPhone);
  if (!phone.success) {
    return { error: "Please enter a phone number with the area code, or leave it empty.", field: "contactPhone", values };
  }
  const email = contactEmailSchema.safeParse(values.contactEmail);
  if (!email.success) {
    return { error: "Please enter a valid email address, or leave it empty.", field: "contactEmail", values };
  }
  await sql`
    update accounts set
      full_name = ${parsed.data.fullName},
      brokerage = ${parsed.data.brokerage},
      brand_color = ${parsed.data.brandColor},
      photo_data_url = ${parsed.data.photo || null},
      contact_phone = ${phone.data},
      contact_email = ${email.data}
    where id = ${agent.id}`;
  // The frame around the page is drawn again too, so a new colour reaches the
  // header's logo straight away.
  refresh();
  redirect("/dashboard");
}

const shareSchema = z.object({
  listingKeys: z.array(z.string().max(100)).min(1).max(3),
  people: z.array(z.string().trim().max(40)).max(6),
  note: z.string().trim().max(500),
});

// "Jenny", "Jenny & Mike", "Jenny, Mike & Sam".
const namesTogether = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;

export async function createShare(input: {
  listingKeys: string[];
  people: string[];
  note: string;
}): Promise<FormState> {
  const agent = await requireAgent();
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick between 1 and 3 homes." };
  const keys = [...new Set(parsed.data.listingKeys)];

  // Only homes still for sale, the same as adding homes to a link later.
  const found = await sql`
    select listing_key from listings
    where listing_key in ${sql(keys)} and standard_status = 'Active'`;
  if (found.length !== keys.length) return { error: "One of those homes is no longer available." };

  const people = [...new Set(parsed.data.people.filter(Boolean))];

  const shareId = await sql.begin(async (tx) => {
    const [share] = await tx<{ id: string }[]>`
      insert into shares (token, agent_id, client_name, note)
      values (${newShareToken()}, ${agent.id}, ${namesTogether(people).slice(0, 60)}, ${parsed.data.note})
      returning id`;
    // Everyone gets their own link, so what each of them likes is theirs.
    for (const name of people) {
      const token = newShareToken();
      await tx`
        insert into participants (share_id, device_token, first_name, token, invited_at)
        values (${share.id}, ${`invite:${token}`}, ${name}, ${token}, now())`;
    }
    for (const [position, key] of keys.entries()) {
      await tx`
        insert into share_listings (share_id, listing_key, position)
        values (${share.id}, ${key}, ${position})`;
    }
    return share.id;
  });
  redirect(`/dashboard/shares/${shareId}`);
}

const uuid = z.uuid();

// The signed-in agent's own share, or null.
async function ownShare(agentId: string, shareId: string) {
  if (!uuid.safeParse(shareId).success) return null;
  const [share] = await sql<{ id: string }[]>`
    select id from shares where id = ${shareId} and agent_id = ${agentId}`;
  return share ?? null;
}

// Asking before someone joins a link whose one person was told only they and
// the agent see what they say: who that is, and who would be added.
export type AddPersonState = FormState & { confirm?: { confidant: string; newcomer: string } };

// Adds someone to a package, with their own link. If the one person on it
// was promised that only they and the agent see their words, the newcomer
// would see them all, so it's done only once the agent has said so
// (`confirm`), and never for a form that didn't ask.
export async function addPerson(shareId: string, _: AddPersonState, form: FormData): Promise<AddPersonState> {
  const agent = await requireAgent();
  const name = z.string().trim().min(1).max(40).safeParse(form.get("firstName"));
  if (!name.success) return { error: "Please enter their first name." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that link." };
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from participants where share_id = ${shareId}`;
  if (count >= 25) return { error: "That's as many people as one link can have." };
  const confidant = await confidantOf(shareId);
  if (confidant && form.get("confirm") !== "yes") {
    return { confirm: { confidant: confidant.first_name, newcomer: name.data } };
  }
  await invitePerson(shareId, name.data);
  refresh();
  return {};
}

// A suggested home, added straight to the package.
export async function addSuggestedHome(shareId: string, listingKey: string): Promise<void> {
  await addHomesToShare(shareId, [listingKey]);
}

export async function renameClient(shareId: string, _: FormState, form: FormData): Promise<FormState> {
  const agent = await requireAgent();
  const name = z.string().trim().min(1).max(60).safeParse(form.get("clientName"));
  if (!name.success) return { error: "Please enter a name, up to 60 characters." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that client." };
  await sql`update shares set client_name = ${name.data} where id = ${shareId}`;
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

export async function addHomesToShare(shareId: string, listingKeys: string[]): Promise<FormState> {
  const agent = await requireAgent();
  const keys = z.array(z.string().max(100)).min(1).max(3).safeParse(listingKeys);
  if (!keys.success) return { error: "Pick between 1 and 3 homes." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that client." };
  const unique = [...new Set(keys.data)];
  const found = await sql`
    select listing_key from listings
    where listing_key in ${sql(unique)} and standard_status = 'Active'`;
  if (found.length !== unique.length) return { error: "One of those homes is no longer available." };
  await sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(position), -1) + 1 as next from share_listings where share_id = ${shareId}`;
    for (const [offset, key] of unique.entries()) {
      // A home sent before and removed comes back, with its history intact.
      await tx`
        insert into share_listings (share_id, listing_key, position)
        values (${shareId}, ${key}, ${next + offset})
        on conflict (share_id, listing_key) do update set removed_at = null`;
    }
  });
  redirect(`/dashboard/shares/${shareId}`);
}

export async function replyAsAgent(
  shareId: string,
  listingKey: string,
  body: string,
): Promise<FormState> {
  const agent = await requireAgent();
  const text = z.string().trim().min(1).max(1000).safeParse(body);
  if (!text.success || !uuid.safeParse(shareId).success) {
    return { error: "Replies can be up to 1,000 characters." };
  }
  // The join limits this to the signed-in agent's own shares.
  const inserted = await sql`
    insert into comments (share_id, listing_key, agent_id, body)
    select sl.share_id, sl.listing_key, ${agent.id}, ${text.data}
    from share_listings sl join shares s on s.id = sl.share_id
    where sl.share_id = ${shareId} and sl.listing_key = ${listingKey} and s.agent_id = ${agent.id}
    returning id`;
  if (inserted.length === 0) return { error: "We couldn't find that conversation." };
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
      select 1 from listings where listing_key = ${listingKey} and standard_status = 'Active'`;
    if (!home) return null;
    // Only a name this agent was given, in the last day, and only once.
    const [fresh] = await tx`
      delete from share_token_pool
      where token = ${token} and agent_id = ${agent.id} and created_at > now() - interval '24 hours'
      returning token`;
    if (!fresh) return null;
    const [share] = await tx<{ id: string }[]>`
      insert into shares (token, agent_id, client_name, note, quick)
      values (${token}, ${agent.id}, '', '', true)
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
const unopened = () => sql`
  not exists (select 1 from share_opens o where o.share_id = s.id)
  and not exists (select 1 from participants p where p.share_id = s.id)
  and not exists (select 1 from comments c where c.share_id = s.id)`;

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

const quickNameSchema = z.object({
  clientName: z.string().trim().max(40),
  note: z.string().trim().max(500),
});

// Who a link from Send was for, and a note: the link greets them by name the
// next time it loads, with no new link to send.
export async function nameQuickShare(shareId: string, input: { clientName: string; note: string }): Promise<FormState> {
  const agent = await requireAgent();
  const parsed = quickNameSchema.safeParse(input);
  if (!parsed.success) return { error: "Names can be up to 40 characters, and notes up to 500." };
  if (!uuid.safeParse(shareId).success) return { error: "We couldn't find that link." };
  const updated = await sql`
    update shares set client_name = ${parsed.data.clientName}, note = ${parsed.data.note}
    where id = ${shareId} and agent_id = ${agent.id} and quick
    returning id`;
  if (updated.length === 0) return { error: "We couldn't find that link." };
  return {};
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

export type MoveResult = { clientName: string; closed: boolean } | { error: string };

// A home from Send was meant for a client who already has a link: it goes on
// theirs, as if added from the dashboard, and the new link stops working if no
// one has used it yet.
export async function moveQuickShare(shareId: string, targetShareId: string): Promise<MoveResult> {
  const agent = await requireAgent();
  if (!uuid.safeParse(shareId).success || shareId === targetShareId) return { error: "We couldn't find that link." };
  const [home] = await sql<{ listing_key: string; active: boolean }[]>`
    select sl.listing_key, l.standard_status = 'Active' as active
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
