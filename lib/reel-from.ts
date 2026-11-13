import { z } from "zod";
import { getCurrentUser, type Account } from "./auth";
import { sql } from "./db";
import { readDevice } from "./engagement";
import { follows } from "./follows";
import { feedKeys, getHomeFeed, getPicks, type FeedWho } from "./home-feed";
import type { Listing } from "./listings/types";
import { photoUrl } from "./person-photo";
import { FACTS, mediaKeyOf, spotName, tagPhrase } from "./photos";
import {
  buildCards,
  filterCards,
  getProfilePerson,
  getProfileRows,
  getProfileSummary,
  isProfileShow,
  isTopicSide,
  parseAbout,
  PROFILE_FILTERS,
  withoutPasses,
  type ProfileCard,
  type ProfileShow,
  type TopicSide,
} from "./profile";
import { getPublicIdentity } from "./public";
import { NO_REACTION, type ReactionState } from "./reactions";
import {
  clipTake,
  filterParams,
  takeFromCards,
  TAKE_COMMENTS,
  TAKE_SPOTS,
  type ContextSpot,
  type ContextTake,
  type ContextWho,
  type HomeContext,
  type ReelContext,
} from "./reel-context";
import { describeTake } from "./shares";
import { ANONYMOUS_BUYER } from "./timeline";
import { yourClient } from "./your-client";

// The homes a feed opens full screen (or in the pop-out over it), in its
// order, the way back to it, and what it's about (whose homes, and the take
// on each), for whoever's looking. `from`:
// - a page's id: the homes on someone's page, exactly as this viewer sees it,
//   with the same filter (`show`, `about`, `side`), in the page's order;
// - "feed": your home feed's homes (signed in);
// - "picks": homes picked for you (signed in);
// - "client:<participant>": every home an agent sent that client (the agent only);
// - "share:<link>": the homes on one of an agent's links (the agent only).
// Null for anything else, or anything this viewer may not open.

// The page's filters as an address has them, before they're checked.
export type ReelFilters = { show?: string | null; about?: string | null; side?: string | null };

// The same, checked against the page: only what the page itself would show.
export type CheckedFilters = { show: ProfileShow; about: string | null; side: TopicSide | null };

export type ReelScope = {
  keys: string[];
  back: { href: string; label: string };
  context: ReelContext;
  // What the address says after `/reel?`, but for the home: `from` and the
  // filters that hold.
  query: string;
  filters: CheckedFilters;
};

const ALL: CheckedFilters = { show: "all", about: null, side: null };

const text = (value: unknown) => (typeof value === "string" ? value : null);

// The filters in a page's address (`?show=comments&about=kitchen`), unchecked.
export const filtersOf = (params: Record<string, string | string[] | undefined>): ReelFilters => ({
  show: text(params.show),
  about: text(params.about),
  side: text(params.side),
});

const possessive = (name: string) => `${name}'s`;

export async function homesFrom(from: string, filters: ReelFilters = {}): Promise<ReelScope | null> {
  if (typeof from !== "string" || from.length > 64) return null;
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor } = await getPublicIdentity(viewer, device);
  const visitorId = visitor?.id ?? null;
  if (from === "feed") return viewer ? feedScope(viewer, visitorId) : null;
  if (from === "picks") return viewer ? picksScope(viewer, device, visitorId) : null;
  if (from.startsWith("client:")) return viewer?.role === "agent" ? clientScope(viewer, from.slice(7)) : null;
  if (from.startsWith("share:")) return viewer?.role === "agent" ? shareScope(viewer, from.slice(6)) : null;
  return personScope(from, filters ?? {}, viewer, visitorId);
}

// Your feed: what people you follow liked and said, home by home, in its order.
async function feedScope(viewer: Account, visitorId: string | null): Promise<ReelScope> {
  const entries = await getHomeFeed(viewer, visitorId);
  const homes: Record<string, HomeContext> = {};
  for (const entry of entries) {
    const key = entry.home.key;
    if (homes[key]) continue;
    const { why } = entry;
    const lead = why.who[0];
    // What was said, newest first in the feed: the last few, oldest first here.
    const quotes = why.quotes.slice(0, TAKE_COMMENTS).reverse();
    homes[key] = {
      photo: why.photo,
      takes: lead
        ? [
            {
              who: { ...whoOfFeed(lead), name: namesOf(why.who) },
              sentence: why.sentence,
              at: entry.at,
              verdict: entry.liked ? "like" : null,
              spots: [],
              facts: [],
              comments: quotes.map((quote) => ({
                id: "",
                body: clipTake(quote.replace(/^[“"]|[”"]$/g, "")),
                spot: null,
                likes: 0,
                replies: 0,
              })),
              ...(why.quotes.length > quotes.length && { moreComments: why.quotes.length - quotes.length }),
              private: false,
              reason: "who you follow",
            },
          ]
        : [],
    };
  }
  const keys = feedKeys(entries);
  return {
    keys,
    back: { href: "/", label: "Back to your feed" },
    context: { kind: "feed", title: "Your feed", who: null, filter: null, keys, homes, href: "/" },
    query: new URLSearchParams({ from: "feed" }).toString(),
    filters: ALL,
  };
}

const whoOfFeed = (who: FeedWho): ContextWho => ({
  name: who.name,
  profileId: who.profileId,
  photo: who.photo,
  agent: who.agent,
});

// "Matthew", "Matthew and Eva", "Matthew, Eva and 2 others"
function namesOf(people: FeedWho[]) {
  const names = people.map((person) => person.name.trim() || (person.agent ? "An agent" : ANONYMOUS_BUYER));
  if (names.length <= 1) return names[0] ?? ANONYMOUS_BUYER;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? "other" : "others"}`;
}

// Homes picked for you, as your home page shows them, each with why.
async function picksScope(viewer: Account, device: string | undefined, visitorId: string | null): Promise<ReelScope> {
  const posts = await getPicks(viewer, device, visitorId);
  const keys = posts.map((post) => post.listing.ListingKey);
  const homes = Object.fromEntries(
    posts.map((post): [string, HomeContext] => [post.listing.ListingKey, { takes: [], photo: null, forYou: post.reasons }]),
  );
  return {
    keys,
    back: { href: "/", label: "Back to your feed" },
    context: { kind: "pick", title: "Picked for you", who: null, filter: null, keys, homes, href: "/" },
    query: new URLSearchParams({ from: "picks" }).toString(),
    filters: ALL,
  };
}

// Someone's page, as this viewer sees it: every card it could show (not only
// the first page of them) under the same filter, in the page's order, each
// home once, with their take on it.
async function personScope(
  id: string,
  raw: ReelFilters,
  viewer: Account | null,
  visitorId: string | null,
): Promise<ReelScope | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const person = await getProfilePerson(id);
  if (!person) return null;
  const isMe = visitorId === person.id;
  // What they pass on is theirs to keep from everyone else.
  const passes = isMe || !person.hidePasses;
  const [rows, summary, client, following] = await Promise.all([
    getProfileRows(person.id, isMe),
    getProfileSummary(person.id, isMe, passes),
    viewer?.role === "agent" && !isMe ? yourClient(viewer.id, person.id) : null,
    follows(visitorId, person.id),
  ]);
  // The filters, checked as the page checks them.
  const show: ProfileShow = isProfileShow(raw.show) ? raw.show : "all";
  const topic = parseAbout(raw.about);
  const label = topic ? summary.topics.get(topic.toLowerCase()) : undefined;
  const about = label ? topic : null;
  const side: TopicSide | null = about && isTopicSide(raw.side) && (passes || raw.side === "like") ? raw.side : null;
  const filters: CheckedFilters = { show, about, side };
  // Their passes, asked for by someone they keep them from: the page shows none.
  const keptPrivate = show === "passed" && !passes;
  const cards = keptPrivate ? [] : filterCards(buildCards(passes ? rows : withoutPasses(rows)), show, about, side);

  // As their page calls them: an agent's own client by the name the agent
  // gave them, when they've none of their own yet.
  const name = person.name.trim() || client?.firstName || (person.isAgent ? "An agent" : ANONYMOUS_BUYER);
  const who: ContextWho = { name: isMe ? "You" : name, profileId: person.id, photo: person.photo, agent: person.isAgent };
  const byHome = new Map<string, ProfileCard[]>();
  for (const card of cards) byHome.set(card.home.key, [...(byHome.get(card.home.key) ?? []), card]);
  const passList = show === "passed" || side === "pass";
  const homes: Record<string, HomeContext> = {};
  for (const [key, list] of byHome) {
    const take = takeFromCards(list, who, { owner: isMe, passList });
    homes[key] = { takes: take ? [take] : [], photo: list[0].photo?.index ?? null };
  }
  const keys = [...byHome.keys()];

  const params = filterParams(filters);
  const pageHref = `/people/${person.id}${params.length ? `?${new URLSearchParams(params)}` : ""}`;
  const what = show === "comments" ? "comments" : show === "liked" ? "likes" : show === "passed" ? "passes" : null;
  const title = label ? `${isMe ? "You" : name} · ${label}` : `${isMe ? "Your" : possessive(name)} ${what ?? "highlights"}`;
  const back = `Back to ${isMe ? "your" : possessive(name)} ${what ?? "page"}`;
  return {
    keys,
    back: { href: pageHref, label: back },
    context: {
      kind: "person",
      title,
      who,
      filter: label ?? (show === "all" ? null : PROFILE_FILTERS[show]),
      ...(show !== "all" && { show }),
      keys,
      homes,
      href: pageHref,
      name,
      me: isMe,
      following,
      canFollow: Boolean(viewer),
    },
    query: new URLSearchParams([["from", person.id], ...params]).toString(),
    filters,
  };
}

// One of an agent's clients: every home they were sent, on any of this
// agent's links (each of their places on those links, once they've signed
// in), what they did something with first, newest first, then the rest of
// what's still on their links, in the order the agent put them. Only that
// agent may open it, and the takes are theirs alone to see.
async function clientScope(agent: Account, participantId: string): Promise<ReelScope | null> {
  if (!z.uuid().safeParse(participantId).success) return null;
  const [them] = await sql<{ id: string; account_id: string | null; share_id: string; first_name: string }[]>`
    select p.id, p.account_id, s.id as share_id, p.first_name
    from participants p join shares s on s.id = p.share_id
    where p.id = ${participantId} and s.agent_id = ${agent.id}`;
  if (!them) return null;
  const people = await linkPeople(agent.id, { participant: them.id, account: them.account_id });
  const ids = people.map((person) => person.id);
  const shareIds = [...new Set(people.map((person) => person.share_id))];
  const [acted, sent] = await Promise.all([
    sql<{ listing_key: string }[]>`
      select listing_key from (
        select listing_key, updated_at as at from reactions where participant_id in ${sql(ids)}
        union all select listing_key, created_at from photo_likes where participant_id in ${sql(ids)}
        union all select listing_key, created_at from photo_dislikes where participant_id in ${sql(ids)}
        union all select listing_key, created_at from comments where participant_id in ${sql(ids)}
      ) a
      group by listing_key
      order by max(at) desc, listing_key`,
    sql<{ listing_key: string }[]>`
      select sl.listing_key
      from share_listings sl join shares s on s.id = sl.share_id
      where sl.share_id in ${sql(shareIds)} and sl.removed_at is null
      order by s.created_at desc, sl.position`,
  ]);
  const keys = [...new Set([...acted, ...sent].map((row) => row.listing_key))];
  const name = them.first_name.trim() || ANONYMOUS_BUYER;
  const linkHref = `/dashboard/shares/${them.share_id}?tab=homes`;
  const lead = people.find((person) => person.id === them.id);
  return {
    keys,
    back: { href: linkHref, label: `Back to ${possessive(name)} link` },
    context: {
      kind: "client",
      title: `${possessive(name)} homes`,
      who: lead ? whoOfLink(lead) : null,
      filter: null,
      keys,
      homes: await linkTakes(people, keys),
      href: linkHref,
      name,
      shareId: them.share_id,
    },
    query: new URLSearchParams({ from: `client:${them.id}` }).toString(),
    filters: ALL,
  };
}

// One of an agent's links: the homes still on it, in the agent's order, with
// everyone's take on each. The agent's alone.
async function shareScope(agent: Account, shareId: string): Promise<ReelScope | null> {
  if (!z.uuid().safeParse(shareId).success) return null;
  const [share] = await sql<{ id: string; client_name: string }[]>`
    select id, client_name from shares where id = ${shareId} and agent_id = ${agent.id}`;
  if (!share) return null;
  const [people, sent] = await Promise.all([
    linkPeople(agent.id, { share: share.id }),
    sql<{ listing_key: string; address: string | null }[]>`
      select sl.listing_key, l.data->>'UnparsedAddress' as address
      from share_listings sl join listings l on l.listing_key = sl.listing_key
      where sl.share_id = ${share.id} and sl.removed_at is null
      order by sl.position`,
  ]);
  const keys = sent.map((row) => row.listing_key);
  const named = share.client_name.trim();
  const title = named || (sent[0]?.address ? `Link for ${sent[0].address}` : "Your link");
  const linkHref = `/dashboard/shares/${share.id}?tab=homes`;
  return {
    keys,
    back: { href: linkHref, label: `Back to ${title}` },
    context: {
      kind: "share",
      title,
      who: null,
      filter: null,
      keys,
      homes: await linkTakes(people, keys),
      href: linkHref,
      ...(named && { name: named }),
      shareId: share.id,
    },
    query: new URLSearchParams({ from: `share:${share.id}` }).toString(),
    filters: ALL,
  };
}

type LinkPerson = {
  id: string;
  share_id: string;
  first_name: string;
  // The same person on two of the agent's links: their account, else this place.
  person: string;
  profile: string | null;
  photo_v: string | null;
};

// The people on an agent's links: one place on a link and (once they've
// signed in) all their others on this agent's links, or everyone on one link.
// A first name, and their public page and photo when they have them. Never
// an email.
const linkPeople = (agentId: string, which: { participant?: string; account?: string | null; share?: string }) =>
  sql<LinkPerson[]>`
    select p.id, p.share_id, p.first_name, coalesce(p.account_id::text, p.id::text) as person,
      v.id as profile, left(md5(a.photo_data_url), 10) as photo_v
    from participants p
    join shares s on s.id = p.share_id
    left join visitors v on v.account_id = p.account_id
    left join accounts a on a.id = p.account_id
    where s.agent_id = ${agentId} and ${
      which.share
        ? sql`p.share_id = ${which.share}`
        : which.account
          ? sql`(p.id = ${which.participant ?? null} or p.account_id = ${which.account})`
          : sql`p.id = ${which.participant ?? null}`
    }
    order by p.created_at`;

const whoOfLink = (person: LinkPerson): ContextWho => ({
  name: person.first_name.trim() || ANONYMOUS_BUYER,
  profileId: person.profile,
  photo: person.profile ? photoUrl(person.profile, person.photo_v) : null,
  agent: false,
});

type Mark = { participant_id: string; listing_key: string; media_key: string; tag: string; at: Date };
type LinkComment = {
  id: string;
  participant_id: string;
  listing_key: string;
  body: string;
  media_key: string | null;
  spot: string | null;
  at: Date;
  likes: number;
  replies: number;
};

// What each of these people did on each of these homes, on the agent's
// links: their like or pass, what they liked and didn't in the photos and
// facts, and what they said, worded as the agent's own pages word it.
// Someone on two of the agent's links is one person here. For the agent
// only: these are private.
async function linkTakes(people: LinkPerson[], keys: string[]): Promise<Record<string, HomeContext>> {
  const ids = people.map((person) => person.id);
  if (ids.length === 0 || keys.length === 0) return {};
  const [listings, reactions, likes, dislikes, comments] = await Promise.all([
    sql<{ listing_key: string; data: Listing }[]>`
      select listing_key, data from listings where listing_key in ${sql(keys)}`,
    sql<({ participant_id: string; listing_key: string; at: Date } & ReactionState)[]>`
      select participant_id, listing_key, reaction, liked, disliked, updated_at as at
      from reactions where participant_id in ${sql(ids)} and listing_key in ${sql(keys)}`,
    sql<Mark[]>`
      select participant_id, listing_key, media_key, tag, created_at as at
      from photo_likes where participant_id in ${sql(ids)} and listing_key in ${sql(keys)}`,
    sql<Mark[]>`
      select participant_id, listing_key, media_key, tag, created_at as at
      from photo_dislikes where participant_id in ${sql(ids)} and listing_key in ${sql(keys)}`,
    sql<LinkComment[]>`
      select c.id, c.participant_id, c.listing_key, c.body, c.media_key, c.spot, c.created_at as at,
        (select count(*)::int from share_comment_likes cl where cl.comment_id = c.id) as likes,
        (select count(*)::int from comments r where r.parent_id = c.id) as replies
      from comments c
      where c.participant_id in ${sql(ids)} and c.listing_key in ${sql(keys)}`,
  ]);
  const listingOf = new Map(
    listings.map((row) => [row.listing_key, { ...row.data, Media: [...row.data.Media].sort((a, b) => a.Order - b.Order) }]),
  );
  // Each person once (by their account, when they have one), on each home.
  const personOf = new Map(people.map((person) => [person.id, person]));
  type Bucket = {
    key: string;
    who: LinkPerson;
    state: ReactionState;
    stateAt: Date | null;
    likes: Mark[];
    dislikes: Mark[];
    comments: LinkComment[];
  };
  const buckets = new Map<string, Bucket>();
  const bucket = (participantId: string, key: string) => {
    const who = personOf.get(participantId)!;
    const id = `${key}\u0000${who.person}`;
    const found: Bucket = buckets.get(id) ?? { key, who, state: NO_REACTION, stateAt: null, likes: [], dislikes: [], comments: [] };
    buckets.set(id, found);
    return found;
  };
  for (const row of reactions) {
    const b = bucket(row.participant_id, row.listing_key);
    // Of two places on two links, the newer take.
    if (!b.stateAt || row.at > b.stateAt) {
      b.state = { reaction: row.reaction, liked: row.liked, disliked: row.disliked };
      b.stateAt = row.at;
    }
  }
  for (const row of likes) bucket(row.participant_id, row.listing_key).likes.push(row);
  for (const row of dislikes) bucket(row.participant_id, row.listing_key).dislikes.push(row);
  for (const row of comments) bucket(row.participant_id, row.listing_key).comments.push(row);

  const homes: Record<string, HomeContext> = {};
  // When the photo each home opens on was last done something on.
  const photoAt = new Map<string, number>();
  const newestFirst = <T extends { at: Date }>(list: T[]) => [...list].sort((x, y) => +y.at - +x.at);
  const marks = (list: Mark[]) => list.map((mark) => ({ mediaKey: mark.media_key, tag: mark.tag }));
  for (const b of buckets.values()) {
    const listing = listingOf.get(b.key);
    if (!listing) continue;
    const said = newestFirst(b.comments);
    const decided = Boolean(b.state.reaction || b.state.liked.length || b.state.disliked.length);
    const sentence =
      decided || b.likes.length || b.dislikes.length
        ? describeTake(listing, b.state, marks(b.likes), marks(b.dislikes))
        : said.length > 1
          ? `left ${said.length} comments`
          : "commented";
    // Everything on a photo (not a fact), newest first, each once.
    const onPhotos = newestFirst([
      ...b.likes.map((mark) => ({ mediaKey: mark.media_key, tag: mark.tag, at: mark.at, kind: "like" as const })),
      ...b.dislikes.map((mark) => ({ mediaKey: mark.media_key, tag: mark.tag, at: mark.at, kind: "dislike" as const })),
      ...said.flatMap((c) =>
        c.media_key && c.spot ? [{ mediaKey: c.media_key, tag: c.spot, at: c.at, kind: "comment" as const }] : [],
      ),
    ]).filter((mark) => mark.mediaKey !== FACTS);
    const spots: ContextSpot[] = [];
    for (const mark of onPhotos) {
      if (spots.some((spot) => spot.mediaKey === mark.mediaKey && spot.tag === mark.tag && spot.kind === mark.kind)) continue;
      spots.push({ mediaKey: mark.mediaKey, tag: mark.tag, kind: mark.kind, name: spotName(listing, mark) });
    }
    const facts = [
      ...b.likes.map((mark) => ({ mark, kind: "like" as const })),
      ...b.dislikes.map((mark) => ({ mark, kind: "dislike" as const })),
    ]
      .filter(({ mark }) => mark.media_key === FACTS)
      .sort((x, y) => +x.mark.at - +y.mark.at)
      .map(({ mark, kind }) => ({ kind, phrase: tagPhrase(mark.tag), tag: mark.tag }));
    const shown = said.slice(0, TAKE_COMMENTS).reverse();
    const times = [b.stateAt, ...b.likes.map((m) => m.at), ...b.dislikes.map((m) => m.at), ...said.map((c) => c.at)].flatMap(
      (date) => (date ? [+date] : []),
    );
    const at = Math.max(...times);
    const take: ContextTake = {
      who: whoOfLink(b.who),
      sentence,
      at: new Date(at).toISOString(),
      verdict: b.state.reaction === "dislike" ? "pass" : b.state.reaction,
      spots: spots.slice(0, TAKE_SPOTS),
      facts,
      comments: shown.map((c) => ({
        id: c.id,
        body: clipTake(c.body),
        spot: c.media_key && c.spot ? { name: spotName(listing, { mediaKey: c.media_key, tag: c.spot }) } : null,
        likes: c.likes,
        replies: c.replies,
      })),
      ...(said.length > shown.length && { moreComments: said.length - shown.length }),
      private: true,
    };
    const home = (homes[b.key] ??= { takes: [], photo: null });
    home.takes.push(take);
    // The home opens on the photo the newest thing anyone picked out is in.
    const newest = onPhotos[0];
    const index = newest ? listing.Media.findIndex((m) => mediaKeyOf(m) === newest.mediaKey) : -1;
    if (index >= 0 && +newest.at > (photoAt.get(b.key) ?? -Infinity)) {
      home.photo = index;
      photoAt.set(b.key, +newest.at);
    }
  }
  // On every home, the newest take first.
  for (const home of Object.values(homes)) home.takes.sort((a, b) => b.at.localeCompare(a.at));
  return homes;
}
