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
  // Whoever sent it (an agent, usually; anyone signed in can send homes):
  // their account, and whether they're a pro.
  agent: {
    accountId: string;
    isAgent: boolean;
    name: string;
    firstName: string;
    brokerage: string | null;
    photo: string | null;
    profileId: string | null;
  };
  // Everyone on the link, by first name (themselves included), and how many
  // there are in all (some may have given no name).
  people: number;
  names: string[];
  // Homes still on the link, and the ones they haven't reacted to yet.
  homes: number;
  unrated: number;
  firstPhoto: string | null;
  // The first home still waiting, to open the link on: not the ones they've
  // already rated. Null when there's none.
  firstWaiting: string | null;
  cities: string[];
  // (About a home still on the link, or, with no home, the link itself.)
  latestAgentReply: { body: string; listingKey: string | null; address: string; at: string; commentId: string } | null;
  lastActivityAt: string;
  // The last the sender did on it: added them or homes, or said something.
  senderAt: string;
};

type Row = {
  share_id: string;
  token: string;
  agent_id: string;
  agent_role: string | null;
  people: number;
  names: string[] | null;
  full_name: string;
  agent_first_name: string | null;
  brokerage: string;
  agent_profile: string | null;
  photo_v: string | null;
  homes: number;
  unrated: number;
  first_photo: string | null;
  first_waiting: string | null;
  cities: string[] | null;
  reply_id: string | null;
  reply_body: string | null;
  reply_key: string | null;
  reply_address: string | null;
  reply_at: Date | null;
  last_at: Date;
  sender_at: Date | null;
};

// Whether the person on the link (p) has rated a home on it (sl): the heart
// or the X, a specific liked or disliked, or a spot in a photo.
const rated = () => sql`(
  exists (
    select 1 from reactions r
    where r.participant_id = p.id and r.share_id = sl.share_id and r.listing_key = sl.listing_key
      and (r.reaction is not null or cardinality(r.liked) > 0 or cardinality(r.disliked) > 0))
  or exists (select 1 from photo_likes pl where pl.participant_id = p.id and pl.listing_key = sl.listing_key)
  or exists (select 1 from photo_dislikes pd where pd.participant_id = p.id and pd.listing_key = sl.listing_key)
)`;

// Newest activity first: something the agent said or added, something they
// did themselves, or the link reaching them. A link the account is the agent
// of is the agent's own, never one they're "on".
export const getMyLinks = cache(async (accountId: string): Promise<MyLink[]> => {
  const rows = await sql<Row[]>`
    select s.id as share_id, coalesce(p.token, s.token) as token,
      s.agent_id, a.role as agent_role,
      (select count(*)::int from participants x where x.share_id = s.id) as people,
      (select array_agg(btrim(x.first_name) order by x.invited_at nulls last, x.position nulls last, x.created_at)
         from participants x where x.share_id = s.id and btrim(x.first_name) <> '') as names,
      a.full_name, nullif(btrim(av.first_name), '') as agent_first_name, a.brokerage,
      av.id as agent_profile, case when av.id is not null then left(md5(a.photo_data_url), 10) end as photo_v,
      (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
      (select count(*)::int from share_listings sl
        where sl.share_id = s.id and sl.removed_at is null and not ${rated()}
      ) as unrated,
      -- A home still waiting, where there is one: the card says it's new.
      cover.photo as first_photo, case when not cover.rated then cover.listing_key end as first_waiting,
      (select array_agg(distinct l.data->>'City')
        from share_listings sl join listings l on l.listing_key = sl.listing_key
        where sl.share_id = s.id and sl.removed_at is null and l.data->>'City' is not null) as cities,
      reply.id as reply_id, reply.body as reply_body, reply.listing_key as reply_key,
      reply.address as reply_address, reply.created_at as reply_at,
      greatest(p.invited_at,
        (select max(sl.added_at) from share_listings sl where sl.share_id = s.id and sl.removed_at is null),
        (select max(c.created_at) from comments c where c.share_id = s.id and c.agent_id is not null)) as sender_at,
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
    left join lateral (
      select sl.listing_key, l.data->'Media'->0->>'MediaURL' as photo, ${rated()} as rated
      from share_listings sl join listings l on l.listing_key = sl.listing_key
      where sl.share_id = s.id and sl.removed_at is null
      order by 3, sl.position limit 1
    ) cover on true
    -- The agent's newest word on a home still on the link, since this person
    -- was on it: what they'd want to read first.
    left join lateral (
      select c.id, c.body, c.listing_key, l.data->>'UnparsedAddress' as address, c.created_at
      from comments c
      left join share_listings sl on sl.share_id = c.share_id and sl.listing_key = c.listing_key and sl.removed_at is null
      left join listings l on l.listing_key = c.listing_key
      where c.share_id = s.id and c.agent_id is not null and c.created_at > p.created_at
        and (c.listing_key is null or sl.listing_key is not null)
      order by c.created_at desc
      limit 1
    ) reply on true
    where p.account_id = ${accountId} and s.agent_id <> ${accountId}
    order by last_at desc`;
  return rows.map((row) => ({
    token: row.token,
    shareId: row.share_id,
    people: row.people,
    names: row.names ?? [],
    agent: {
      accountId: row.agent_id,
      isAgent: row.agent_role === "agent",
      name: row.full_name.trim(),
      firstName: row.agent_first_name ?? agentFirstName(row.full_name),
      brokerage: row.brokerage.trim() || null,
      photo: row.agent_profile ? photoUrl(row.agent_profile, row.photo_v) : null,
      profileId: row.agent_profile,
    },
    homes: row.homes,
    unrated: row.unrated,
    firstPhoto: row.first_photo,
    firstWaiting: row.first_waiting,
    cities: (row.cities ?? []).sort(),
    latestAgentReply:
      row.reply_id && row.reply_body && row.reply_at
        ? {
            body: row.reply_body,
            listingKey: row.reply_key,
            address: row.reply_address ?? "",
            at: row.reply_at.toISOString(),
            commentId: row.reply_id,
          }
        : null,
    lastActivityAt: row.last_at.toISOString(),
    senderAt: (row.sender_at ?? row.last_at).toISOString(),
  }));
});

// The links that still have a home waiting for their take: the only ones Home
// puts at the top. A link they've rated all of drops off it, and comes back
// when the agent adds a home.
export const waitingLinks = (links: MyLink[]) => links.filter((link) => link.unrated > 0);

// Whether they've rated anything their agents sent: Rated homes has something to show.
export const hasRated = (links: MyLink[]) => links.some((link) => link.homes > link.unrated);

// A home an agent sent them that they've made up their mind on, as Rated
// homes lists it. Only their own take (never the agent's notes or anyone
// else's), and only the agent's name, never their email or phone.
export type RatedHome = {
  listingKey: string;
  // Their link, to open the home on, where they can change their mind.
  token: string;
  verdict: "like" | "pass";
  address: string;
  city: string | null;
  price: number | null;
  photo: string | null;
  agentName: string;
  ratedAt: string;
};

type RatedRow = {
  listing_key: string;
  token: string;
  verdict: "like" | "pass";
  address: string | null;
  city: string | null;
  price: string | null;
  photo: string | null;
  full_name: string;
  agent_first_name: string | null;
  rated_at: Date;
};

// Newest first. Rated means what Home's count means (`rated`, above).
// Liked wins over passed the way the agent's Clients page reads it. A home
// sent on two links is listed once, by the newest take on it.
export const getRatedHomes = cache(async (accountId: string): Promise<RatedHome[]> => {
  const rows = await sql<RatedRow[]>`
    select * from (
      select distinct on (x.listing_key) x.*
      from (
        select sl.listing_key, coalesce(p.token, s.token) as token,
          case
            when r.reaction = 'like' then 'like'
            when r.reaction = 'dislike' then 'pass'
            when cardinality(r.liked) > 0 then 'like'
            when cardinality(r.disliked) > 0 then 'pass'
            when exists (select 1 from photo_likes pl where pl.participant_id = p.id and pl.listing_key = sl.listing_key) then 'like'
            when exists (select 1 from photo_dislikes pd where pd.participant_id = p.id and pd.listing_key = sl.listing_key) then 'pass'
          end as verdict,
          l.data->>'UnparsedAddress' as address, l.data->>'City' as city, l.data->>'ListPrice' as price,
          l.data->'Media'->0->>'MediaURL' as photo,
          a.full_name, nullif(btrim(av.first_name), '') as agent_first_name,
          greatest(r.updated_at,
            (select max(pl.created_at) from photo_likes pl where pl.participant_id = p.id and pl.listing_key = sl.listing_key),
            (select max(pd.created_at) from photo_dislikes pd where pd.participant_id = p.id and pd.listing_key = sl.listing_key)
          ) as rated_at
        from participants p
        join shares s on s.id = p.share_id
        join accounts a on a.id = s.agent_id
        left join visitors av on av.account_id = s.agent_id
        join share_listings sl on sl.share_id = s.id and sl.removed_at is null
        join listings l on l.listing_key = sl.listing_key
        left join reactions r on r.participant_id = p.id and r.share_id = s.id and r.listing_key = sl.listing_key
        where p.account_id = ${accountId} and s.agent_id <> ${accountId}
      ) x
      where x.verdict is not null
      order by x.listing_key, x.rated_at desc nulls last
    ) y
    order by y.rated_at desc nulls last`;
  return rows.map((row) => {
    const price = row.price === null ? NaN : Number(row.price);
    return {
      listingKey: row.listing_key,
      token: row.token,
      verdict: row.verdict,
      address: row.address?.trim() || "A home",
      city: row.city,
      price: Number.isFinite(price) && price > 0 ? price : null,
      photo: row.photo,
      agentName: row.agent_first_name ?? agentFirstName(row.full_name),
      ratedAt: row.rated_at.toISOString(),
    };
  });
});
