import { cache } from "react";
import { sql } from "./db";

// Someone with a public page who is also on one of an agent's links: that
// agent's client. Only ever asked by the agent, about their own links. The
// agent named them on the link, so where the page would call them "A buyer"
// (no first name of their own yet), the agent sees that name instead. A first
// name and nothing else: never an email or a phone.
export type YourClient = { participantId: string; shareId: string; firstName: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The person behind this page, on the agent's newest link with them, if any.
export const yourClient = cache(async (agentId: string, visitorId: string): Promise<YourClient | null> => {
  if (!UUID.test(visitorId)) return null;
  const [row] = await sql<{ participant_id: string; share_id: string; first_name: string }[]>`
    select p.id as participant_id, p.share_id, p.first_name
    from participants p
    join shares s on s.id = p.share_id
    join visitors v on v.account_id = p.account_id
    where s.agent_id = ${agentId} and v.id = ${visitorId}
    order by p.created_at desc
    limit 1`;
  return row ? { participantId: row.participant_id, shareId: row.share_id, firstName: row.first_name.trim() } : null;
});

// The first names the agent gave these pages' people, by page id, for those
// who are their clients (a list of followers, say).
export async function yourClientNames(agentId: string, visitorIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(visitorIds)].filter((id) => UUID.test(id));
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: string; first_name: string }[]>`
    select distinct on (v.id) v.id, p.first_name
    from participants p
    join shares s on s.id = p.share_id
    join visitors v on v.account_id = p.account_id
    where s.agent_id = ${agentId} and v.id in ${sql(ids)}
    order by v.id, p.created_at desc`;
  return new Map(rows.flatMap((row) => (row.first_name.trim() ? [[row.id, row.first_name.trim()] as const] : [])));
}
