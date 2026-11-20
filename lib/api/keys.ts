import { createHash, randomBytes } from "node:crypto";
import { SUPER_ADMIN_EMAIL } from "../auth";
import { sql } from "../db";

// An agent's API keys: what their own tools (a CRM, Zapier, Make) send to act
// as them through /api/v1 (lib/api/auth.ts reads them). A key is shown once,
// when it's made, and kept only as its sha256: anyone who could read the
// table still couldn't use one. Only an agent can make one, and a key whose
// account is no longer an agent's stops working.
//
// The site's owner also has admin keys (kind 'admin', pc_admin_…), for
// /api/admin/v1 and for acting as any agent on /api/v1. Only the owner can
// make one, and one stops working if its account's email is no longer the
// owner's. The two kinds never mix: an agent's list and Revoke see only
// agent keys, the owner's admin page only admin keys.

export type ApiKeyKind = "agent" | "admin";

export const KEY_PATTERN = /^pc_live_[A-Za-z0-9]{32}$/;
export const ADMIN_KEY_PATTERN = /^pc_admin_[A-Za-z0-9]{32}$/;
export const API_KEYS_MOST = 10;
export const ADMIN_KEYS_MOST = 10;
const KEY_START: Record<ApiKeyKind, string> = { agent: "pc_live_", admin: "pc_admin_" };
// The start of the key and four or five characters of it.
const PREFIX_LENGTH: Record<ApiKeyKind, number> = { agent: 12, admin: 14 };

// Which kind a key is by its shape, or null when it's no key we make.
export const keyKindOf = (key: string): ApiKeyKind | null =>
  KEY_PATTERN.test(key) ? "agent" : ADMIN_KEY_PATTERN.test(key) ? "admin" : null;

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// `length` random letters and digits. A byte of 248 or more is thrown away
// rather than wrapped round, so every character is as likely as any other
// (248 is the last multiple of 62 a byte reaches).
export function randomBase62(length: number) {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= 248) continue;
      out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

// A new key, its first characters (to tell it apart in a list, which says no
// more than that), and what's kept of it.
export function newApiKey(kind: ApiKeyKind = "agent") {
  const key = `${KEY_START[kind]}${randomBase62(32)}`;
  return { key, prefix: key.slice(0, PREFIX_LENGTH[kind]), hash: hashApiKey(key) };
}

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  created_at: Date;
  last_used_at: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What they call it ("GoHighLevel"): one line, spaces evened out, no
// characters that don't print.
function keyName(name: unknown): { name: string } | { error: string } {
  const clean = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!clean) return { error: "Give the key a name, like the tool it's for." };
  if (clean.length > 60) return { error: "Keep the name to 60 characters." };
  return { name: clean };
}

// A new key for this agent, given back whole this once (`key`) with what the
// list shows of it. No more than API_KEYS_MOST working at a time. Their
// account row is held while the keys are counted, so two made at the same
// moment can't both slip under the limit.
export async function createApiKey(
  agentId: string,
  name: string,
): Promise<{ key: string; apiKey: ApiKeySummary } | { error: string; limit?: true }> {
  const named = keyName(name);
  if ("error" in named) return named;
  const made = newApiKey();
  return sql.begin(async (tx) => {
    const [account] = await tx<{ role: string | null }[]>`
      select role from accounts where id = ${agentId} for update`;
    if (account?.role !== "agent") return { error: "Only agents can make API keys." };
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from api_keys
      where account_id = ${agentId} and kind = 'agent' and revoked_at is null`;
    if (n >= API_KEYS_MOST) {
      return {
        error: `You have ${API_KEYS_MOST} keys already. Revoke one you don't use to make another.`,
        limit: true as const,
      };
    }
    const [apiKey] = await tx<ApiKeySummary[]>`
      insert into api_keys (account_id, kind, name, prefix, hash)
      values (${agentId}, 'agent', ${named.name}, ${made.prefix}, ${made.hash})
      returning id, name, prefix, created_at, last_used_at`;
    return { key: made.key, apiKey };
  });
}

// Their keys that still work, newest first. Never the key itself: only its
// first characters.
export async function listApiKeys(agentId: string): Promise<ApiKeySummary[]> {
  return sql<ApiKeySummary[]>`
    select id, name, prefix, created_at, last_used_at from api_keys
    where account_id = ${agentId} and kind = 'agent' and revoked_at is null
    order by created_at desc, id`;
}

// Stops one of their keys working, at once. False when it isn't theirs, or
// was revoked already. (Kept, marked, rather than deleted: a key that's gone
// can't come back by mistake, and its hash can never be reused.)
export async function revokeApiKey(agentId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await sql`
    update api_keys set revoked_at = now()
    where id = ${id} and account_id = ${agentId} and kind = 'agent' and revoked_at is null
    returning id`;
  return rows.length > 0;
}

// A new admin key for the site's owner, given back whole this once. Anyone
// else (another admin included) is refused: full power over every account is
// the owner's alone. No more than ADMIN_KEYS_MOST working at a time, counted
// with the owner's account row held, as for agent keys.
export async function createAdminKey(
  ownerId: string,
  name: string,
): Promise<{ key: string; apiKey: ApiKeySummary } | { error: string; limit?: true }> {
  const named = keyName(name);
  if ("error" in named) return named;
  const made = newApiKey("admin");
  return sql.begin(async (tx) => {
    const [account] = await tx<{ email: string }[]>`
      select email from accounts where id = ${ownerId} for update`;
    if (account?.email.toLowerCase() !== SUPER_ADMIN_EMAIL) return { error: "Only the site's owner can make admin keys." };
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from api_keys
      where account_id = ${ownerId} and kind = 'admin' and revoked_at is null`;
    if (n >= ADMIN_KEYS_MOST) {
      return {
        error: `You have ${ADMIN_KEYS_MOST} admin keys already. Revoke one to make another.`,
        limit: true as const,
      };
    }
    const [apiKey] = await tx<ApiKeySummary[]>`
      insert into api_keys (account_id, kind, name, prefix, hash)
      values (${ownerId}, 'admin', ${named.name}, ${made.prefix}, ${made.hash})
      returning id, name, prefix, created_at, last_used_at`;
    return { key: made.key, apiKey };
  });
}

// The owner's admin keys that still work, newest first (only their first
// characters, never the key).
export async function listAdminKeys(ownerId: string): Promise<ApiKeySummary[]> {
  return sql<ApiKeySummary[]>`
    select id, name, prefix, created_at, last_used_at from api_keys
    where account_id = ${ownerId} and kind = 'admin' and revoked_at is null
    order by created_at desc, id`;
}

// Stops one of the owner's admin keys working, at once. False when it isn't
// theirs or an admin key, or was revoked already.
export async function revokeAdminKey(ownerId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await sql`
    update api_keys set revoked_at = now()
    where id = ${id} and account_id = ${ownerId} and kind = 'admin' and revoked_at is null
    returning id`;
  return rows.length > 0;
}
