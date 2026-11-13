import { cache } from "react";
import { sql } from "./db";
import { agentFirstName } from "./format";
import { photoUrl } from "./person-photo";

// The agents' links someone signed in is on, as theirs: who sent it, how many
// homes are waiting for their take, and the agent's latest word on it. Only
// what the person on the link may see anyway: the agent's name, company and
// photo (never their email or phone), and the homes on it.
export type MyLink = {
  // Their own link if the agent added them by name, else the package's.
  token: string;
  shareId: string;
  agent: { name: string; firstName: string; brokerage: string | null; photo: string | null; profileId: string | null };
  // Homes still on the link, and the ones they haven't reacted to yet.
  homes: number;
  unrated: number;
  firstPhoto: string | null;
  cities: string[];
  latestAgentReply: { body: string; listingKey: string; address: string; at: string; commentId: string } | null;
  lastActivityAt: string;
};

type Row = {
  share_id: string;
  token: string;
  full_name: string;
  agent_first_name: string | null;
  brokerage: string;
  agent_profile: string | null;
  photo_v: string | null;
  homes: number;
  unrated: number;
  first_photo: string | null;
  cities: string[] | null;
  reply_id: string | null;
  reply_body: string | null;
  reply_key: string | null;
  reply_address: string | null;
  reply_at: Date | null;
  last_at: Date;
};

// Newest activity first: something the agent said or added, something they
// did themselves, or the link reaching them. A link the account is the agent
// of is the agent's own, never one they're "on".
export const getMyLinks = cache(async (accountId: string): Promise<MyLink[]> => {
  const rows = await sql<Row[]>`
    select s.id as share_id, coalesce(p.token, s.token) as token,
      a.full_name, nullif(btrim(av.first_name), '') as agent_first_name, a.brokerage,
      av.id as agent_profile, case when av.id is not null then left(md5(a.photo_data_url), 10) end as photo_v,
      (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
      (select count(*)::int from share_listings sl
        where sl.share_id = s.id and sl.removed_at is null
          and not exists (
            select 1 from reactions r
            where r.participant_id = p.id and r.share_id = s.id and r.listing_key = sl.listing_key
              and (r.reaction is not null or cardinality(r.liked) > 0 or cardinality(r.disliked) > 0))
          and not exists (
            select 1 from photo_likes pl where pl.participant_id = p.id and pl.listing_key = sl.listing_key)
          and not exists (
            select 1 from photo_dislikes pd where pd.participant_id = p.id and pd.listing_key = sl.listing_key)
      ) as unrated,
      (select l.data->'Media'->0->>'MediaURL'
        from share_listings sl join listings l on l.listing_key = sl.listing_key
        where sl.share_id = s.id and sl.removed_at is null
        order by sl.position limit 1) as first_photo,
      (select array_agg(distinct l.data->>'City')
        from share_listings sl join listings l on l.listing_key = sl.listing_key
        where sl.share_id = s.id and sl.removed_at is null and l.data->>'City' is not null) as cities,
      reply.id as reply_id, reply.body as reply_body, reply.listing_key as reply_key,
      reply.address as reply_address, reply.created_at as reply_at,
      greatest(s.created_at, p.created_at, p.invited_at, reply.created_at,
        (select max(x.at) from (
          select updated_at as at from reactions where participant_id = p.id
          union all select created_at from comments where participant_id = p.id
          union all select created_at from photo_likes where participant_id = p.id
          union all select created_at from photo_dislikes where participant_id = p.id
        ) x)) as last_at
    from participants p
    join shares s on s.id = p.share_id
    join accounts a on a.id = s.agent_id
    left join visitors av on av.account_id = s.agent_id
    -- The agent's newest word on a home still on the link, since this person
    -- was on it: what they'd want to read first.
    left join lateral (
      select c.id, c.body, c.listing_key, l.data->>'UnparsedAddress' as address, c.created_at
      from comments c
      join share_listings sl on sl.share_id = c.share_id and sl.listing_key = c.listing_key and sl.removed_at is null
      join listings l on l.listing_key = c.listing_key
      where c.share_id = s.id and c.agent_id is not null and c.created_at > p.created_at
      order by c.created_at desc
      limit 1
    ) reply on true
    where p.account_id = ${accountId} and s.agent_id <> ${accountId}
    order by last_at desc`;
  return rows.map((row) => ({
    token: row.token,
    shareId: row.share_id,
    agent: {
      name: row.full_name.trim(),
      firstName: row.agent_first_name ?? agentFirstName(row.full_name),
      brokerage: row.brokerage.trim() || null,
      photo: row.agent_profile ? photoUrl(row.agent_profile, row.photo_v) : null,
      profileId: row.agent_profile,
    },
    homes: row.homes,
    unrated: row.unrated,
    firstPhoto: row.first_photo,
    cities: (row.cities ?? []).sort(),
    latestAgentReply:
      row.reply_id && row.reply_body && row.reply_key && row.reply_at
        ? {
            body: row.reply_body,
            listingKey: row.reply_key,
            address: row.reply_address ?? "",
            at: row.reply_at.toISOString(),
            commentId: row.reply_id,
          }
        : null,
    lastActivityAt: row.last_at.toISOString(),
  }));
});
