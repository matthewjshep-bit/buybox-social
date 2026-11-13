import { cache } from "react";
import { sql } from "./db";
import { linkTitle } from "./people-picker";
import { photoUrl } from "./person-photo";
import { clientActivity, getHomeViews, photosSeenLine } from "./shares";
import { ANONYMOUS_BUYER } from "./timeline";

// An agent's clients are people: everyone they've sent homes to, each once,
// with the links (packages of homes) they're on listed under them. Someone
// signed up is one person however many links they're on; someone known only
// by the first name the agent gave them is one person per name, and joins a
// signed-up client with that same first name when there's exactly one. A link
// with nobody on it yet isn't a person: it's listed apart, as a link.
// Only ever for the agent whose links they are: what's here (passes, time
// spent, who's on a link right now, requests to see a home) is theirs alone.

// One link (one send of homes), as it's listed under a person or on its own.
export type ClientLink = {
  shareId: string;
  // "Jenny & Mike", or "Link for 5902 Lakeview Terrace SE" with nobody on it.
  title: string;
  href: string;
  sentAt: Date;
  openedAt: Date | null;
  homes: number;
  // The first few homes' photos, in the link's order.
  photos: (string | null)[];
  firstAddress: string | null;
  // The others on it, by first name (not the person it's listed under).
  with: string[];
  unread: boolean;
  // "saw 3 of 4 photos": the most of it one of their devices looked at.
  seen: string | null;
};

export type ClientStatus =
  | { kind: "ask"; address: string; href: string }
  | { kind: "active" }
  | { kind: "comment"; body: string; href: string }
  | { kind: "liked"; n: number; of: number }
  | { kind: "opened" }
  | { kind: "unopened"; sentAt: Date };

export type Client = {
  // Stays the same between loads: acct:<account>, name:<first name>, or p:<participant>.
  key: string;
  name: string;
  photo: string | null;
  // Their public page, once they've signed up.
  profileId: string | null;
  // Where their name goes: their page, or else their newest link.
  href: string;
  participantIds: string[];
  // Newest first.
  links: ClientLink[];
  // Each home once, however many links it's on.
  homes: number;
  liked: number;
  passed: number;
  comments: number;
  // Requests to see a home in person the agent hasn't answered in its thread.
  asks: number;
  // Threads where what they said last has no word from the agent since.
  unanswered: number;
  opened: boolean;
  // The last thing they did (a like, a comment), or the last time they looked.
  lastActive: Date | null;
  sentAt: Date;
  // Something on one of their links the agent hasn't seen yet.
  unread: boolean;
  // On one of their links in the last few minutes.
  activeNow: boolean;
  // Time spent on their links, every visit and device together.
  seconds: number;
  // The one thing to say about them first.
  status: ClientStatus;
};

type ShareRow = {
  id: string;
  client_name: string;
  created_at: Date;
  homes: { key: string; address: string; photo: string | null }[];
  opened_at: Date | null;
  photos_seen: number;
  photo_count: number;
  unread: boolean;
  active_now: boolean;
};

type PersonRow = {
  id: string;
  share_id: string;
  first_name: string;
  account_id: string | null;
  profile: string | null;
  photo_v: string | null;
  liked_keys: string[];
  passed_keys: string[];
  comments: number;
  opened: boolean;
  last_active: Date | null;
  // Their newest comment that's still waiting for the agent, and how many are.
  unanswered: number;
  waiting_body: string | null;
  waiting_key: string | null;
  waiting_at: Date | null;
};

type AskRow = { participant_id: string; share_id: string; listing_key: string; address: string; at: Date };

// A long comment, cut to fit a line.
const clip = (body: string) => (body.length > 90 ? `${body.slice(0, 87).trimEnd()}…` : body);

const newest = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

// Every link the agent has sent, newest first, with its homes in order.
const loadShares = (agentId: string) => sql<ShareRow[]>`
  select s.id, s.client_name, s.created_at,
    (select coalesce(json_agg(json_build_object(
          'key', sl.listing_key, 'address', l.data->>'UnparsedAddress',
          'photo', l.data->'Media'->0->>'MediaURL'
        ) order by sl.position), '[]')
       from share_listings sl
       join listings l on l.listing_key = sl.listing_key
       where sl.share_id = s.id and sl.removed_at is null) as homes,
    -- Doing anything on a link means it was open then, so links sent before
    -- opens were counted don't read "Not opened yet" under their comments.
    greatest((select max(o.last_at) from share_opens o where o.share_id = s.id), activity.at) as opened_at,
    (select coalesce(max(o.photos_seen), 0)::int from share_opens o where o.share_id = s.id) as photos_seen,
    (select coalesce(sum(jsonb_array_length(l.data->'Media')), 0)::int
       from share_listings sl join listings l on l.listing_key = sl.listing_key
       where sl.share_id = s.id and sl.removed_at is null) as photo_count,
    coalesce(activity.at > s.agent_seen_at, activity.at is not null) as unread,
    exists (select 1 from share_home_views hv
            where hv.share_id = s.id and hv.last_at > now() - interval '3 minutes') as active_now
  from shares s
  cross join lateral (
    select max(a.at) as at from (${clientActivity()}) a where a.share_id = s.id
  ) activity
  where s.agent_id = ${agentId}
  order by s.created_at desc`;

// Everyone on the agent's links (never the agent themselves), in the order
// they were added, with what each of them did there: the homes they liked
// (the home, or something in it) and passed on (Not for me, or only
// dislikes), what they said, whether they've opened it, and when they were
// last on it.
const loadPeople = (agentId: string) => sql<PersonRow[]>`
  select p.id, p.share_id, p.first_name, p.account_id, v.id as profile,
    left(md5(acc.photo_data_url), 10) as photo_v,
    coalesce(verdicts.liked, '{}') as liked_keys,
    coalesce(verdicts.passed, '{}') as passed_keys,
    (select count(*)::int from comments c where c.participant_id = p.id) as comments,
    exists (select 1 from share_opens o where o.participant_id = p.id) as opened,
    greatest(
      (select max(o.last_at) from share_opens o where o.participant_id = p.id),
      (select max(a.at) from (${clientActivity()}) a where a.participant_id = p.id)
    ) as last_active,
    waiting.n as unanswered, waiting.body as waiting_body, waiting.listing_key as waiting_key, waiting.at as waiting_at
  from participants p
  join shares s on s.id = p.share_id
  left join visitors v on v.account_id = p.account_id
  left join accounts acc on acc.id = p.account_id
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
  cross join lateral (
    select count(*)::int as n,
      (array_agg(last.body order by last.created_at desc))[1] as body,
      (array_agg(last.listing_key order by last.created_at desc))[1] as listing_key,
      max(last.created_at) as at
    from (
      select distinct on (c.listing_key) c.listing_key, c.body, c.created_at
      from comments c
      where c.participant_id = p.id
      order by c.listing_key, c.created_at desc
    ) last
    where not exists (
      select 1 from comments r
      where r.share_id = p.share_id and r.listing_key = last.listing_key
        and r.agent_id is not null and r.created_at > last.created_at)
  ) waiting
  where s.agent_id = ${agentId} and (p.account_id is null or p.account_id <> s.agent_id)
  order by p.invited_at nulls last, p.position nulls last, p.created_at, p.first_name`;

// Requests to see a home in person that the agent hasn't answered yet: no
// word from them in that home's thread since.
const loadAsks = (agentId: string) => sql<AskRow[]>`
  select a.participant_id, a.share_id, a.listing_key, l.data->>'UnparsedAddress' as address, a.asked_at as at
  from share_asks a
  join shares s on s.id = a.share_id
  join share_listings sl on sl.share_id = a.share_id and sl.listing_key = a.listing_key and sl.removed_at is null
  join listings l on l.listing_key = a.listing_key
  where s.agent_id = ${agentId}
    and not exists (
      select 1 from comments r
      where r.share_id = a.share_id and r.listing_key = a.listing_key
        and r.agent_id is not null and r.created_at > a.asked_at)
  order by a.asked_at desc`;

const homeAnchor = (shareId: string, listingKey: string) =>
  `/dashboard/shares/${shareId}?tab=homes#home-${encodeURIComponent(listingKey)}`;

// Which person each participant is: their account, else their first name
// (joining the one signed-up client with that name, when there's just one),
// else, with no name at all, themselves.
function personKeys(people: PersonRow[]) {
  const accountsByName = new Map<string, Set<string>>();
  for (const p of people) {
    if (!p.account_id) continue;
    const name = p.first_name.trim().toLowerCase();
    if (name) accountsByName.set(name, (accountsByName.get(name) ?? new Set()).add(p.account_id));
  }
  return new Map(
    people.map((p) => {
      if (p.account_id) return [p.id, `acct:${p.account_id}`];
      const name = p.first_name.trim().toLowerCase();
      if (!name) return [p.id, `p:${p.id}`];
      const accounts = accountsByName.get(name);
      return [p.id, accounts?.size === 1 ? `acct:${[...accounts][0]}` : `name:${name}`];
    }),
  );
}

function statusOf(c: Omit<Client, "status">, ask: AskRow | undefined, waiting: PersonRow | undefined): ClientStatus {
  if (ask) return { kind: "ask", address: ask.address, href: homeAnchor(ask.share_id, ask.listing_key) };
  if (c.activeNow) return { kind: "active" };
  if (waiting?.waiting_body && waiting.waiting_key)
    return { kind: "comment", body: clip(waiting.waiting_body), href: homeAnchor(waiting.share_id, waiting.waiting_key) };
  if (c.liked > 0) return { kind: "liked", n: c.liked, of: c.homes };
  if (c.opened) return { kind: "opened" };
  return { kind: "unopened", sentAt: c.sentAt };
}

export type ClientBook = { clients: Client[]; unclaimed: ClientLink[] };

// Every client of this agent, once per request however many parts of the page ask.
export const getClientBook = cache(async (agentId: string): Promise<ClientBook> => {
  const [shares, people, asks] = await Promise.all([loadShares(agentId), loadPeople(agentId), loadAsks(agentId)]);
  const views = await getHomeViews(shares.map((share) => share.id));
  const secondsOf = new Map<string, number>();
  for (const [key, view] of views) {
    const shareId = key.slice(0, key.indexOf(":"));
    secondsOf.set(shareId, (secondsOf.get(shareId) ?? 0) + view.seconds);
  }
  const shareOf = new Map(shares.map((share) => [share.id, share]));
  const keyOf = personKeys(people);
  const onLink = new Map<string, PersonRow[]>();
  for (const p of people) onLink.set(p.share_id, [...(onLink.get(p.share_id) ?? []), p]);

  const linkFor = (share: ShareRow, others: string[]): ClientLink => ({
    shareId: share.id,
    title: linkTitle(share.client_name, share.homes[0]?.address),
    href: `/dashboard/shares/${share.id}`,
    sentAt: share.created_at,
    openedAt: share.opened_at,
    homes: share.homes.length,
    photos: share.homes.slice(0, 3).map((home) => home.photo),
    firstAddress: share.homes[0]?.address ?? null,
    with: others,
    unread: share.unread,
    seen: photosSeenLine(share.photos_seen, share.photo_count),
  });

  const groups = new Map<string, PersonRow[]>();
  for (const p of people) {
    if (!shareOf.has(p.share_id)) continue;
    const key = keyOf.get(p.id)!;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const clients = [...groups].map(([key, rows]): Client => {
    // Their links, newest first, each once.
    const linkIds = [...new Set(rows.map((row) => row.share_id))]
      .map((id) => shareOf.get(id)!)
      .sort((a, b) => +b.created_at - +a.created_at);
    const mine = new Set(rows.map((row) => row.id));
    const links = linkIds.map((share) =>
      linkFor(
        share,
        (onLink.get(share.id) ?? [])
          .filter((other) => !mine.has(other.id) && keyOf.get(other.id) !== key)
          .map((other) => other.first_name.trim())
          .filter(Boolean),
      ),
    );
    const homeKeys = new Set(linkIds.flatMap((share) => share.homes.map((home) => home.key)));
    const liked = new Set(rows.flatMap((row) => row.liked_keys));
    const passed = new Set(rows.flatMap((row) => row.passed_keys).filter((k) => !liked.has(k)));
    const signedUp = rows.find((row) => row.profile);
    const named = rows.find((row) => row.first_name.trim());
    const opened =
      rows.some((row) => row.opened || row.last_active) ||
      // On a link of their own, the link's opens are theirs.
      linkIds.some((share) => share.opened_at && (onLink.get(share.id)?.length ?? 0) === 1);
    const lastActive = rows.reduce<Date | null>((at, row) => newest(at, row.last_active), null);
    const waiting = rows
      .filter((row) => row.unanswered > 0)
      .sort((a, b) => +(b.waiting_at ?? 0) - +(a.waiting_at ?? 0))[0];
    const ids = new Set(rows.map((row) => row.id));
    const open = asks.filter((ask) => ids.has(ask.participant_id));
    const base = {
      key,
      name: named?.first_name.trim() || ANONYMOUS_BUYER,
      photo: signedUp?.profile ? photoUrl(signedUp.profile, signedUp.photo_v) : null,
      profileId: signedUp?.profile ?? null,
      href: signedUp?.profile ? `/people/${signedUp.profile}` : links[0].href,
      participantIds: rows.map((row) => row.id),
      links,
      homes: homeKeys.size,
      liked: [...liked].filter((k) => homeKeys.has(k)).length,
      passed: [...passed].filter((k) => homeKeys.has(k)).length,
      comments: rows.reduce((sum, row) => sum + row.comments, 0),
      asks: open.length,
      unanswered: rows.reduce((sum, row) => sum + row.unanswered, 0),
      opened,
      lastActive,
      sentAt: linkIds[0].created_at,
      unread: links.some((link) => link.unread),
      activeNow: linkIds.some((share) => share.active_now),
      seconds: linkIds.reduce((sum, share) => sum + (secondsOf.get(share.id) ?? 0), 0),
    };
    return { ...base, status: statusOf(base, open[0], waiting) };
  });

  // Whoever asked to see a home first, then anyone with something new, then
  // whoever was on theirs most recently (or was sent homes most recently).
  clients.sort(
    (a, b) =>
      Number(b.asks > 0) - Number(a.asks > 0) ||
      Number(b.activeNow) - Number(a.activeNow) ||
      Number(b.unread) - Number(a.unread) ||
      +(newest(b.lastActive, b.sentAt) ?? 0) - +(newest(a.lastActive, a.sentAt) ?? 0),
  );

  const unclaimed = shares.filter((share) => !onLink.has(share.id)).map((share) => linkFor(share, []));
  return { clients, unclaimed };
});

export type ClientFilterKey = "all" | "new" | "asks" | "commented" | "liked" | "unopened";

// The ways to see just some clients, with the count of each.
export const CLIENT_FILTERS: readonly { key: ClientFilterKey; label: string; test: (c: Client) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "new", label: "New activity", test: (c) => c.unread },
  { key: "asks", label: "Wants a showing", test: (c) => c.asks > 0 },
  { key: "commented", label: "Waiting on a reply", test: (c) => c.unanswered > 0 },
  { key: "liked", label: "Liked a home", test: (c) => c.liked > 0 },
  { key: "unopened", label: "Not opened", test: (c) => !c.opened },
];
