"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";

// The agent hearts something a client said on their link, or takes the heart
// back: the client's thread says "Liked by Jordan" under it. Only the link's
// own agent, and only on a client's comment, never their own.
export async function likeClientComment(commentId: string, liked: boolean): Promise<{ ok: boolean }> {
  const agent = await requireAgent();
  if (!z.uuid().safeParse(commentId).success || typeof liked !== "boolean") return { ok: false };
  const [theirs] = await sql`
    select 1 from comments c join shares s on s.id = c.share_id
    where c.id = ${commentId} and s.agent_id = ${agent.id} and c.participant_id is not null`;
  if (!theirs) return { ok: false };
  if (liked) {
    // (Gone meanwhile, nothing to heart.)
    await sql`
      insert into share_comment_likes (comment_id)
      select id from comments where id = ${commentId}
      on conflict (comment_id) do nothing`;
  } else {
    await sql`delete from share_comment_likes where comment_id = ${commentId}`;
  }
  refresh();
  return { ok: true };
}
