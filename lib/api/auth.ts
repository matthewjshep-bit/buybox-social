import { SUPER_ADMIN_EMAIL, type Agent } from "../auth";
import { sql } from "../db";
import { hashApiKey, keyKindOf } from "./keys";

// Who an API request is from: the agent whose key it carries, or the site's
// owner by an admin key, in an `Authorization: Bearer <key>` header and
// nowhere else. Cookies are never looked at, so a page someone is signed in
// to can't be made to call the API as them (there's nothing for another site
// to borrow), and nothing here knows about sessions or seeing the site as
// someone else.

// The agent, as lib/auth.ts reads an account, and the MLS member ID that
// ties MLS listings to them.
export type ApiAgent = Agent & { mls_agent_id: string };

// The site's owner, behind an admin key.
export type ApiOwner = { id: string; email: string; full_name: string };

// Which key it was: by name, and the first characters that tell it apart.
// Never the key.
export type ApiKeyInfo = { id: string; name: string; prefix: string };

export type ApiCaller =
  | { kind: "agent"; key: ApiKeyInfo; agent: ApiAgent }
  | { kind: "admin"; key: ApiKeyInfo; owner: ApiOwner };

type Row = {
  key_id: string;
  key_name: string;
  key_prefix: string;
  key_kind: "agent" | "admin";
  used_lately: boolean;
  id: string;
  email: string;
  full_name: string;
  role: "agent" | "buyer" | null;
  brokerage: string;
  photo_data_url: string | null;
  brand_color: string;
  mls_agent_id: string | null;
};

// The key from the header, if it's one in a shape we make. Anything else is
// no key at all, without asking the database.
function bearerKey(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer[ \t]+(\S+)[ \t]*$/i);
  const kind = match ? keyKindOf(match[1]) : null;
  return match && kind ? { key: match[1], kind } : null;
}

// The key and whose it is, or null: no key, a key we never made, one
// revoked, an agent key whose account is no longer an agent's, or an admin
// key whose account's email is no longer the owner's. When it was last used
// is noted, but no more than once a minute, so a busy tool isn't a write on
// every request.
export async function authenticate(request: Request): Promise<ApiCaller | null> {
  const bearer = bearerKey(request);
  if (!bearer) return null;
  const [row] = await sql<Row[]>`
    select k.id as key_id, k.name as key_name, k.prefix as key_prefix, k.kind as key_kind,
      coalesce(k.last_used_at > now() - interval '1 minute', false) as used_lately,
      a.id, a.email, a.full_name, a.role, a.brokerage, a.photo_data_url, a.brand_color, a.mls_agent_id
    from api_keys k
    join accounts a on a.id = k.account_id
    where k.hash = ${hashApiKey(bearer.key)} and k.revoked_at is null and k.kind = ${bearer.kind}
      and ((k.kind = 'agent' and a.role = 'agent')
        or (k.kind = 'admin' and lower(a.email) = ${SUPER_ADMIN_EMAIL}))`;
  if (!row) return null;
  if (!row.used_lately) {
    await sql`
      update api_keys set last_used_at = now()
      where id = ${row.key_id} and (last_used_at is null or last_used_at <= now() - interval '1 minute')`;
  }
  const key = { id: row.key_id, name: row.key_name, prefix: row.key_prefix };
  if (row.key_kind === "admin") {
    return { kind: "admin", key, owner: { id: row.id, email: row.email, full_name: row.full_name } };
  }
  return { kind: "agent", key, agent: asApiAgent(row) };
}

const asApiAgent = (row: Omit<Row, "key_id" | "key_name" | "key_prefix" | "key_kind" | "used_lately">): ApiAgent => ({
  id: row.id,
  email: row.email,
  full_name: row.full_name,
  role: "agent",
  brokerage: row.brokerage,
  photo_data_url: row.photo_data_url,
  brand_color: row.brand_color,
  mls_agent_id: row.mls_agent_id ?? "",
});

// The agent an admin key acts as (its Porchcard-Account header), read just as
// an agent's own key reads them: null when there's no account by that id, or
// it isn't an agent's. (`id` must already be a uuid.)
export async function agentById(id: string): Promise<ApiAgent | null> {
  const [row] = await sql<Omit<Row, "key_id" | "key_name" | "key_prefix" | "key_kind" | "used_lately">[]>`
    select id, email, full_name, role, kind, brokerage, photo_data_url, brand_color, mls_agent_id
    from accounts where id = ${id} and role = 'agent'`;
  return row ? asApiAgent(row) : null;
}
