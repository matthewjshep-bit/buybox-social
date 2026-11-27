"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getViewAs, requireUser, type Account } from "@/lib/auth";
import { sql } from "@/lib/db";
import { MAX_COMMENTS_PER_MINUTE, type ActionResult } from "@/lib/engagement";
import { homeLiteOf, type HomeLite } from "@/lib/home-lite";
import { kindOf, listingWords } from "@/lib/kinds";
import { importMissing, runImportsAndContinue } from "@/lib/listings/imports";
import type { Listing } from "@/lib/listings/types";
import { getThreads, threadHref } from "@/lib/messages";
import { deletePost, editPost } from "@/lib/own-words";
import { pickSchema, type PersonPick } from "@/lib/people-picker";
import { ensureAccountVisitor } from "@/lib/public";
import { SEND_HOMES_MOST } from "@/lib/send-limits";
import { homesToSend } from "@/lib/send-search";
import { sendHomesOffer } from "@/lib/send-suggestions";
import { addHomesToLink, ownShareOf, sendHomes } from "@/lib/sending";

// Behind the one box for saying something and sending homes (components/compose):
// the homes to offer and to find, and what Post or Send does with it all.

// Whether people on Porchcard may hear from us about what was just sent.
// Never while an admin is looking at the site as them.
const mayNotify = async () => ({ notify: !(await getViewAs()) });

export type HomeGroup = { title: string; homes: HomeLite[] };

// With nothing typed yet: their own listings (a pro), the homes they've had
// to do with, then more to send (near them, popular, new), under a title each.
export async function offerHomes(): Promise<HomeGroup[]> {
  const me = await requireUser();
  const visitor = await ensureAccountVisitor(me);
  const offer = await sendHomesOffer(me, visitor.id);
  return [
    { title: `Your ${listingWords(kindOf(me)).many}`, homes: offer.mine.map(homeLiteOf) },
    { title: "Homes you've liked, saved or sent", homes: offer.touched.map(homeLiteOf) },
    { title: "Popular and near you", homes: offer.more.map(homeLiteOf) },
  ].filter((group) => group.homes.length > 0);
}

// Homes as an address (or MLS number) is typed: a few, the closest first.
export async function findHomes(query: string): Promise<HomeLite[]> {
  const me = await requireUser();
  if (typeof query !== "string" || query.trim().length < 2) return [];
  const found = await homesToSend(me.id, query.trim().slice(0, 100), { limit: 6 });
  return found.map(homeLiteOf);
}

// Where it goes: everyone (their page, their followers' feeds, and each
// home's conversation), the people named (each gets their own link, and a
// conversation in Messages), or a conversation already open (more homes on
// the link they sent, or just a word).
export type ComposeTarget =
  | { kind: "everyone" }
  | { kind: "people"; people: PersonPick[] }
  | { kind: "thread"; key: string; shareId: string | null };

export type ComposeField = "homes" | "people" | "body" | "note";
export type Published = { ok: true; href: string; said: string } | { ok: false; error: string; field?: ComposeField };

const input = z.object({
  body: z.string().trim().max(1000),
  homes: z.array(z.string().min(1).max(100)).max(SEND_HOMES_MOST),
  to: z.union([
    z.object({ kind: z.literal("everyone") }),
    z.object({ kind: z.literal("people"), people: z.array(pickSchema).max(6) }),
    z.object({ kind: z.literal("thread"), key: z.string().max(200), shareId: z.string().uuid().nullable() }),
  ]),
});

// The homes still for sale (or a pro's own, on their profile) among these, in order.
async function forSale(me: Account, keys: string[]): Promise<Listing[]> {
  if (keys.length === 0) return [];
  if (await importMissing(keys)) after(() => runImportsAndContinue());
  const rows = await sql<{ data: Listing }[]>`
    select data from listings
    where listing_key in ${sql(keys)} and standard_status = 'Active'
      and (owner_account_id is null or owner_account_id = ${me.id} or coalesce((data->>'Hidden')::boolean, false) = false)`;
  const byKey = new Map(rows.map((row) => [row.data.ListingKey, row.data]));
  return keys.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
}

const fail = (error: string, field?: ComposeField): Published => ({ ok: false, error, field });

export async function publish(raw: unknown): Promise<Published> {
  const me = await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("That didn't send. Check what you typed and try again.");
  const { body, to } = parsed.data;
  const homes = [...new Set(parsed.data.homes)];

  if (to.kind === "everyone") return post(me, body, homes);

  if (to.kind === "people") {
    if (homes.length === 0) return fail("Add a home to send.", "homes");
    if (to.people.length === 0) return fail("Say who it's for.", "people");
    const made = await sendHomes(me, { listingKeys: homes, people: to.people, note: body }, await mayNotify());
    if ("error" in made) return fail(made.error, made.field);
    const thread = (await getThreads(me)).find((t) => t.shareIds.includes(made.shareId));
    refresh();
    return { ok: true, href: thread ? `${thread.href}?sent=${made.shareId}` : "/messages", said: "Sent" };
  }

  // A conversation already open.
  const threads = await getThreads(me);
  const thread = threads.find((t) => t.key === to.key);
  if (!thread) return fail("We couldn't find that conversation.");
  // (Only a link the viewer sent takes more: never one they were sent.)
  const shareId = to.shareId && thread.shareIds.includes(to.shareId) && (await ownShareOf(me.id, to.shareId)) ? to.shareId : null;
  if (!shareId) {
    // Nothing sent to them yet (they sent the viewer homes): a new link for them.
    if (homes.length === 0) return fail("Add a home to send.", "homes");
    const pick = await pickFor(thread.key);
    if (!pick) return fail("We couldn't find who that's for.");
    const made = await sendHomes(me, { listingKeys: homes, people: [pick], note: body }, await mayNotify());
    if ("error" in made) return fail(made.error, made.field);
    refresh();
    return { ok: true, href: `${thread.href}?sent=${made.shareId}`, said: "Sent" };
  }
  if (homes.length === 0 && !body) return fail("Add a home, or say something.", "homes");
  if (homes.length > 0) {
    const added = await addHomesToLink(me.id, shareId, homes, await mayNotify());
    if ("error" in added) return fail(added.error, "homes");
  }
  if (body) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from comments where agent_id = ${me.id} and created_at > now() - interval '1 minute'`;
    if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");
    await sql`insert into comments (share_id, agent_id, body) values (${shareId}, ${me.id}, ${body})`;
  }
  await sql`update shares set agent_seen_at = now() where id = ${shareId} and agent_id = ${me.id}`;
  refresh();
  return { ok: true, href: threadHref(thread.key), said: "Sent" };
}

// Who a conversation is with, as a person to send homes to: someone on
// Porchcard by their page, else by the first name the conversation has.
async function pickFor(key: string): Promise<PersonPick | null> {
  if (key.startsWith("acct:")) {
    const [visitor] = await sql<{ id: string }[]>`select id from visitors where account_id = ${key.slice(5)}::uuid`;
    return visitor ? { visitorId: visitor.id } : null;
  }
  if (key.startsWith("name:")) return { name: key.slice(5) };
  if (key.startsWith("p:")) {
    const [person] = await sql<{ first_name: string }[]>`select first_name from participants where id = ${key.slice(2)}::uuid`;
    return person?.first_name.trim() ? { name: person.first_name.trim() } : null;
  }
  return null;
}

// To everyone: a post on their page and in their followers' feeds, with the
// homes to swipe through; its words on each home's conversation too.
async function post(me: Account, body: string, keys: string[]): Promise<Published> {
  if (!body && keys.length === 0) return fail("Say something, or add a home.", "body");
  if (!me.role) return fail("Please sign up or sign in first.");
  const visitor = await ensureAccountVisitor(me);
  const listings = await forSale(me, keys);
  if (listings.length < keys.length) return fail("One of those homes is no longer available.", "homes");
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from posts where visitor_id = ${visitor.id} and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");
  await sql.begin(async (tx) => {
    const [made] = await tx<{ id: string }[]>`
      insert into posts (visitor_id, body) values (${visitor.id}, ${body}) returning id`;
    for (const [position, listing] of listings.entries()) {
      await tx`insert into post_homes (post_id, listing_key, position) values (${made.id}, ${listing.ListingKey}, ${position})`;
      if (body) {
        await tx`
          insert into public_comments (listing_key, visitor_id, body, posted, post_id)
          values (${listing.ListingKey}, ${visitor.id}, ${body}, true, ${made.id})`;
      }
    }
  });
  refresh();
  return { ok: true, href: `/people/${visitor.id}`, said: "Posted" };
}

// Your own post, in other words (its homes stay), or taken back: off your
// page, out of the feeds, and its words off each home's conversation. The
// card changes where it is (nothing reloads under it, as a feed would).
export async function changeMyPost(postId: string, body: string): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = z.string().trim().max(1000).safeParse(body);
  if (!parsed.success) return { ok: false, error: "Posts can be up to 1,000 characters." };
  if (typeof postId !== "string" || postId.length > 64) return { ok: false, error: "That post isn't there anymore." };
  const visitor = await ensureAccountVisitor(me);
  const changed = await editPost(visitor.id, postId, parsed.data);
  if (changed === "empty") return { ok: false, error: "Say something, or delete the post." };
  if (changed === "gone") return { ok: false, error: "That post isn't there anymore." };
  return { ok: true };
}

export async function deleteMyPost(postId: string): Promise<ActionResult> {
  const me = await requireUser();
  if (typeof postId !== "string" || postId.length > 64) return { ok: false, error: "That post isn't there anymore." };
  const visitor = await ensureAccountVisitor(me);
  if (!(await deletePost(visitor.id, postId))) return { ok: false, error: "That post isn't there anymore." };
  return { ok: true };
}

export type { HomeLite };
