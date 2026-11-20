import { after } from "next/server";
import { z } from "zod";
import type { Account } from "./auth";
import { sql } from "./db";
import { importMissing, runImportsAndContinue } from "./listings/imports";
import { notifyClientAdded, notifyClientMoreHomes } from "./notify";
import { pickError, pickSchema, type PersonPick } from "./people-picker";
import {
  ensureAgentProfile,
  invitePerson,
  newShareToken,
  resolvePicks,
  TOO_MANY_STRANGERS,
  tooManyStrangers,
} from "./shares";

// Sending homes to clients, adding homes to a link already sent, and the
// agent's reply in a home's conversation: the work itself, shared by the
// dashboard (app/dashboard/actions.ts) and the API (app/api/v1), so both do
// exactly the same thing. Each takes the agent it acts for and only ever
// reaches that agent's own links. Nothing here knows who's signed in, or
// redirects or refreshes a page: whoever calls it does that.
//
// `notify`: whether people on Porchcard hear from us by email about it, as
// they do when an agent sends from the dashboard. Off while an admin is
// looking at the site as the agent (the caller works that out): nobody is
// emailed on their behalf.
export type SendOptions = { notify?: boolean };

const uuid = z.uuid();

const shareSchema = z.object({
  listingKeys: z.array(z.string().max(100)).min(1).max(3),
  people: z.array(pickSchema).max(6),
  note: z.string().trim().max(500),
});

const homesSchema = z.array(z.string().max(100)).min(1).max(3);

// The agent's own share, or null: a link that isn't theirs is no link at all.
export async function ownShareOf(agentId: string, shareId: string): Promise<{ id: string } | null> {
  if (typeof shareId !== "string" || !uuid.safeParse(shareId).success) return null;
  const [share] = await sql<{ id: string }[]>`
    select id from shares where id = ${shareId} and agent_id = ${agentId}`;
  return share ?? null;
}

// People the agent added who are on Porchcard: they hear from us, with their
// own link (lib/notify.ts), after the page has answered. The agent's own
// profile is made too, so the homes can say who they're from (made whether or
// not anyone is emailed, as it always has been).
export async function letThemKnow(agentId: string, participantIds: string[], opts: SendOptions = {}) {
  if (participantIds.length === 0) return;
  await ensureAgentProfile(agentId);
  if (opts.notify === false) return;
  for (const id of participantIds) after(() => notifyClientAdded(id));
}

// The homes in `keys` that are still for sale, once any that aren't here yet
// have been asked for. True when every one of them is. A listing someone else
// added themselves only when they show it: one they've hidden is theirs
// alone, whoever knows its key.
async function allForSale(agentId: string, keys: string[]) {
  // A home found by its address that isn't here yet is brought in first.
  if (await importMissing(keys)) after(() => runImportsAndContinue());
  const found = await sql`
    select listing_key from listings
    where listing_key in ${sql(keys)} and standard_status = 'Active'
      and (owner_account_id is null or owner_account_id = ${agentId}
           or coalesce((data->>'Hidden')::boolean, false) = false)`;
  return found.length === keys.length;
}

export type SendError = {
  error: string;
  // Which part of what was sent is wrong, when it's one part.
  field?: "homes" | "people" | "note";
  // Too many people found on Porchcard (not met) today: try again tomorrow.
  limit?: boolean;
  // One of the homes can no longer be sent (sold, gone, or never here).
  unavailable?: boolean;
};

export type Sent = {
  shareId: string;
  // The link the agent goes through next: the first person's, or the one
  // anyone can use when nobody is named on it.
  token: string;
  // Everyone added, in the order they were given, each with their own link.
  people: { participantId: string; name: string; token: string }[];
};

// A new link: its homes, a note, and the people it's for, each with their
// own link. It's named for them (by the database, as they're added); with
// nobody added, anyone with it can join, and it's named for whoever does.
// Only homes still for sale, the same as adding homes to a link later.
export async function sendHomes(
  agent: Account,
  input: { listingKeys: string[]; people: PersonPick[]; note: string },
  opts: SendOptions = {},
): Promise<SendError | Sent> {
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "people") return { error: pickError(input?.people), field: "people" };
    if (field === "note") return { error: "Notes can be up to 500 characters.", field: "note" };
    return { error: "Pick between 1 and 3 homes.", field: "homes" };
  }
  const keys = [...new Set(parsed.data.listingKeys)];
  if (!(await allForSale(agent.id, keys))) return { error: "One of those homes is no longer available.", unavailable: true };

  const resolved = await resolvePicks(sql, agent.id, parsed.data.people);
  if ("error" in resolved) return { error: resolved.error, field: "people" };
  if (await tooManyStrangers(sql, agent.id, resolved.people)) return { error: TOO_MANY_STRANGERS, limit: true };

  const made = await sql.begin(async (tx) => {
    const [share] = await tx<{ id: string; token: string }[]>`
      insert into shares (token, agent_id, note)
      values (${newShareToken()}, ${agent.id}, ${parsed.data.note})
      returning id, token`;
    // Everyone gets their own link, so what each of them likes is theirs, in
    // the order the agent added them (which is the order the link names them).
    const people: Sent["people"] = [];
    const bound: string[] = [];
    for (const person of resolved.people) {
      const added = await invitePerson(share.id, person, tx);
      people.push({ participantId: added.id, name: person.firstName, token: added.token });
      if (person.accountId) bound.push(added.id);
    }
    for (const [position, key] of keys.entries()) {
      await tx`
        insert into share_listings (share_id, listing_key, position)
        values (${share.id}, ${key}, ${position})`;
    }
    const [first] = await tx<{ token: string }[]>`
      select token from participants
      where share_id = ${share.id} and token is not null
      order by invited_at nulls last, position nulls last, created_at, first_name
      limit 1`;
    return { shareId: share.id, bound, people, token: first?.token ?? share.token };
  });
  // The agent's own profile, so their face is on their notes and their
  // clients can follow them.
  await ensureAgentProfile(agent.id);
  await letThemKnow(agent.id, made.bound, opts);
  return { shareId: made.shareId, token: made.token, people: made.people };
}

export type AddHomesError = {
  error: string;
  // The link isn't one of theirs (or isn't there).
  notFound?: boolean;
  // One of the homes can no longer be sent.
  unavailable?: boolean;
};

// Homes onto a link the agent has already sent, after the ones there. What
// went wrong, or how many of them weren't on it before. Whoever on it is on
// Porchcard hears about the new homes from us (lib/notify.ts: once a day at
// most from each agent, with being added), after the page has answered.
export async function addHomesToLink(
  agentId: string,
  shareId: string,
  listingKeys: string[],
  opts: SendOptions = {},
): Promise<AddHomesError | { added: number }> {
  const keys = homesSchema.safeParse(listingKeys);
  if (!keys.success) return { error: "Pick between 1 and 3 homes." };
  if (!(await ownShareOf(agentId, shareId))) return { error: "We couldn't find that client.", notFound: true };
  const unique = [...new Set(keys.data)];
  if (!(await allForSale(agentId, unique))) return { error: "One of those homes is no longer available.", unavailable: true };
  const added = await sql.begin(async (tx) => {
    const there = await tx<{ listing_key: string }[]>`
      select listing_key from share_listings
      where share_id = ${shareId} and removed_at is null and listing_key in ${sql(unique)}`;
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(position), -1) + 1 as next from share_listings where share_id = ${shareId}`;
    for (const [offset, key] of unique.entries()) {
      // A home sent before and removed comes back, with its history intact.
      await tx`
        insert into share_listings (share_id, listing_key, position)
        values (${shareId}, ${key}, ${next + offset})
        on conflict (share_id, listing_key) do update set removed_at = null`;
    }
    return unique.length - there.length;
  });
  if (added > 0 && opts.notify !== false) {
    const people = await sql<{ id: string }[]>`
      select p.id from participants p
      where p.share_id = ${shareId} and p.account_id is not null and p.account_id <> ${agentId}`;
    for (const person of people) after(() => notifyClientMoreHomes(person.id, added));
  }
  return { added };
}

// The agent's word in a home's conversation on their link. `to`: the client
// it answers (their likes or what they said), so on a link with several people
// it sits under that person's line; only ever someone on that link.
export async function replyToClient(
  agentId: string,
  shareId: string,
  listingKey: string,
  body: string,
  to: string | null = null,
): Promise<{ error: string } | { id: string; body: string; created_at: Date }> {
  const answering = to ?? null;
  const text = z.string().trim().min(1).max(1000).safeParse(body);
  if (!text.success || !uuid.safeParse(shareId).success || (answering !== null && !uuid.safeParse(answering).success)) {
    return { error: "Replies can be up to 1,000 characters." };
  }
  if (typeof listingKey !== "string" || listingKey.length > 100) return { error: "We couldn't find that conversation." };
  // The join limits this to the agent's own shares.
  const [inserted] = await sql<{ id: string; created_at: Date }[]>`
    insert into comments (share_id, listing_key, agent_id, body, reply_to_participant)
    select sl.share_id, sl.listing_key, ${agentId}, ${text.data},
      (select p.id from participants p where p.id = ${answering}::uuid and p.share_id = sl.share_id)
    from share_listings sl join shares s on s.id = sl.share_id
    where sl.share_id = ${shareId} and sl.listing_key = ${listingKey} and s.agent_id = ${agentId}
    returning id, created_at`;
  if (!inserted) return { error: "We couldn't find that conversation." };
  // Answering is having seen it: the "new" dot beside them clears from Home
  // too, where there's no page of the link to open. Only as far as what was
  // answered (the newest thing they said or asked in this conversation; with
  // no `to`, anyone on the link), as markShareSeen has it: whatever came
  // after, or from someone else on the link, still counts as new.
  await sql`
    update shares s set agent_seen_at = greatest(s.agent_seen_at, answered.at)
    from (
      select max(x.at) as at from (
        select c.created_at as at from comments c
        where c.share_id = ${shareId} and c.listing_key = ${listingKey} and c.participant_id is not null
          and (${answering}::uuid is null or c.participant_id = ${answering}::uuid)
        union all
        select a.asked_at from share_asks a
        where a.share_id = ${shareId} and a.listing_key = ${listingKey}
          and (${answering}::uuid is null or a.participant_id = ${answering}::uuid)
      ) x
    ) answered
    where s.id = ${shareId} and s.agent_id = ${agentId} and answered.at is not null`;
  return { id: inserted.id, body: text.data, created_at: inserted.created_at };
}
