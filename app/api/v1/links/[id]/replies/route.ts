import { z } from "zod";
import { apiJson, apiRoute, ApiError, isUuid } from "@/lib/api/http";
import { sql } from "@/lib/db";
import { replyToClient } from "@/lib/sending";

// The agent's word in a home's conversation on their link, the same as Reply
// on the link's page: their client sees it there, next time they open it.
// Porchcard doesn't text or email anyone about it.

const reply = z.object({
  home: z
    .string({ error: "home is the key of a home on this link." })
    .trim()
    .min(1, "home is the key of a home on this link.")
    .max(100, "That isn't a home's key."),
  body: z
    .string({ error: "body is the reply, as text." })
    .trim()
    .min(1, "Write something to say.")
    .max(1000, "Replies can be up to 1,000 characters."),
  // The person it answers (an id from GET /links/{id}), so on a link with
  // several people it sits under their line.
  to: z.uuid({ error: "to is the id of someone on this link, from GET /links/{id}." }).nullish(),
});

export const POST = apiRoute<{ id: string }>(
  async ({ agent, params, json }) => {
    const notFound = new ApiError(404, "not_found", "We couldn't find that link.");
    if (!isUuid(params.id)) throw notFound;
    const id = params.id.toLowerCase();
    const body = await json(reply);
    const to = body.to?.toLowerCase() ?? null;

    // The link, the home on it, and whoever it answers, each only if it's
    // the agent's own (the join to shares), so a mistake says which it was
    // rather than nothing being saved. Never the agent as the one answered.
    const [found] = await sql<{ home: boolean; person: boolean }[]>`
      select
        exists (select 1 from share_listings sl
                where sl.share_id = s.id and sl.listing_key = ${body.home}) as home,
        exists (select 1 from participants p
                where p.id = ${to}::uuid and p.share_id = s.id
                  and (p.account_id is null or p.account_id <> s.agent_id)) as person
      from shares s
      where s.id = ${id} and s.agent_id = ${agent.id}`;
    if (!found) throw notFound;
    if (!found.home) throw new ApiError(404, "not_found", "That home isn't on this link.", "home");
    if (to !== null && !found.person) throw new ApiError(400, "invalid_request", "That person isn't on this link.", "to");

    const saved = await replyToClient(agent.id, id, body.home, body.body, to);
    if ("error" in saved) throw new ApiError(400, "invalid_request", saved.error);
    return apiJson(
      { reply: { id: saved.id, body: saved.body, created_at: new Date(saved.created_at).toISOString() } },
      201,
    );
  },
  { idempotent: true },
);
