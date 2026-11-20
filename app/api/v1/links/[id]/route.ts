import { apiJson, apiRoute, ApiError, isUuid } from "@/lib/api/http";
import { homeJson, linkJson } from "@/lib/api/serialize";
import { getClientBook } from "@/lib/clients";
import { sql } from "@/lib/db";
import { appUrl } from "@/lib/format";
import { clientActivity, getShareListings } from "@/lib/shares";
import { ANONYMOUS_BUYER } from "@/lib/timeline";

// One of the agent's links: its homes (with any they took off it, marked),
// and everyone on it with how it's gone for them, each with their own link to
// send. Only ever the agent's own: anyone else's is not found, the same as
// one that isn't there.

type PersonRow = {
  id: string;
  first_name: string;
  token: string | null;
  liked: string[];
  passed: string[];
  comments: number;
  opened: boolean;
};

// Everyone on the link but the agent, in the order they were added, with the
// homes they liked (the home, or something in it) and passed on (Not for me,
// or only dislikes), as the Clients page counts them (lib/clients.ts). The
// join to shares keeps it to the agent's own link.
const loadPeople = (agentId: string, shareId: string) => sql<PersonRow[]>`
  select p.id, p.first_name, p.token,
    coalesce(verdicts.liked, '{}') as liked,
    coalesce(verdicts.passed, '{}') as passed,
    (select count(*)::int from comments c where c.participant_id = p.id) as comments,
    (exists (select 1 from share_opens o where o.participant_id = p.id)
      or exists (select 1 from (${clientActivity()}) a where a.participant_id = p.id)) as opened
  from participants p
  join shares s on s.id = p.share_id
  cross join lateral (
    select array_agg(x.listing_key) filter (where x.verdict = 'like') as liked,
           array_agg(x.listing_key) filter (where x.verdict = 'pass') as passed
    from (
      select sl.listing_key, case
        when r.reaction = 'like' then 'like'
        when r.reaction = 'dislike' then 'pass'
        when exists (select 1 from photo_likes pl
                     where pl.participant_id = p.id and pl.listing_key = sl.listing_key) then 'like'
        when exists (select 1 from photo_dislikes pd
                     where pd.participant_id = p.id and pd.listing_key = sl.listing_key) then 'pass'
      end as verdict
      from share_listings sl
      left join reactions r
        on r.participant_id = p.id and r.share_id = sl.share_id and r.listing_key = sl.listing_key
      where sl.share_id = p.share_id and sl.removed_at is null
    ) x
  ) verdicts
  where p.share_id = ${shareId} and s.agent_id = ${agentId}
    and (p.account_id is null or p.account_id <> s.agent_id)
  order by p.invited_at nulls last, p.position nulls last, p.created_at, p.first_name`;

export const GET = apiRoute<{ id: string }>(async ({ agent, params }) => {
  const notFound = new ApiError(404, "not_found", "We couldn't find that link.");
  if (!isUuid(params.id)) throw notFound;
  const id = params.id.toLowerCase();

  // The agent's own links are the only ones in their book, so finding it
  // there is what says it's theirs, before anything on it is read.
  const book = await getClientBook(agent.id);
  const link = book.links.find((one) => one.shareId === id);
  if (!link) throw notFound;

  const [homes, people] = await Promise.all([getShareListings(id, true), loadPeople(agent.id, id)]);
  // Which client each person is, by the id GET /clients gives them.
  const clientOf = new Map(book.clients.flatMap((client) => client.participantIds.map((pid) => [pid, client.key])));

  return apiJson({
    link: linkJson(link),
    homes: homes.map(({ removedAt, ...home }) => ({ ...homeJson(home), removed: removedAt !== null })),
    people: people.map((p) => ({
      id: p.id,
      client_id: clientOf.get(p.id) ?? null,
      name: p.first_name.trim() || ANONYMOUS_BUYER,
      // Their own link. Someone who joined through the link's own (with
      // nobody named on it) has none: they come back on their own device.
      url: p.token ? `${appUrl()}/s/${p.token}` : null,
      opened: p.opened,
      liked: p.liked,
      passed: p.passed,
      comments: p.comments,
    })),
  });
});
