"use server";

import { refresh } from "next/cache";
import { createApiKey, revokeApiKey } from "@/lib/api/keys";
import { createWebhook, deleteWebhook, enableWebhook, sendTestEvent, type DeliveryResult } from "@/lib/api/webhooks";
import { getViewAs, requireAgent } from "@/lib/auth";
import type { ActionResult } from "@/lib/engagement";

// Connect your tools, on Edit profile: an agent's API keys and webhooks.
// Every one of these works on whoever is signed in as an agent, never on an
// account named by the browser, and the lib/api functions they call check
// again that each key or webhook is that agent's own. The page is refreshed
// after each, so its lists are the database's, not the browser's guess.

// An admin seeing the site as an agent can look after the agent's keys and
// webhooks (revoke a key; test, turn back on or remove a webhook), but can't
// make one: a key, or the
// secret of a webhook, would let whoever holds it act as, or hear about, the
// agent long after the admin has stopped looking.
const SEEING_AS_SOMEONE = "Only they can make this, while you're seeing Porchcard as them.";

// What went wrong, in a sentence, as every result here says it.
const fail = (error: string) => ({ ok: false as const, error });

const NAME_MOST = 60;
const URL_MOST = 2000;

export type NewKey = { ok: true; key: string } | { ok: false; error: string };

// A new key, given back whole this once for the agent to copy. The list
// shows only its first characters from now on.
export async function makeApiKey(name: string): Promise<NewKey> {
  const agent = await requireAgent();
  if (await getViewAs()) return fail(SEEING_AS_SOMEONE);
  if (typeof name !== "string") return fail("Give the key a name, like the tool it's for.");
  // (The lib says the same of a long name; this just keeps a huge one off the wire to it.)
  if (name.length > NAME_MOST * 4) return fail(`Keep the name to ${NAME_MOST} characters.`);
  const made = await createApiKey(agent.id, name);
  if ("error" in made) return fail(made.error);
  refresh();
  return { ok: true, key: made.key };
}

// Stops one of their keys working, at once, once they've said so.
export async function revokeKey(id: string): Promise<ActionResult> {
  const agent = await requireAgent();
  if (typeof id !== "string") return fail("We couldn't find that key.");
  const revoked = await revokeApiKey(agent.id, id);
  // Revoked here or already gone elsewhere: either way the list should say so.
  refresh();
  return revoked ? { ok: true } : fail("That key was already revoked.");
}

export type NewWebhook = { ok: true; secret: string } | { ok: false; error: string; field?: "url" | "events" };

// A new webhook: the address their tool gave them and what to tell it
// about. Its signing secret comes back this once, to copy into the tool.
export async function addWebhook(url: string, events: string[]): Promise<NewWebhook> {
  const agent = await requireAgent();
  if (await getViewAs()) return fail(SEEING_AS_SOMEONE);
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, error: "Paste the address your tool gave you. It starts with https://", field: "url" };
  }
  if (url.length > URL_MOST) return { ok: false, error: "That address is too long.", field: "url" };
  // Always a list from this form (an empty one is "nothing ticked"), so the
  // lib never reads a missing list as "all of them".
  if (!Array.isArray(events) || events.length > 20 || events.some((event) => typeof event !== "string")) {
    return { ok: false, error: "Tick at least one thing to be told about.", field: "events" };
  }
  if (events.length === 0) return { ok: false, error: "Tick at least one thing to be told about.", field: "events" };
  const made = await createWebhook(agent.id, url, events);
  if ("error" in made) return { ok: false, error: made.error, field: made.field };
  refresh();
  return { ok: true, secret: made.secret };
}

// Takes one of their webhooks away, and what's kept of what it was sent.
export async function removeWebhook(id: string): Promise<ActionResult> {
  const agent = await requireAgent();
  if (typeof id !== "string") return fail("We couldn't find that webhook.");
  const removed = await deleteWebhook(agent.id, id);
  refresh();
  return removed ? { ok: true } : fail("That webhook was already removed.");
}

// A paused webhook (it failed again and again) back on, its failures
// counted from nothing again.
export async function turnWebhookOn(id: string): Promise<ActionResult> {
  const agent = await requireAgent();
  if (typeof id !== "string") return fail("We couldn't find that webhook.");
  const on = await enableWebhook(agent.id, id);
  refresh();
  return on ? { ok: true } : fail("We couldn't find that webhook.");
}

export type TestResult = { ok: true; delivery: DeliveryResult } | { ok: false; error: string };

// Sends one of their webhooks a test now, and says how it went. Works on a
// paused one too, so they can check it before turning it back on.
export async function testWebhook(id: string): Promise<TestResult> {
  const agent = await requireAgent();
  if (typeof id !== "string") return fail("We couldn't find that webhook.");
  const delivery = await sendTestEvent(agent.id, id);
  if (!delivery) return fail("We couldn't find that webhook.");
  // Its last delivery, in the list, is this test now.
  refresh();
  return { ok: true, delivery };
}
