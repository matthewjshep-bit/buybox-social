import { sql } from "./db";
import type { ClientBook } from "./clients";

// What an agent's clients just did on the links the agent sent them, newest
// first, as one stream: opened a link, liked or passed on a home, said
// something, asked to see one. Each a tap from that client's page among the
// agent's clients. Only ever the agent's own links and their own clients:
// nothing here is public.

export type ClientEvent = {
  id: string;
  kind: "opened" | "liked" | "passed" | "comment" | "ask";
  at: string;
  client: { key: string; name: string; photo: string | null };
  // The home it's about (none for opening a link).
  address: string | null;
  // What they said.
  body: string | null;
  href: string;
};

const MOST = 12;

export async function getClientActivity(agentId: string, book: ClientBook, most = MOST): Promise<ClientEvent[]> {
  const byParticipant = new Map<string, ClientBook["clients"][number]>();
  for (const client of book.clients) for (const id of client.participantIds) byParticipant.set(id, client);
  const ids = [...byParticipant.keys()];
  if (ids.length === 0) return [];
  const rows = await sql<
    { kind: ClientEvent["kind"]; participant_id: string; at: Date; listing_key: string | null; body: string | null }[]
  >`
    -- (Each link once for each of them, when they first opened it, on whichever device.)
    (select 'opened' as kind, o.participant_id, min(o.first_at) as at, null::text as listing_key, null::text as body
      from share_opens o join shares s on s.id = o.share_id
      where s.agent_id = ${agentId} and o.participant_id in ${sql(ids)}
      group by o.share_id, o.participant_id
      order by min(o.first_at) desc limit ${most})
    union all
    (select case r.reaction when 'like' then 'liked' else 'passed' end, r.participant_id, r.updated_at, r.listing_key, null
      from reactions r join shares s on s.id = r.share_id
      where s.agent_id = ${agentId} and r.participant_id in ${sql(ids)} and r.reaction is not null
      order by r.updated_at desc limit ${most})
    union all
    (select 'comment', c.participant_id, c.created_at, c.listing_key, c.body
      from comments c join shares s on s.id = c.share_id
      where s.agent_id = ${agentId} and c.participant_id in ${sql(ids)}
      order by c.created_at desc limit ${most})
    union all
    (select 'ask', a.participant_id, a.asked_at, a.listing_key, null
      from share_asks a join shares s on s.id = a.share_id
      where s.agent_id = ${agentId} and a.participant_id in ${sql(ids)}
      order by a.asked_at desc limit ${most})
    order by at desc
    limit ${most}`;
  const keys = [...new Set(rows.flatMap((row) => (row.listing_key ? [row.listing_key] : [])))];
  const addresses = new Map(
    keys.length
      ? (
          await sql<{ key: string; address: string }[]>`
            select listing_key as key, data->>'UnparsedAddress' as address from listings where listing_key in ${sql(keys)}`
        ).map((row) => [row.key, row.address])
      : [],
  );
  return rows.flatMap((row, i) => {
    const client = byParticipant.get(row.participant_id);
    if (!client) return [];
    const page = `/messages/${encodeURIComponent(client.key)}`;
    return [
      {
        id: `${row.kind}:${row.participant_id}:${row.listing_key ?? ""}:${i}`,
        kind: row.kind,
        at: row.at.toISOString(),
        client: { key: client.key, name: client.name, photo: client.photo },
        address: row.listing_key ? (addresses.get(row.listing_key) ?? null) : null,
        body: row.body,
        // Their conversation; anything about a home, at that home's card in it.
        href: row.kind === "opened" || !row.listing_key ? page : `${page}#home-${encodeURIComponent(row.listing_key)}`,
      },
    ];
  });
}
