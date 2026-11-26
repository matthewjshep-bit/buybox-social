import { cache } from "react";
import type { Account } from "./auth";
import { getClientBook, type Client, type ClientLink, type ClientStatus } from "./clients";
import { sql } from "./db";
import { getMyLinks, type MyLink } from "./my-links";
import { peopleTitle } from "./people-picker";
import { photoUrl } from "./person-photo";
import { clientActivity, getHomeViews, getShareListings, getThread as getShareThread, homeViewKey } from "./shares";
import { ANONYMOUS_BUYER } from "./timeline";

// The street of an address: "5902 Lakeview Terrace SE".
const street = (address: string) => address.split(",")[0];

// What a request to see a home in person says in a link's thread (app/s/[token]/actions.ts).
const ASK_TO_SEE = "Can we see it in person?";

// Messages: every home someone sent or was sent, as conversations, the way a
// phone's messages are. One conversation per person (whoever sent whom: "I
// sent Bob homes" and "Bob sent me homes" are one thread), a link sent to
// two or more people is a conversation of its own, titled by their names,
// and a link with nobody on it yet is one too, titled by its first home. In
// a thread, each send is a message: the homes, each with what's happened to
// it under it (opened, liked or passed, what was said, a request to see
// it). Who sees what follows the links themselves: the sender sees opens,
// time spent and passes; someone sent homes sees their own take, others'
// likes, and the sender's words. Never an email or a phone, never a surname.

export type ThreadPerson = {
  name: string;
  photo: string | null;
  profileId: string | null;
  agent: boolean;
};

export type Thread = {
  // acct:<account>, name:<first name>, p:<participant> (lib/clients.ts personKeys), or link:<share>.
  key: string;
  href: string;
  title: string;
  people: ThreadPerson[];
  // A link sent to several people, or to nobody yet.
  group: boolean;
  // Whether the homes in it went from the viewer, to them, or both ways.
  direction: "sent" | "received" | "both";
  // Newest first.
  shareIds: string[];
  // The one line under the name.
  lastLine: string;
  lastAt: Date;
  // Something new since the viewer last looked (the sender's side, for now).
  unread: boolean;
  // Someone in it is waiting for the viewer's answer.
  waiting: boolean;
  counts: { homes: number; liked: number; comments: number };
};

export type ThreadHome = {
  key: string;
  // The card's id on the page: home-<key> on the newest send of the home,
  // home-<share>-<key> on an earlier one (a home sent twice is two cards).
  anchor: string;
  address: string;
  city: string;
  price: number;
  photo: string | null;
  // The sender's side: whether anyone has opened it, and time spent on it.
  opened: boolean;
  seconds: number;
  // Who liked it or passed on it (passes only on the sender's side, or the viewer's own).
  takes: { name: string; mine: boolean; verdict: "like" | "pass" }[];
  // Who asked to see it.
  asked: { name: string; mine: boolean; at: string }[];
};

// One send of homes, as a message in the conversation.
export type HomesItem = {
  kind: "homes";
  id: string;
  at: string;
  shareId: string;
  // Their own link, to open the homes on (the viewer's, when they were sent them).
  token: string;
  by: ThreadPerson;
  mine: boolean;
  welcome: string | null;
  homes: ThreadHome[];
};

// A word about no home in particular.
export type MessageItem = {
  kind: "message";
  id: string;
  at: string;
  shareId: string;
  by: ThreadPerson;
  mine: boolean;
  body: string;
};

// A word about one of the homes: a bubble in the conversation, like any
// other, quoting the home above it (as a reply to a story does).
export type CommentItem = {
  kind: "comment";
  id: string;
  at: string;
  shareId: string;
  by: ThreadPerson;
  mine: boolean;
  body: string;
  about: { key: string; anchor: string; address: string; photo: string | null };
  // Whose comment, or whose likes, it answers.
  replyTo: { name: string; likes: boolean } | null;
  // A request to see the home in person (ASK_TO_SEE), said in words.
  ask: boolean;
};

export type ThreadItem = HomesItem | MessageItem | CommentItem;

export type ThreadView = {
  thread: Thread;
  items: ThreadItem[];
  // The sender's side: what Reply answers (the newest thing waiting), if anything.
  reply: { shareId: string; listingKey: string } | null;
};

export const threadHref = (key: string) => `/messages/${encodeURIComponent(key)}`;

const newest = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

// The one line under a client's name: what's waiting first, as the Clients
// page says it, in fewer words.
function sentLine(status: ClientStatus): string {
  switch (status.kind) {
    case "ask":
      return `Wants to see ${street(status.address)}`;
    case "comment":
      return `“${status.body}”`;
    case "active":
      return "Looking now";
    case "liked":
      return `Liked ${status.n} of ${status.of} ${status.of === 1 ? "home" : "homes"}`;
    case "opened":
      return "Opened";
    case "unopened":
      return "Not opened yet";
  }
}

const homesWord = (n: number) => `${n} ${n === 1 ? "home" : "homes"}`;

const person = (client: Client): ThreadPerson => ({
  name: client.name,
  photo: client.photo,
  profileId: client.profileId,
  agent: false,
});

const sender = (link: MyLink): ThreadPerson => ({
  name: link.agent.name,
  photo: link.agent.photo,
  profileId: link.agent.profileId,
  agent: link.agent.isAgent,
});

// Everyone on a link, in the order they were added: a first name, the
// account they're on Porchcard with, and (to the link's sender only) their
// page and face, as the sender's list has them.
type OnLink = { id: string; share_id: string; name: string; account_id: string | null; profile: string | null; photo_v: string | null };

// Someone on a link, as a conversation shows them. Their face only to the
// one who sent it (as the rest of the sender's pages show it): someone else
// on the link sees a first name and an initial, never another's page.
const onLink = (row: OnLink, withFace: boolean): ThreadPerson => ({
  name: row.name || ANONYMOUS_BUYER,
  photo: withFace && row.profile ? photoUrl(row.profile, row.photo_v) : null,
  profileId: withFace ? row.profile : null,
  agent: false,
});

// The people on the viewer's links (sent or received), by link: once a
// request, for the list and the conversation open beside it.
const peopleOn = cache(async (accountId: string) => {
  const rows = await sql<OnLink[]>`
    select p.id, p.share_id, btrim(p.first_name) as name, p.account_id, v.id as profile,
      left(md5(acc.photo_data_url), 10) as photo_v
    from participants p
    left join visitors v on v.account_id = p.account_id
    left join accounts acc on acc.id = p.account_id
    where p.share_id in (
      select s.id from shares s where s.agent_id = ${accountId}
      union select x.share_id from participants x where x.account_id = ${accountId})
    order by p.invited_at nulls last, p.position nulls last, p.created_at, p.first_name`;
  const byLink = new Map<string, OnLink[]>();
  for (const row of rows) byLink.set(row.share_id, [...(byLink.get(row.share_id) ?? []), row]);
  return byLink;
});

// A link the viewer sent to several people, or to nobody yet: a thread of its own.
function groupThread(link: ClientLink, on: OnLink[]): Thread {
  const key = `link:${link.shareId}`;
  return {
    key,
    href: threadHref(key),
    title: link.title,
    people: on.filter((row) => row.name).map((row) => onLink(row, true)),
    group: true,
    direction: "sent",
    shareIds: [link.shareId],
    lastLine: link.waiting
      ? "Waiting for you"
      : !link.openedAt
        ? "Not opened yet"
        : link.liked > 0
          ? `Liked ${homesWord(link.liked)}`
          : "Opened",
    lastAt: newest(link.openedAt, link.sentAt) ?? link.sentAt,
    unread: link.unread,
    waiting: link.waiting,
    counts: { homes: link.homes, liked: link.liked, comments: link.comments },
  };
}

// Everyone's conversations with the viewer, the newest first.
export const getThreads = cache(async (me: Account): Promise<Thread[]> => {
  const [book, received, looked, people] = await Promise.all([
    getClientBook(me.id),
    getMyLinks(me.id),
    // When they last looked at each conversation they were sent homes in.
    sql<{ thread_key: string; seen_at: Date }[]>`select thread_key, seen_at from thread_seen where account_id = ${me.id}`,
    peopleOn(me.id),
  ]);
  const seenAt = new Map(looked.map((row) => [row.thread_key, row.seen_at]));
  // Something from the sender since they last looked (or ever, never having looked).
  const fresh = (key: string, link: MyLink) => {
    const seen = seenAt.get(key);
    return !seen || new Date(link.senderAt) > seen;
  };
  const threads = new Map<string, Thread>();

  // Homes the viewer sent: one thread per person, their links sent to them
  // alone; links to several people (or nobody yet) stand on their own.
  for (const link of book.links) {
    if (link.people !== 1) threads.set(`link:${link.shareId}`, groupThread(link, people.get(link.shareId) ?? []));
  }
  for (const client of book.clients) {
    const own = client.links.filter((link) => link.people === 1);
    if (own.length === 0) continue;
    threads.set(client.key, {
      key: client.key,
      href: threadHref(client.key),
      title: client.name,
      people: [person(client)],
      group: false,
      direction: "sent",
      shareIds: own.map((link) => link.shareId),
      lastLine: sentLine(client.status),
      lastAt: newest(client.lastActive, client.sentAt) ?? client.sentAt,
      unread: own.some((link) => link.unread),
      waiting: client.waiting,
      counts: {
        homes: own.reduce((sum, link) => sum + link.homes, 0),
        liked: own.reduce((sum, link) => sum + link.liked, 0),
        comments: own.reduce((sum, link) => sum + link.comments, 0),
      },
    });
  }

  // Homes the viewer was sent: from each sender, one thread (joining the one
  // where the viewer sent that same person homes); a link with others on it
  // is its own.
  for (const link of received) {
    const at = new Date(link.lastActivityAt);
    const line = link.latestAgentReply ? `“${link.latestAgentReply.body}”` : `Sent you ${homesWord(link.homes)}`;
    if (link.people > 1) {
      const key = `link:${link.shareId}`;
      // Named for whoever else is in it, the sender first, never the viewer
      // ("Jordan & Ben", to Nina), as a group on a phone is.
      const others = (people.get(link.shareId) ?? []).filter((row) => row.name && row.account_id !== me.id);
      threads.set(key, {
        key,
        href: threadHref(key),
        // (A sender with no name yet isn't "your agent": they're left out of the title.)
        title:
          peopleTitle([link.agent.name ? link.agent.firstName : "", ...others.map((row) => row.name)]) ||
          link.agent.name ||
          ANONYMOUS_BUYER,
        people: [sender(link), ...others.map((row) => onLink(row, false))],
        group: true,
        direction: "received",
        shareIds: [link.shareId],
        lastLine: line,
        lastAt: at,
        unread: fresh(key, link),
        waiting: false,
        counts: { homes: link.homes, liked: 0, comments: 0 },
      });
      continue;
    }
    const key = `acct:${link.agent.accountId}`;
    const have = threads.get(key);
    if (have) {
      have.direction = "both";
      have.shareIds = [...have.shareIds, link.shareId];
      have.unread ||= fresh(key, link);
      have.people = [{ ...have.people[0], agent: have.people[0].agent || link.agent.isAgent }];
      if (at > have.lastAt) {
        have.lastAt = at;
        have.lastLine = line;
      }
      have.counts.homes += link.homes;
      continue;
    }
    threads.set(key, {
      key,
      href: threadHref(key),
      title: link.agent.name,
      people: [sender(link)],
      group: false,
      direction: "received",
      shareIds: [link.shareId],
      lastLine: line,
      lastAt: at,
      unread: fresh(key, link),
      waiting: false,
      counts: { homes: link.homes, liked: 0, comments: 0 },
    });
  }

  return [...threads.values()].sort((a, b) => +b.lastAt - +a.lastAt);
});

// How many conversations have something new in them: the badge in the bar.
// (The sender's side: a link with something done on it since they last
// looked at it. Light enough to run on every page.)
export const countUnreadThreads = cache(async (accountId: string): Promise<number> => {
  const [[sent], [received]] = await Promise.all([
    // Links they sent, with something done on them since they last looked.
    sql<{ n: number }[]>`
      select count(*)::int as n from shares s
      cross join lateral (select max(a.at) as at from (${clientActivity()}) a where a.share_id = s.id) activity
      where s.agent_id = ${accountId} and coalesce(activity.at > s.agent_seen_at, activity.at is not null)`,
    // Conversations they were sent homes in, with something from the sender
    // since they last looked at that conversation (or never having looked).
    sql<{ n: number }[]>`
      select count(distinct x.key)::int as n from (
        select case when (select count(*) from participants o where o.share_id = s.id) > 1
                 then 'link:' || s.id else 'acct:' || s.agent_id end as key,
          greatest(p.invited_at,
            (select max(sl.added_at) from share_listings sl where sl.share_id = s.id and sl.removed_at is null),
            (select max(c.created_at) from comments c where c.share_id = s.id and c.agent_id is not null)) as at
        from participants p join shares s on s.id = p.share_id
        where p.account_id = ${accountId} and s.agent_id <> ${accountId}
      ) x
      left join thread_seen t on t.account_id = ${accountId} and t.thread_key = x.key
      where x.at is not null and (t.seen_at is null or x.at > t.seen_at)`,
  ]);
  return (sent?.n ?? 0) + (received?.n ?? 0);
});

type ShareRow = {
  id: string;
  token: string;
  agent_id: string;
  created_at: Date;
  note: string | null;
  opened_at: Date | null;
  full_name: string;
  role: string | null;
  profile: string | null;
  photo_v: string | null;
};

type AskRow = { share_id: string; listing_key: string; participant_id: string; first_name: string; asked_at: Date };

const listPrice = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// One conversation, read whole: every send in it as a message, newest last.
export const getThread = cache(async (me: Account, key: string): Promise<ThreadView | null> => {
  const thread = (await getThreads(me)).find((t) => t.key === key);
  if (!thread) return null;
  const ids = thread.shareIds;
  const [shares, mine, asks, views, listings, threads, words, people] = await Promise.all([
    sql<ShareRow[]>`
      select s.id, s.token, s.agent_id, s.created_at, s.note, a.full_name, a.role,
        (select max(o.last_at) from share_opens o where o.share_id = s.id) as opened_at,
        v.id as profile, left(md5(a.photo_data_url), 10) as photo_v
      from shares s join accounts a on a.id = s.agent_id left join visitors v on v.account_id = s.agent_id
      where s.id in ${sql(ids)}`,
    // The viewer's own places on these links (the ones they were sent).
    sql<{ id: string; share_id: string; token: string | null }[]>`
      select id, share_id, token from participants where share_id in ${sql(ids)} and account_id = ${me.id}`,
    sql<AskRow[]>`
      select a.share_id, a.listing_key, a.participant_id, p.first_name, a.asked_at
      from share_asks a join participants p on p.id = a.participant_id
      where a.share_id in ${sql(ids)} order by a.asked_at`,
    getHomeViews(ids),
    Promise.all(ids.map((id) => getShareListings(id))),
    Promise.all(ids.map((id) => getShareThread(id))),
    // Messages about no home: a word on the link itself, from either side.
    sql<{ id: string; share_id: string; participant_id: string | null; first_name: string | null; body: string; created_at: Date }[]>`
      select c.id, c.share_id, c.participant_id, p.first_name, c.body, c.created_at
      from comments c left join participants p on p.id = c.participant_id
      where c.share_id in ${sql(ids)} and c.listing_key is null
      order by c.created_at`,
    peopleOn(me.id),
  ]);
  const book = thread.direction === "received" ? null : await getClientBook(me.id);
  const shareOf = new Map(shares.map((share) => [share.id, share]));
  const myPlace = new Map(mine.map((row) => [row.share_id, row]));
  // Whoever sent a link, as the conversation names them.
  const senderOf = (share: ShareRow): ThreadPerson => ({
    name: share.full_name.trim(),
    photo: share.profile ? photoUrl(share.profile, share.photo_v) : null,
    profileId: share.profile,
    agent: share.role === "agent",
  });
  // Someone on one of these links, by their place on it: their face when
  // the viewer sent it (as the list has it), else a first name and initial.
  const placeOf = new Map([...people.values()].flat().map((row) => [row.id, row]));
  const someone = (share: ShareRow, participantId: string | null, name: string | null | undefined): ThreadPerson => {
    const row = participantId ? placeOf.get(participantId) : undefined;
    if (row) return onLink(row, share.agent_id === me.id);
    return { name: name?.trim() || ANONYMOUS_BUYER, photo: null, profileId: null, agent: false };
  };
  // Everything said about a home, each a bubble of its own among the sends.
  const saidAboutHomes: CommentItem[] = [];
  // Homes seen so far, newest send first: the first card of a home keeps the
  // plain anchor the bell and the feed link to.
  const cardsSoFar = new Set<string>();

  const items = ids.flatMap((shareId, i): ThreadItem[] => {
    const share = shareOf.get(shareId);
    if (!share) return [];
    const sentByMe = share.agent_id === me.id;
    const place = myPlace.get(shareId);
    const { comments, reactions, photoLikes, photoDislikes } = threads[i];
    const homes = listings[i].map((listing): ThreadHome => {
      const key = listing.ListingKey;
      const view = views.get(homeViewKey(shareId, key));
      // Each person's verdict on it: the heart or the X, else what they
      // liked or didn't in its photos.
      const verdicts = new Map<string, { name: string; mine: boolean; verdict: "like" | "pass" }>();
      const note = (participantId: string, name: string, verdict: "like" | "pass") => {
        if (!verdicts.has(participantId)) {
          verdicts.set(participantId, { name: name.trim() || ANONYMOUS_BUYER, mine: place?.id === participantId, verdict });
        }
      };
      for (const r of reactions.filter((r) => r.listingKey === key)) {
        if (r.state.reaction === "like" || r.state.liked.length > 0) note(r.participantId, r.name, "like");
        else if (r.state.reaction === "dislike" || r.state.disliked.length > 0) note(r.participantId, r.name, "pass");
      }
      for (const l of photoLikes.filter((l) => l.listingKey === key)) note(l.participantId, l.name, "like");
      for (const d of photoDislikes.filter((d) => d.listingKey === key)) note(d.participantId, d.name, "pass");
      // Someone sent the homes never sees who else passed: only likes, and their own take.
      const takes = [...verdicts.values()].filter((take) => sentByMe || take.mine || take.verdict === "like");
      const anchor = cardsSoFar.has(key) ? `home-${shareId}-${key}` : `home-${key}`;
      cardsSoFar.add(key);
      const home = { key, anchor, address: listing.UnparsedAddress, photo: listing.Media[0]?.MediaURL ?? null };
      const said = comments
        .filter((c) => c.listingKey === key)
        .map(
          (c): CommentItem => ({
            kind: "comment",
            id: c.id,
            at: c.createdAt,
            shareId,
            by: c.isAgent
              ? sentByMe
                ? { name: "You", photo: null, profileId: null, agent: me.role === "agent" }
                : senderOf(share)
              : someone(share, c.participantId, c.name),
            mine: c.isAgent ? sentByMe : place?.id === c.participantId,
            body: c.body,
            about: home,
            replyTo: c.replyTo ?? null,
            ask: c.body === ASK_TO_SEE,
          }),
        );
      saidAboutHomes.push(...said);
      const asked = asks
        .filter((ask) => ask.share_id === shareId && ask.listing_key === key)
        .map((ask) => ({
          name: ask.first_name.trim() || ANONYMOUS_BUYER,
          mine: place?.id === ask.participant_id,
          at: ask.asked_at.toISOString(),
        }));
      // (Anything done on it means it was open then, as the link counts it;
      // and a link with one home, opened, is that home opened.)
      const touched =
        verdicts.size > 0 || comments.some((c) => c.listingKey === key && !c.isAgent) || asked.length > 0 || (Boolean(share.opened_at) && listings[i].length === 1);
      return {
        key,
        anchor,
        address: listing.UnparsedAddress,
        city: listing.City,
        price: listPrice(listing.ListPrice),
        photo: listing.Media[0]?.MediaURL ?? null,
        opened: sentByMe ? Boolean(view) || touched : false,
        seconds: sentByMe ? (view?.seconds ?? 0) : 0,
        takes,
        asked,
      };
    });
    return [
      {
        kind: "homes",
        id: shareId,
        at: share.created_at.toISOString(),
        shareId,
        token: place?.token ?? share.token,
        by: sentByMe ? { name: "You", photo: null, profileId: null, agent: me.role === "agent" } : senderOf(share),
        mine: sentByMe,
        welcome: share.note?.trim() || null,
        homes,
      },
    ];
  });
  items.push(...saidAboutHomes);
  // The plain messages, each a bubble of its own, among the sends.
  for (const word of words) {
    const share = shareOf.get(word.share_id);
    if (!share) continue;
    const fromSender = word.participant_id === null;
    const place = myPlace.get(word.share_id);
    const mine = fromSender ? share.agent_id === me.id : place?.id === word.participant_id;
    items.push({
      kind: "message",
      id: word.id,
      at: word.created_at.toISOString(),
      shareId: word.share_id,
      by: fromSender ? senderOf(share) : someone(share, word.participant_id, word.first_name),
      mine,
      body: word.body,
    });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));

  // What Reply answers on the sender's side: the client's newest ask, else
  // the newest thing they said with no word back.
  const client = book?.clients.find((c) => c.key === key);
  const reply = client?.reply ? { shareId: client.reply.shareId, listingKey: client.reply.listingKey } : null;
  return { thread, items, reply };
});
