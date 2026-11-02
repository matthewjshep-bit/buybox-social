"use server";

import { refresh } from "next/cache";
import { sql } from "@/lib/db";
import {
  commentSchema,
  ensureDevice,
  fail,
  MAX_COMMENTS_PER_MINUTE,
  nameSchema,
  reactionSchema,
  readDevice,
  type ActionResult,
} from "@/lib/engagement";
import { getVisitor } from "@/lib/public";
import type { CommentTag, Reaction } from "@/lib/shares";

// Counts each browser once per listing, from public pages and share links alike.
export async function recordView(listingKey: string): Promise<void> {
  if (typeof listingKey !== "string" || listingKey.length > 100) return;
  const device = await ensureDevice();
  await sql`
    insert into listing_views (listing_key, device_token)
    select listing_key, ${device} from listings where listing_key = ${listingKey}
    on conflict do nothing`;
}

export async function joinPublic(firstName: string): Promise<ActionResult> {
  const name = nameSchema.safeParse(firstName);
  if (!name.success) return fail("Please enter your first name.");
  const device = await ensureDevice();
  await sql`
    insert into visitors (device_token, first_name) values (${device}, ${name.data})
    on conflict (device_token) do update set first_name = excluded.first_name`;
  refresh();
  return { ok: true };
}

// Public engagement only applies to listings that are still active.
async function resolveVisitor(listingKey: string) {
  const [listing] = await sql`
    select 1 from listings where listing_key = ${listingKey} and standard_status = 'Active'`;
  if (!listing) return null;
  return getVisitor(await readDevice());
}

export async function setPublicReaction(
  listingKey: string,
  reaction: Reaction | null,
): Promise<ActionResult> {
  if (!reactionSchema.safeParse(reaction).success) return fail("Unknown reaction.");
  const visitor = await resolveVisitor(listingKey);
  if (!visitor) return fail("Please add your name first.");

  if (reaction === null) {
    await sql`
      delete from public_reactions
      where listing_key = ${listingKey} and visitor_id = ${visitor.id}`;
  } else {
    await sql`
      insert into public_reactions (listing_key, visitor_id, reaction)
      values (${listingKey}, ${visitor.id}, ${reaction})
      on conflict (listing_key, visitor_id)
      do update set reaction = excluded.reaction, updated_at = now()`;
  }
  refresh();
  return { ok: true };
}

export async function addPublicComment(
  listingKey: string,
  body: string,
  tag: CommentTag | null,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse({ body, tag });
  if (!parsed.success) return fail("Comments can be up to 1,000 characters.");
  const visitor = await resolveVisitor(listingKey);
  if (!visitor) return fail("Please add your name first.");

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from public_comments
    where visitor_id = ${visitor.id} and created_at > now() - interval '1 minute'`;
  if (count >= MAX_COMMENTS_PER_MINUTE) return fail("Slow down a little, then try again.");

  await sql`
    insert into public_comments (listing_key, visitor_id, tag, body)
    values (${listingKey}, ${visitor.id}, ${parsed.data.tag}, ${parsed.data.body})`;
  refresh();
  return { ok: true };
}
