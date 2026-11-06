"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fail, readDevice, type ActionResult } from "@/lib/engagement";
import { getPublicIdentity } from "@/lib/public";

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
