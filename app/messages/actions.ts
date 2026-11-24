"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { addComment } from "@/app/s/[token]/actions";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fail, MAX_COMMENTS_PER_MINUTE, type ActionResult } from "@/lib/engagement";
import { getThread, type HomesItem } from "@/lib/messages";
import { notifyAgent } from "@/lib/notify";
import { replyToClient } from "@/lib/sending";

// What a message is about: one home in the conversation, or (null) the
// conversation itself.
export type SendTarget = { shareId: string; listingKey: string } | null;

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(1000);

// Says something in a conversation: about one of its homes (a reply in that
// home's thread on the link, as the link has it) or about nothing in
// particular (a word on the link itself). Whoever sent the homes writes as
// the sender; whoever was sent them writes as themselves on the link.
export async function sendMessage(threadKey: string, body: string, on: SendTarget = null): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = text.safeParse(body);
  if (!parsed.success) return fail("Messages can be up to 1,000 characters.");
  if (typeof threadKey !== "string") return fail("We couldn't find that conversation.");
  const view = await getThread(me, threadKey);
  if (!view) return fail("We couldn't find that conversation.");
  // Where it goes: the home's link, or the newest link in the conversation.
  const shareId = on?.shareId ?? view.thread.shareIds[0];
  if (!uuid.safeParse(shareId).success || !view.thread.shareIds.includes(shareId)) {
    return fail("We couldn't find that conversation.");
  }
  const item = view.items.find((item): item is HomesItem => item.kind === "homes" && item.shareId === shareId);
  if (!item) return fail("We couldn't find that conversation.");

  if (on) {
    if (typeof on.listingKey !== "string" || on.listingKey.length > 100) return fail("That home isn't there anymore.");
    if (item.mine) {
      const result = await replyToClient(me.id, shareId, on.listingKey, parsed.data);
      if ("error" in result) return fail(result.error);
      refresh();
      return { ok: true };
    }
    return addComment(item.token, on.listingKey, parsed.data);
  }

  if (item.mine) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from comments where agent_id = ${me.id} and created_at > now() - interval '1 minute'`;
    if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");
    await sql`insert into comments (share_id, agent_id, body) values (${shareId}, ${me.id}, ${parsed.data})`;
    // (Writing back is having seen what's there.)
    await sql`update shares set agent_seen_at = now() where id = ${shareId} and agent_id = ${me.id}`;
    refresh();
    return { ok: true };
  }

  const [place] = await sql<{ id: string; first_name: string }[]>`
    select id, first_name from participants where share_id = ${shareId} and account_id = ${me.id}`;
  if (!place) return fail("We couldn't find that conversation.");
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from comments where participant_id = ${place.id} and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");
  await sql`insert into comments (share_id, participant_id, body) values (${shareId}, ${place.id}, ${parsed.data})`;
  after(() => notifyAgent(shareId, `${place.first_name.trim() || "Someone"} sent you a message`));
  refresh();
  return { ok: true };
}

// Opening a conversation is having seen what's in it: the links in it the
// viewer sent are marked seen, and the ones they were sent are noted as
// looked at, so neither reads as new until something more happens.
export async function markThreadSeen(threadKey: string): Promise<void> {
  const me = await requireUser();
  if (typeof threadKey !== "string" || threadKey.length > 200) return;
  const view = await getThread(me, threadKey);
  if (!view) return;
  const ids = view.thread.shareIds;
  await Promise.all([
    sql`update shares set agent_seen_at = now() where agent_id = ${me.id} and id in ${sql(ids)}`,
    view.thread.direction === "sent"
      ? Promise.resolve()
      : sql`
          insert into thread_seen (account_id, thread_key, seen_at) values (${me.id}, ${threadKey}, now())
          on conflict (account_id, thread_key) do update set seen_at = now()`,
  ]);
}
