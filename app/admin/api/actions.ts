"use server";

import { refresh } from "next/cache";
import { createAdminKey, revokeAdminKey } from "@/lib/api/keys";
import { requireSuperAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/engagement";

// The owner's admin keys, on /admin/api. Each action checks for the owner
// itself (anyone else gets "not found"), and works only on the owner's own
// keys: a server action can be called directly, not only from its button.
// The page is refreshed after each, so its list is the database's.

const fail = (error: string) => ({ ok: false as const, error });

const NAME_MOST = 60;

export type NewAdminKey = { ok: true; key: string } | { ok: false; error: string };

// A new admin key, given back whole this once to copy. The list shows only
// its first characters from now on.
export async function makeAdminKey(name: string): Promise<NewAdminKey> {
  const owner = await requireSuperAdmin();
  if (typeof name !== "string") return fail("Give the key a name, like the tool it's for.");
  // (The lib says the same of a long name; this keeps a huge one off the wire to it.)
  if (name.length > NAME_MOST * 4) return fail(`Keep the name to ${NAME_MOST} characters.`);
  const made = await createAdminKey(owner.id, name);
  if ("error" in made) return fail(made.error);
  refresh();
  return { ok: true, key: made.key };
}

// Stops one of the owner's admin keys working, at once.
export async function revokeAdminKeyAction(id: string): Promise<ActionResult> {
  const owner = await requireSuperAdmin();
  if (typeof id !== "string") return fail("We couldn't find that key.");
  const revoked = await revokeAdminKey(owner.id, id);
  refresh();
  return revoked ? { ok: true } : fail("That key was already revoked.");
}
