import { sql } from "./db";
import { agentNotes } from "./profile";

// An agent's take on the homes on one of their links (their likes, dislikes
// and notes there), and the take they gave on those same homes on an earlier
// link, which they can bring over with one tap rather than give again.

// How much they've said on this link so far.
export async function takeCount(shareId: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    select
      (select count(*)::int from comments
        where share_id = ${shareId} and agent_id is not null and parent_id is null and reply_to_participant is null)
      + (select count(*)::int from share_agent_likes where share_id = ${shareId}) as n`;
  return n;
}

// For each home on this link, the latest other link of theirs where they
// said something about it: where an earlier take would come from.
const sources = (agentId: string, shareId: string) => sql`
  select distinct on (x.listing_key) x.listing_key, x.share_id
  from (
    select al.listing_key, al.share_id, al.created_at
    from share_agent_likes al join shares s on s.id = al.share_id
    where s.agent_id = ${agentId} and al.share_id <> ${shareId}
    union all
    select c.listing_key, c.share_id, c.created_at ${agentNotes(agentId)} and c.share_id <> ${shareId}
  ) x
  join share_listings sl on sl.listing_key = x.listing_key and sl.share_id = ${shareId} and sl.removed_at is null
  order by x.listing_key, x.created_at desc`;

// How many of this link's homes they've given a take on before, elsewhere.
export async function earlierTakeHomes(agentId: string, shareId: string): Promise<number> {
  const rows = await sql`select 1 from (${sources(agentId, shareId)}) src`;
  return rows.length;
}

// Brings that earlier take onto this link: the same likes and dislikes, and
// the same notes, in their own words, as theirs here. Never a reply to a
// client (those stay where they were said), and nothing twice.
export async function copyEarlierTake(agentId: string, shareId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      insert into share_agent_likes (share_id, listing_key, media_key, tag, reaction)
      select ${shareId}, al.listing_key, al.media_key, al.tag, al.reaction
      from share_agent_likes al
      join (${sources(agentId, shareId)}) src on src.share_id = al.share_id and src.listing_key = al.listing_key
      on conflict do nothing`;
    await tx`
      insert into comments (share_id, listing_key, agent_id, body, media_key, spot)
      select ${shareId}, c.listing_key, c.agent_id, c.body, c.media_key, c.spot ${agentNotes(agentId)}
        and (c.share_id, c.listing_key) in (select src.share_id, src.listing_key from (${sources(agentId, shareId)}) src)
        and not exists (
          select 1 from comments mine
          where mine.share_id = ${shareId} and mine.listing_key = c.listing_key and mine.agent_id = c.agent_id
            and mine.body = c.body and mine.spot is not distinct from c.spot)
      order by c.created_at`;
  });
}
