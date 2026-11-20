import { apiRoute, apiJson } from "@/lib/api/http";
import { sql } from "@/lib/db";
import { appUrl } from "@/lib/format";

// Who a key belongs to, and which of their keys it is: the first thing a
// tool asks, to check it was set up with the right one. (Never the key
// itself, nor the agent's email: only what's on their public profile.)
export const dynamic = "force-dynamic";

// (The owner's admin key acting as an agent sees that agent, and
// "acting_as": true.)
export const GET = apiRoute(async ({ agent, key, actingAs }) => {
  // Their public page, once they have one (made the first time they send
  // homes). Only read here: a GET changes nothing.
  const [profile] = await sql<{ id: string }[]>`select id from visitors where account_id = ${agent.id}`;
  return apiJson({
    agent: {
      name: agent.full_name.trim(),
      brokerage: agent.brokerage?.trim() || null,
      profile_url: profile ? `${appUrl()}/people/${profile.id}` : null,
      mls_agent_id: agent.mls_agent_id?.trim() || null,
    },
    key: { name: key.name, prefix: key.prefix },
    ...(actingAs ? { acting_as: true } : {}),
  });
});
