"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";

// The agent hearts something a client said on their link, or takes the heart
// back: the client's thread says "Liked by Jordan" under it. Only the link's
// own agent, only on a client's comment, never their own, and only on a home
// still on the link (where the client would see it). The check and the change
// are one statement, so nothing slips in between.
export async function likeClientComment(commentId: string, liked: boolean): Promise<{ ok: boolean }> {
  const agent = await requireAgent();
  if (!z.uuid().safeParse(commentId).success || typeof liked !== "boolean") return { ok: false };
  const theirs = sql`
    select c.id from comments c
    join shares s on s.id = c.share_id
    join share_listings sl on sl.share_id = c.share_id and sl.listing_key = c.listing_key and sl.removed_at is null
    where c.id = ${commentId} and s.agent_id = ${agent.id} and c.participant_id is not null`;
  const found = liked
    ? await sql`
        with theirs as (${theirs}),
        added as (insert into share_comment_likes (comment_id) select id from theirs on conflict (comment_id) do nothing)
        select id from theirs`
    : await sql`
        with theirs as (${theirs}),
        gone as (delete from share_comment_likes where comment_id in (select id from theirs))
        select id from theirs`;
  // Either way the page catches up: refused, it shows why (the home's off the
  // link, or the comment's gone).
  refresh();
  return { ok: found.length > 0 };
}
