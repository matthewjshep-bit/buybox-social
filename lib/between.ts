import { cache } from "react";
import { sql } from "./db";
import { agentFirstName } from "./format";
import { linkTitle } from "./people-picker";

// What two people have between them on Porchcard: the agents' links they're
// both on. An agent and a client they sent homes to (either way round), or
// two people on the same link (a couple, house-hunting together). Only ever
// links the one looking is on, and only what they can see there anyway: the
// homes, and what the other person said on it.

export type BetweenLink = {
  shareId: string;
  // "from": they sent it to the one looking; "sent": the one looking sent it
  // to them; "together": both are on someone's link.
  kind: "from" | "sent" | "together";
  title: string;
  // Where it opens for the one looking: their own link, or (their own send) its page.
  href: string;
  // The agent who sent it, by first name.
  agentFirst: string;
  sentAt: Date;
  homes: number;
  photos: (string | null)[];
  // Homes the one looking hasn't reacted to yet (on a link they're on).
  unrated: number;
  // Homes the other person liked on it (when they're on it).
  theyLiked: number;
  // The last thing the other person said on it.
  said: { body: string; address: string; at: Date } | null;
  lastAt: Date;
};

type Row = {
  id: string;
  share_token: string;
  client_name: string;
  created_at: Date;
  agent_name: string;
  kind: BetweenLink["kind"];
  my_token: string | null;
  homes: number;
  photos: (string | null)[];
  first_address: string | null;
  unrated: number;
  they_liked: number;
  said_body: string | null;
  said_address: string | null;
  said_at: Date | null;
};

const MOST = 6;

// The links between `me` (the account looking) and `them` (the account
// behind the page), newest activity first.
export const getBetween = cache(async (me: string, them: string): Promise<BetweenLink[]> => {
  if (me === them) return [];
  const rows = await sql<Row[]>`
    select s.id, s.token as share_token, s.client_name, s.created_at, ag.full_name as agent_name,
      case when s.agent_id = ${me} then 'sent' when s.agent_id = ${them} then 'from' else 'together' end as kind,
      coalesce(mp.token, s.token) as my_token,
      (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
      (select coalesce(json_agg(x.photo), '[]') from (
          select l.data->'Media'->0->>'MediaURL' as photo
          from share_listings sl join listings l on l.listing_key = sl.listing_key
          where sl.share_id = s.id and sl.removed_at is null
          order by sl.position limit 3) x) as photos,
      (select l.data->>'UnparsedAddress'
         from share_listings sl join listings l on l.listing_key = sl.listing_key
         where sl.share_id = s.id and sl.removed_at is null
         order by sl.position limit 1) as first_address,
      case when mp.id is null then 0 else (
        select count(*)::int from share_listings sl
        where sl.share_id = s.id and sl.removed_at is null
          and not exists (
            select 1 from reactions r
            where r.participant_id = mp.id and r.share_id = s.id and r.listing_key = sl.listing_key
              and (r.reaction is not null or cardinality(r.liked) > 0 or cardinality(r.disliked) > 0))
          and not exists (
            select 1 from photo_likes pl where pl.participant_id = mp.id and pl.listing_key = sl.listing_key))
      end as unrated,
      case when tp.id is null then 0 else (
        select count(distinct k)::int from (
          select r.listing_key as k from reactions r where r.participant_id = tp.id and r.reaction = 'like'
          union select pl.listing_key from photo_likes pl where pl.participant_id = tp.id) liked
        join share_listings sl on sl.share_id = s.id and sl.listing_key = liked.k and sl.removed_at is null)
      end as they_liked,
      said.body as said_body, said.address as said_address, said.at as said_at
    from shares s
    join accounts ag on ag.id = s.agent_id
    left join lateral (
      select p.id, p.token from participants p
      where p.share_id = s.id and p.account_id = ${me} order by p.created_at limit 1) mp on true
    left join lateral (
      select p.id from participants p
      where p.share_id = s.id and p.account_id = ${them} order by p.created_at limit 1) tp on true
    -- What they said last on it: as its agent, or as someone on it.
    left join lateral (
      select c.body, l.data->>'UnparsedAddress' as address, c.created_at as at
      from comments c join listings l on l.listing_key = c.listing_key
      where c.share_id = s.id
        and (c.agent_id = ${them} or (tp.id is not null and c.participant_id = tp.id))
      order by c.created_at desc limit 1) said on true
    where (s.agent_id = ${me} and tp.id is not null)
       or (s.agent_id = ${them} and mp.id is not null)
       or (mp.id is not null and tp.id is not null)`;
  return rows
    .map((row): BetweenLink => {
      const said = row.said_body && row.said_at ? { body: row.said_body, address: row.said_address ?? "", at: row.said_at } : null;
      return {
        shareId: row.id,
        kind: row.kind,
        title: linkTitle(row.client_name, row.first_address),
        href: row.kind === "sent" ? `/dashboard/shares/${row.id}` : `/s/${row.my_token ?? row.share_token}`,
        agentFirst: agentFirstName(row.agent_name),
        sentAt: row.created_at,
        homes: row.homes,
        photos: row.photos,
        unrated: row.unrated,
        theyLiked: row.they_liked,
        said,
        lastAt: said && said.at > row.created_at ? said.at : row.created_at,
      };
    })
    .sort((a, b) => +b.lastAt - +a.lastAt)
    .slice(0, MOST);
});
