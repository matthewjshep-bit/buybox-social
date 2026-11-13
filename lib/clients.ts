import { cache } from "react";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { linkTitle } from "./people-picker";
import { photoUrl } from "./person-photo";
import type { ReactionState } from "./reactions";
import { clientActivity, describeTake, getHomeViews, homeViewKey } from "./shares";

// An agent's clients: everyone they've sent homes to, one entry per client,
// read once and shared by the dashboard and the agent's home. Links with the
// same name (any case) are one client, so a second link to Jenny lands on the
// same card; a link with nobody named on it is a client of its own. Only ever
// for the agent whose links they are: what's here (passes, time spent, who's
// on a link right now, requests to see a home) is theirs alone.

// Someone on one of the agent's links, as the agent may see them: a first
// name, and their own photo and page once they've signed up. Never an email.
export type ClientPerson = {
  participantId: string;
  shareId: string;
  name: string;
  profileId: string | null;
  photo: string | null;
};

export type AgentClient = {
  // Stays the same between loads: the name in lower case, or link:<id>.
  key: string;
  // The link's title ("Ben & Nina"), or "Link for <first address>" when it has
  // nobody on it yet. Never "Unnamed client".
  name: string;
  // Their page: the link with something new on it, or else the latest.
  href: string;
  shareIds: string[];
  people: ClientPerson[];
  sentAt: Date;
  openedAt: Date | null;
  lastActivity: Date | null;
  // Something they did that the agent hasn't seen yet.
  unread: boolean;
  // On one of their links in the last few minutes.
  activeNow: boolean;
  // Requests to see a home that the agent hasn't answered in that home's thread.
  asks: number;
  comments: number;
  // Homes at least one of them liked.
  likedHomes: number;
  // Each home once, with the link it was taken from (the newest that has it),
  // so a thumbnail opens that link rather than whichever is the client's page.
  homes: {
    key: string;
    shareId: string;
    address: string;
    photo: string | null;
    liked: number;
    passed: number;
    seconds: number;
  }[];
  // The one thing to say first: an open request to see a home, or else the
  // newest thing they did. `what` is the rest of the sentence after the name
  // ("commented: “…”", "liked the kitchen"); for an ask it names the home
  // itself ("asked to see 1204 Quillan St SE"), so it reads alone. `shareId`
  // is the link it happened on, which may not be the client's page.
  latest: {
    kind: "comment" | "like" | "pass" | "ask";
    shareId: string;
    name: string;
    what: string;
    address: string;
    at: Date;
    listingKey: string;
    commentId: string | null;
  } | null;
  // How much of what they were sent they've looked at (the most photos one of
  // their devices saw, of all the photos on their links), and for how long.
  photosSeen: number;
  photoCount: number;
  seconds: number;
};

type Home = { key: string; address: string; photo: string | null; liked: number; passed: number };

type ShareRow = {
  id: string;
  client_name: string;
  created_at: Date;
  homes: Home[];
  comment_count: number;
  opened_at: Date | null;
  // The most photos anyone has looked at on it, of all it has.
  photos_seen: number;
  photo_count: number;
  last_activity: Date | null;
  unread: boolean;
  active_now: boolean;
};

type Latest = NonNullable<AgentClient["latest"]>;
type News = { shareId: string; at: Date; latest: Latest };

type Mark = { media: string; tag: string };

// A long comment, cut to fit a line or two.
const clip = (body: string) => (body.length > 90 ? `${body.slice(0, 87).trimEnd()}…` : body);

// Every link the agent has sent, newest first. Per home, each person on the
// link once: liked (the home, or something in it) or passed (Not for me, or
// only dislikes), as on the client's page.
const loadShares = (agentId: string) => sql<ShareRow[]>`
  select s.id, s.client_name, s.created_at,
    (select coalesce(json_agg(json_build_object(
          'key', sl.listing_key, 'address', l.data->>'UnparsedAddress',
          'photo', l.data->'Media'->0->>'MediaURL',
          'liked', v.liked, 'passed', v.passed
        ) order by sl.position), '[]')
       from share_listings sl
       join listings l on l.listing_key = sl.listing_key
       cross join lateral (
         select count(*) filter (where verdict = 'like')::int as liked,
                count(*) filter (where verdict = 'pass')::int as passed
         from (
           select case
             when r.reaction = 'like' then 'like'
             when r.reaction = 'dislike' then 'pass'
             when exists (select 1 from photo_likes pl
                          where pl.participant_id = p.id and pl.listing_key = sl.listing_key) then 'like'
             when exists (select 1 from photo_dislikes pd
                          where pd.participant_id = p.id and pd.listing_key = sl.listing_key) then 'pass'
           end as verdict
           from participants p
           left join reactions r
             on r.participant_id = p.id and r.share_id = sl.share_id and r.listing_key = sl.listing_key
           where p.share_id = sl.share_id
         ) person
       ) v
       where sl.share_id = s.id and sl.removed_at is null) as homes,
    (select count(*)::int from comments c where c.share_id = s.id and c.agent_id is null) as comment_count,
    -- Doing anything on a link means it was open then, so links sent before
    -- opens were counted don't read "Not opened yet" under their comments.
    greatest((select max(o.last_at) from share_opens o where o.share_id = s.id), activity.at) as opened_at,
    (select coalesce(max(o.photos_seen), 0)::int from share_opens o where o.share_id = s.id) as photos_seen,
    (select coalesce(sum(jsonb_array_length(l.data->'Media')), 0)::int
       from share_listings sl join listings l on l.listing_key = sl.listing_key
       where sl.share_id = s.id and sl.removed_at is null) as photo_count,
    activity.at as last_activity,
    coalesce(activity.at > s.agent_seen_at, activity.at is not null) as unread,
    exists (select 1 from share_home_views hv
            where hv.share_id = s.id and hv.last_at > now() - interval '3 minutes') as active_now
  from shares s
  cross join lateral (
    select max(a.at) as at from (${clientActivity()}) a where a.share_id = s.id
  ) activity
  where s.agent_id = ${agentId}
  order by s.created_at desc`;

// Everyone on the agent's links, in the order they were added, with their
// page and photo once they've signed up. Never the agent themselves.
const loadPeople = (agentId: string) => sql<
  { id: string; share_id: string; first_name: string; profile: string | null; photo_v: string | null }[]
>`
  select p.id, p.share_id, p.first_name, v.id as profile, left(md5(acc.photo_data_url), 10) as photo_v
  from participants p
  join shares s on s.id = p.share_id
  left join visitors v on v.account_id = p.account_id
  left join accounts acc on acc.id = p.account_id
  where s.agent_id = ${agentId} and (p.account_id is null or p.account_id <> s.agent_id)
  order by p.invited_at nulls last, p.created_at, p.first_name`;

// Requests to see a home in person that the agent hasn't answered yet: no
// word from them in that home's thread since. The ask posts its own comment
// in the same moment, which is the one to open.
const loadAsks = (agentId: string) => sql<
  { share_id: string; listing_key: string; first_name: string; address: string; at: Date; comment_id: string | null }[]
>`
  select a.share_id, a.listing_key, p.first_name, l.data->>'UnparsedAddress' as address, a.asked_at as at,
    (select c.id from comments c
      where c.share_id = a.share_id and c.listing_key = a.listing_key
        and c.participant_id = a.participant_id and c.created_at = a.asked_at
      limit 1) as comment_id
  from share_asks a
  join shares s on s.id = a.share_id
  join participants p on p.id = a.participant_id
  join share_listings sl on sl.share_id = a.share_id and sl.listing_key = a.listing_key and sl.removed_at is null
  join listings l on l.listing_key = a.listing_key
  where s.agent_id = ${agentId}
    and not exists (
      select 1 from comments r
      where r.share_id = a.share_id and r.listing_key = a.listing_key
        and r.agent_id is not null and r.created_at > a.asked_at)
  order by a.asked_at desc`;

// The newest things clients did, link by link: a person's take on a home
// (their verdict and what they liked or not in it) as one, each comment on
// its own.
async function latestNews(agentId: string): Promise<News[]> {
  const [comments, takes] = await Promise.all([
    sql<{ id: string; share_id: string; listing_key: string; first_name: string; body: string; address: string; at: Date }[]>`
      select distinct on (c.share_id) c.id, c.share_id, c.listing_key, p.first_name, c.body,
        l.data->>'UnparsedAddress' as address, c.created_at as at
      from comments c
      join shares s on s.id = c.share_id
      join participants p on p.id = c.participant_id
      join listings l on l.listing_key = c.listing_key
      where s.agent_id = ${agentId}
      order by c.share_id, c.created_at desc`,
    sql<
      ({ share_id: string; first_name: string; data: Listing; at: Date; photo_likes: Mark[]; photo_dislikes: Mark[] } &
        ReactionState)[]
    >`
      select t.share_id, p.first_name, l.data, t.at,
        r.reaction, coalesce(r.liked, '{}') as liked, coalesce(r.disliked, '{}') as disliked,
        (select coalesce(json_agg(json_build_object('media', pl.media_key, 'tag', pl.tag) order by pl.created_at), '[]')
           from photo_likes pl
           where pl.participant_id = t.participant_id and pl.listing_key = t.listing_key) as photo_likes,
        (select coalesce(json_agg(json_build_object('media', pd.media_key, 'tag', pd.tag) order by pd.created_at), '[]')
           from photo_dislikes pd
           where pd.participant_id = t.participant_id and pd.listing_key = t.listing_key) as photo_dislikes
      from (
        select distinct on (a.share_id) a.share_id, a.listing_key, a.participant_id, a.at
        from (
          select share_id, listing_key, participant_id, updated_at as at from reactions
          union all
          select share_id, listing_key, participant_id, created_at from photo_likes
          union all
          select share_id, listing_key, participant_id, created_at from photo_dislikes
        ) a
        join shares s on s.id = a.share_id
        where s.agent_id = ${agentId}
        order by a.share_id, a.at desc
      ) t
      join participants p on p.id = t.participant_id
      join listings l on l.listing_key = t.listing_key
      left join reactions r
        on r.share_id = t.share_id and r.listing_key = t.listing_key and r.participant_id = t.participant_id`,
  ]);
  return [
    ...comments.map(
      (c): News => ({
        shareId: c.share_id,
        at: c.at,
        latest: {
          kind: "comment",
          shareId: c.share_id,
          name: c.first_name,
          what: `commented: “${clip(c.body)}”`,
          address: c.address,
          at: c.at,
          listingKey: c.listing_key,
          commentId: c.id,
        },
      }),
    ),
    ...takes.map((t): News => {
      const passed = t.reaction === "dislike" || (!t.reaction && t.photo_likes.length === 0 && t.photo_dislikes.length > 0);
      return {
        shareId: t.share_id,
        at: t.at,
        latest: {
          kind: passed ? "pass" : "like",
          shareId: t.share_id,
          name: t.first_name,
          what: describeTake(
            t.data,
            { reaction: t.reaction, liked: t.liked, disliked: t.disliked },
            t.photo_likes.map((m) => ({ mediaKey: m.media, tag: m.tag })),
            t.photo_dislikes.map((m) => ({ mediaKey: m.media, tag: m.tag })),
          )
            .replace(/^liked this(?=,|$)/, "liked this home")
            .replace(/^passed on this$/, "passed on this home"),
          address: t.data.UnparsedAddress,
          at: t.at,
          listingKey: t.data.ListingKey,
          commentId: null,
        },
      };
    }),
  ];
}

const newest = (date: Date | null, other: Date | null) => (!date ? other : !other ? date : date > other ? date : other);

// Links with the same name (any case) are one client; a link with nobody on
// it yet is a client of its own. Anyone with something new first, then
// whoever was on theirs most recently.
function clientsFrom(
  shares: ShareRow[],
  people: Awaited<ReturnType<typeof loadPeople>>,
  asks: Awaited<ReturnType<typeof loadAsks>>,
  news: News[],
  seconds: Map<string, number>,
): AgentClient[] {
  const groups = new Map<string, ShareRow[]>();
  for (const share of shares) {
    const key = share.client_name.trim().toLowerCase() || `link:${share.id}`;
    groups.set(key, [...(groups.get(key) ?? []), share]);
  }
  return [...groups]
    .map(([key, links]): AgentClient => {
      const ids = new Set(links.map((link) => link.id));
      const busiest = [...links].sort(
        (a, b) => (b.last_activity ?? b.created_at).getTime() - (a.last_activity ?? a.created_at).getTime(),
      );
      const homes: AgentClient["homes"] = [];
      for (const link of links) {
        for (const home of link.homes) {
          if (homes.some((h) => h.key === home.key)) continue;
          homes.push({ ...home, shareId: link.id, seconds: seconds.get(homeViewKey(link.id, home.key)) ?? 0 });
        }
      }
      // Each person once, from their busiest link: the same account on two
      // links is one face, and so is the same name with no account.
      const faces: ClientPerson[] = [];
      for (const link of busiest) {
        for (const person of people.filter((p) => p.share_id === link.id)) {
          const same = (face: ClientPerson) =>
            person.profile ? face.profileId === person.profile : face.name.toLowerCase() === person.first_name.trim().toLowerCase();
          if (faces.some(same)) continue;
          faces.push({
            participantId: person.id,
            shareId: link.id,
            name: person.first_name.trim(),
            profileId: person.profile,
            photo: person.profile ? photoUrl(person.profile, person.photo_v) : null,
          });
        }
      }
      const open = asks.filter((ask) => ids.has(ask.share_id));
      const said = news.filter((item) => ids.has(item.shareId)).sort((a, b) => b.at.getTime() - a.at.getTime());
      // An open request to see a home says more than any like or pass.
      const ask = open[0];
      const latest: Latest | null = ask
        ? {
            kind: "ask",
            shareId: ask.share_id,
            name: ask.first_name,
            what: `asked to see ${ask.address}`,
            address: ask.address,
            at: ask.at,
            listingKey: ask.listing_key,
            commentId: ask.comment_id,
          }
        : (said[0]?.latest ?? null);
      return {
        key,
        name: linkTitle(links[0].client_name, links[0].homes[0]?.address),
        href: `/dashboard/shares/${(busiest.find((link) => link.unread) ?? busiest[0]).id}`,
        shareIds: links.map((link) => link.id),
        people: faces,
        sentAt: links.reduce((at, link) => (link.created_at > at ? link.created_at : at), links[0].created_at),
        openedAt: links.reduce<Date | null>((at, link) => newest(at, link.opened_at), null),
        lastActivity: links.reduce<Date | null>((at, link) => newest(at, link.last_activity), null),
        unread: links.some((link) => link.unread),
        activeNow: links.some((link) => link.active_now),
        asks: open.length,
        comments: links.reduce((sum, link) => sum + link.comment_count, 0),
        likedHomes: homes.filter((home) => home.liked > 0).length,
        homes,
        latest,
        photosSeen: links.reduce((sum, link) => sum + Math.min(link.photos_seen, link.photo_count), 0),
        photoCount: links.reduce((sum, link) => sum + link.photo_count, 0),
        seconds: homes.reduce((sum, home) => sum + home.seconds, 0),
      };
    })
    .sort(
      (a, b) =>
        Number(b.unread) - Number(a.unread) ||
        (newest(b.lastActivity, b.openedAt) ?? b.sentAt).getTime() - (newest(a.lastActivity, a.openedAt) ?? a.sentAt).getTime(),
    );
}

// Every client of this agent, once per request however many parts of the page ask.
export const getClients = cache(async (agentId: string): Promise<AgentClient[]> => {
  const [shares, people, asks, news] = await Promise.all([
    loadShares(agentId),
    loadPeople(agentId),
    loadAsks(agentId),
    latestNews(agentId),
  ]);
  const views = await getHomeViews(shares.map((share) => share.id));
  const seconds = new Map([...views].map(([key, view]) => [key, view.seconds]));
  return clientsFrom(shares, people, asks, news, seconds);
});

export type ClientFilterKey = "all" | "new" | "asks" | "unopened" | "liked" | "commented";

// The ways to see just some clients, with the count of each: the dashboard's
// tiles, and the same numbers wherever else they're shown.
export const CLIENT_FILTERS: readonly { key: ClientFilterKey; label: string; test: (c: AgentClient) => boolean }[] = [
  { key: "all", label: "All clients", test: () => true },
  { key: "new", label: "New activity", test: (c) => c.unread },
  { key: "asks", label: "Wants a showing", test: (c) => c.asks > 0 },
  { key: "unopened", label: "Not opened yet", test: (c) => !c.openedAt },
  { key: "liked", label: "Liked a home", test: (c) => c.likedHomes > 0 },
  { key: "commented", label: "Commented", test: (c) => c.comments > 0 },
];
