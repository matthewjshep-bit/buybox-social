"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fail, readDevice, type ActionResult } from "@/lib/engagement";
import { getPublicIdentity } from "@/lib/public";
import type { Sentiment } from "@/lib/reactions";

// Only ever your own page: each of these works on whoever is asking, never
// on a page named in the request.
async function ownVisitor() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  return visitor;
}

const chipKey = z.string().trim().min(1).max(60);

// Keeps one thing your taste says on your page, or takes it off for everyone
// else (and out of the description). Kept however the description changes.
export async function showTasteChip(key: string, shown: boolean): Promise<ActionResult> {
  const parsed = chipKey.safeParse(key);
  if (!parsed.success || typeof shown !== "boolean") return fail("We couldn't save that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  const item = parsed.data.toLowerCase();
  if (shown) {
    await sql`
      update visitors
      set taste_hidden = coalesce(
        (select jsonb_agg(value) from jsonb_array_elements_text(taste_hidden) value where value <> ${item}),
        '[]'::jsonb)
      where id = ${visitor.id}`;
  } else {
    await sql`
      update visitors set taste_hidden = taste_hidden || jsonb_build_array(${item}::text)
      where id = ${visitor.id}
        and not taste_hidden @> jsonb_build_array(${item}::text)
        and jsonb_array_length(taste_hidden) < 100`;
  }
  refresh();
  return { ok: true };
}

// Whether everyone else sees what you pass on: the "Passes on" chips, the
// Passed filter and count, and the passes in your feed.
export async function showPasses(shown: boolean): Promise<ActionResult> {
  if (typeof shown !== "boolean") return fail("We couldn't save that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  await sql`update visitors set hide_passes = ${!shown} where id = ${visitor.id}`;
  refresh();
  return { ok: true };
}

const listingKey = z.string().min(1).max(100);
const sentiment = z.enum(["like", "dislike"]);
// Which things in a home's photos (or which of its facts): as saved.
const spotList = z
  .array(z.object({ mediaKey: z.string().min(1).max(500), tag: z.string().min(1).max(60) }))
  .min(1)
  .max(50);

// Takes back your like (or pass) on a home, from your page. Only yours: it
// never touches anyone else's, whatever it's sent.
export async function removeMyReaction(key: string, kind: Sentiment): Promise<ActionResult> {
  if (!listingKey.safeParse(key).success || !sentiment.safeParse(kind).success) return fail("We couldn't do that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  await sql`
    delete from public_reactions
    where listing_key = ${key} and visitor_id = ${visitor.id} and reaction = ${kind}`;
  refresh();
  return { ok: true };
}

// Takes back what you liked (or didn't) in a home's photos or facts: "the front door".
export async function removeMySpots(key: string, kind: Sentiment, spots: unknown): Promise<ActionResult> {
  const parsed = spotList.safeParse(spots);
  if (!listingKey.safeParse(key).success || !sentiment.safeParse(kind).success || !parsed.success) {
    return fail("We couldn't do that.");
  }
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  const mediaKeys = parsed.data.map((spot) => spot.mediaKey);
  const tags = parsed.data.map((spot) => spot.tag);
  const which = sql`
    listing_key = ${key} and visitor_id = ${visitor.id}
    and (media_key, tag) in (select * from unnest(${mediaKeys}::text[], ${tags}::text[]))`;
  if (kind === "like") await sql`delete from public_photo_likes where ${which}`;
  else await sql`delete from public_photo_dislikes where ${which}`;
  refresh();
  return { ok: true };
}

// Deletes a comment you wrote, unless someone else has answered it: their
// words would go with it. (Your own replies to it go too.)
export async function deleteMyComment(id: string): Promise<ActionResult> {
  if (typeof id !== "string" || id.length > 64) return fail("That comment isn't there anymore.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  const outcome = await sql.begin(async (tx) => {
    // Held first, so a reply being saved this moment finishes and is counted
    // below rather than going with the comment. Someone else's reads as gone,
    // so it doesn't even say there's one there.
    const [mine] = await tx`
      select id from public_comments where id::text = ${id} and visitor_id = ${visitor.id} for update`;
    if (!mine) return "gone";
    const [deleted] = await tx`
      delete from public_comments c
      where c.id = ${mine.id}
        and not exists (select 1 from public_comments r where r.parent_id = c.id and r.visitor_id <> ${visitor.id})
      returning c.id`;
    return deleted ? "deleted" : "answered";
  });
  if (outcome === "gone") return fail("That comment isn't there anymore.");
  if (outcome === "answered") return fail("Comments with replies can't be deleted here.");
  refresh();
  return { ok: true };
}
