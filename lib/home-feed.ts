import { cache } from "react";
import type { Account } from "./auth";
import { sql } from "./db";
import { linkWho } from "./link-public";
import { getReel, type FeedPost } from "./feed";
import { feedHomeOf, type FeedHome, type FeedWho } from "./feed-home";
import { getAffinity, getEngagement, getImpressions, rankFeed, type Candidate } from "./feed-rank";
import { getFollowedIds } from "./follows";
import { getPostsBy, type PostEntry } from "./posts";
import { buildCards, getProfilePerson, getProfileRows, withoutPasses, type ProfileCard } from "./profile";
import { getRatedHomes } from "./my-links";
import type { ReactionState } from "./reactions";
import { getTaste, hasTaste } from "./taste";
import { isProKind, listingWords } from "./kinds";
import type { Listing } from "./listings/types";
import { photoUrl } from "./person-photo";
import { getPopularHomes, type PopularHome } from "./popular";
import { US_STATES } from "./places";

// The home page's Following stream, signed in: what the people you follow
// liked and said in public, one entry per home per day however many of them
// it was ("Matthew, Eva and 2 others liked this home"). Built only from what
// each of their pages shows a stranger, and only the good parts: likes, spot
// likes and comments. Never a pass, a dislike or a "but not", whatever they
// keep public, because a feed puts it in front of people who didn't go
// looking. What an agent's clients did on their links and what's happened
// around your own comments live elsewhere (the agent's "Your clients" card
// and each client's page; the bell). The one pass ever in it is the viewer's
// own: the home they just rated on a link an agent sent them leads the feed
// (`ratedEntries`). Any home in it opens the homes full screen, in the
// feed's order (`feedKeys`).

// (Who, and a home as a card shows it: lib/feed-home.ts, shared with posts.)
export type { FeedHome, FeedWho };

// Why a home is in your feed, for the card and for the reel's take on it:
// who (likers first), what they did without their names ("liked this home"),
// what they said (newest first, as they wrote it), and the photo it's about.
type FeedWhy = { key: string; who: FeedWho[]; sentence: string; quotes: string[]; photo: number | null };

// Why a home is in your feed when nobody you follow is the reason: it's
// popular, it's near you, it's picked from what you like, or (`rated`, first
// in the feed) you just liked or passed on it on a link an agent sent you.
export type FeedReason =
  | { kind: "popular" | "near" | "picked"; text: string }
  | { kind: "rated"; text: string; verdict: "like" | "pass" };

export type HomeFeedEntry = {
  kind?: undefined;
  // The home and the day: one entry each.
  id: string;
  at: string;
  day: string;
  home: FeedHome;
  why: FeedWhy;
  // What was said, with who said it, newest first: the card's quote bubbles.
  // (From someone's page: who it answered, and the spot or fact it's about,
  // as their page says it.)
  said: { who: FeedWho; body: string; replyTo?: ProfileCard["comments"][number]["replyTo"]; spot?: ProfileCard["comments"][number]["spot"] }[];
  // Whether anyone liked it, rather than only saying something about it.
  liked: boolean;
  // Not from anyone you follow: why it's here instead.
  reason?: FeedReason;
};

// What a feed holds: a home someone did something on, or a post (their
// words, with homes or none).
export type FeedItem = HomeFeedEntry | PostEntry;

// How far the feed reads, and how much it holds.
const FOLLOWED_MOST = 100;
const CARDS_PER_PERSON = 20;
const FEED_MOST = 60;
const QUOTES = 2;
// Homes picked for someone, after the feed: this many, and never fewer than
// PICKS_LEAST while there are homes to show.
const PICKS = 12;
const PICKS_LEAST = 6;

const nameOr = (name: string, agent: boolean) => name.trim() || (agent ? "An agent" : "A buyer");

// One person's good day on a home, as their page would show a stranger.
type Take = { who: FeedWho; card: ProfileCard };

const likedIt = (take: Take) => take.card.liked || take.card.loves.length > 0;

// What one person you follow did lately, as anyone visiting their page would
// see it, with their passes taken out whatever they keep public: and nothing
// at all on a home they passed on (a comment there could give the pass away).
async function takesOf(id: string): Promise<Take[]> {
  const person = await getProfilePerson(id);
  if (!person) return [];
  // (What they did in public: nothing from a link they were sent, which is on their own page only.)
  const rows = await getProfileRows(id, false, false);
  const passed = new Set([...rows.standing].flatMap(([key, sentiment]) => (sentiment === "dislike" ? [key] : [])));
  const who: FeedWho = {
    name: nameOr(person.name, person.isAgent),
    face: person.name,
    profileId: person.id,
    agent: person.isAgent,
    photo: person.photo,
  };
  return buildCards(withoutPasses(rows))
    .filter((card) => !card.quiet && !passed.has(card.home.key))
    .map((card) => ({ who, card }))
    .filter((take) => likedIt(take) || take.card.commented)
    .slice(0, CARDS_PER_PERSON);
}

// "liked this home", for one person: their own page's words, with the home
// named as a home. For several, what they did together.
function sentenceOf(takes: Take[]) {
  if (takes.length === 1) return takes[0].card.sentence.replace(/^liked this(?=,|$)/, "liked this home");
  const liked = takes.filter(likedIt).length;
  if (liked === takes.length) return "liked this home";
  return liked === 0 ? "commented on this home" : "liked or commented on this home";
}

// Many people's takes on homes, one entry per home per day, newest first.
function entriesOf(takes: Take[]): HomeFeedEntry[] {
  const byHomeDay = new Map<string, Take[]>();
  for (const take of takes) {
    const id = `${take.card.home.key}|${take.card.day}`;
    byHomeDay.set(id, [...(byHomeDay.get(id) ?? []), take]);
  }
  return [...byHomeDay]
    .map(([id, group]): HomeFeedEntry => {
      // Newest first; the people who liked it named ahead of those who only spoke.
      const newest = [...group].sort((a, b) => b.card.at.localeCompare(a.card.at));
      const who = [...newest.filter(likedIt), ...newest.filter((take) => !likedIt(take))].map((take) => take.who);
      const top = newest[0].card;
      const said = newest
        .flatMap((take) =>
          take.card.comments.map((comment) => ({
            who: take.who,
            body: comment.body,
            at: comment.at,
            replyTo: comment.replyTo,
            spot: comment.spot,
          })),
        )
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, QUOTES)
        .map(({ who, body, replyTo, spot }) => ({ who, body, replyTo, spot }));
      // The photo with the newest thing anyone liked or said something about
      // in it, else the newest card's (the home's first photo), and the rest
      // of the photos after it.
      const lead = newest.find((take) => take.card.pins.length > 0)?.card ?? top;
      const photo = lead.photo;
      return {
        id,
        at: top.at,
        day: top.day,
        home: { ...top.home, photo, photos: lead.photos, photoCount: lead.photoCount },
        why: {
          key: top.home.key,
          who,
          sentence: sentenceOf(newest),
          quotes: said.map((quote) => quote.body),
          photo: photo?.index ?? null,
        },
        said,
        liked: newest.some(likedIt),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

// What the people you follow did, newest first: their takes on homes, and
// their posts, in one order. Your own posts are among them, as anywhere you
// post: what you just shared is there when you come back to Home.
async function followingEntries(visitorId: string | null): Promise<FeedItem[]> {
  if (!visitorId) return [];
  const ids = [...(await getFollowedIds(visitorId))].slice(0, FOLLOWED_MOST);
  const [takes, posts] = await Promise.all([Promise.all(ids.map(takesOf)), getPostsBy([...ids, visitorId], { most: FEED_MOST })]);
  return [...entriesOf(takes.flat()), ...posts].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, FEED_MOST);
}

// The homes an item is about: one, or a post's.
const homesOf = (item: FeedItem): FeedHome[] => (item.kind === "post" ? item.homes : [item.home]);

// One home in the feed for a reason of its own (or, `who`, someone who just
// added it: a new deal or listing).
function entryOf(
  source: string,
  listing: Listing,
  at: string,
  why: { reason?: FeedReason; who?: FeedWho[]; sentence?: string; said?: HomeFeedEntry["said"] },
): HomeFeedEntry {
  const home = feedHomeOf(listing);
  return {
    id: `${source}:${home.key}`,
    at,
    day: at.slice(0, 10),
    home,
    why: { key: home.key, who: why.who ?? [], sentence: why.sentence ?? "", quotes: (why.said ?? []).map((quote) => quote.body), photo: home.photo?.index ?? 0 },
    said: why.said ?? [],
    liked: false,
    ...(why.reason && { reason: why.reason }),
  };
}

// The listings for these keys, as they are, in that order (those still here).
async function listingsOf(keys: string[]): Promise<Listing[]> {
  if (keys.length === 0) return [];
  const rows = await sql<{ data: Listing }[]>`
    select data from listings
    where listing_key in ${sql(keys)}
      and (owner_account_id is null or coalesce((data->>'Hidden')::boolean, false) = false)`;
  const byKey = new Map(rows.map((row) => [row.data.ListingKey, row.data]));
  return keys.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
}

// What everyone's liking and talking about: this week's, and this month's
// when the week is quiet. The best-liked thing said about each comes with it.
async function popularEntries(): Promise<HomeFeedEntry[]> {
  let hot: (PopularHome & { when: string })[] = (await getPopularHomes("week", 20)).map((home) => ({ ...home, when: "this week" }));
  if (hot.length < 8) {
    const seen = new Set(hot.map((home) => home.key));
    const month = (await getPopularHomes("month", 20)).filter((home) => !seen.has(home.key));
    hot = [...hot, ...month.map((home) => ({ ...home, when: "this month" }))];
  }
  const listings = new Map((await listingsOf(hot.map((home) => home.key))).map((listing) => [listing.ListingKey, listing]));
  const now = new Date().toISOString();
  return hot.flatMap((home) => {
    const listing = listings.get(home.key);
    if (!listing) return [];
    return [
      entryOf("popular", listing, now, {
        // (No counts in it: the bar under the card has how many liked it and
        // how many comments it has, all told.)
        reason: { kind: "popular", text: `Popular ${home.when}` },
        said: home.top
          ? [{ who: { name: home.top.name, face: home.top.name, profileId: null, agent: false, photo: null }, body: home.top.body }]
          : [],
      }),
    ];
  });
}

// Homes for sale near where they said they are: in their city first, then
// the rest of their state, the newest first.
async function nearEntries(place: { city: string; state: string } | null): Promise<HomeFeedEntry[]> {
  if (!place?.city || !place.state) return [];
  const rows = await sql<{ data: Listing; here: boolean }[]>`
    select data, lower(data->>'City') = ${place.city.toLowerCase()} as here from listings
    where standard_status = 'Active'
      and upper(data->>'StateOrProvince') = ${place.state.toUpperCase()}
      and jsonb_array_length(coalesce(data->'Media', '[]'::jsonb)) > 0
      and (owner_account_id is null or coalesce((data->>'Hidden')::boolean, false) = false)
    order by here desc, updated_at desc, listing_key
    limit 15`;
  const now = new Date().toISOString();
  return rows.map(({ data, here }) =>
    entryOf("near", data, now, {
      reason: { kind: "near", text: here ? `Near you in ${place.city}` : `Near you in ${US_STATES[place.state] ?? place.state}` },
    }),
  );
}

// What pros just put up: their new deals and listings (with a photo, shown
// on their profile), whoever they are but the one looking.
async function newEntries(accountId: string): Promise<HomeFeedEntry[]> {
  const rows = await sql<
    { data: Listing; at: string; profile_id: string; name: string; face: string; kind: string | null; photo_v: string | null }[]
  >`
    select l.data, coalesce(l.data->>'OriginalEntryTimestamp', l.updated_at::text) as at,
      v.id as profile_id, btrim(a.full_name) as name, btrim(v.first_name) as face, a.kind,
      left(md5(a.photo_data_url), 10) as photo_v
    from listings l
    join accounts a on a.id = l.owner_account_id
    join visitors v on v.account_id = a.id
    where l.standard_status in ('Active', 'Closed') and a.id <> ${accountId}
      and coalesce((l.data->>'Hidden')::boolean, false) = false
      and btrim(a.full_name) <> ''
      and exists (
        select 1 from jsonb_array_elements(l.data->'Media') m
        where coalesce(m->>'MediaCategory', 'Photo') <> 'Video' and m->>'VideoEmbed' is null)
      and coalesce((l.data->>'OriginalEntryTimestamp')::timestamptz, l.updated_at) > now() - interval '60 days'
    order by at desc, l.listing_key
    limit 12`;
  return rows.map((row) =>
    entryOf("new", row.data, new Date(row.at).toISOString(), {
      who: [{ name: row.name, face: row.face, profileId: row.profile_id, agent: true, photo: photoUrl(row.profile_id, row.photo_v) }],
      sentence: `added a new ${listingWords(isProKind(row.kind) ? row.kind : "agent").one}`,
    }),
  );
}

// Homes picked for them from what they've liked (or, with too little liked
// yet to go on, homes to start with), none already in the feed.
async function pickedEntries(account: Account, visitorId: string | null, exclude: string[]): Promise<HomeFeedEntry[]> {
  const taste = await getTaste(visitorId);
  const posts = await getReel(account, undefined, taste, { limit: 12, exclude });
  const now = new Date().toISOString();
  return posts.map((post) =>
    entryOf("picked", post.listing, now, {
      reason: { kind: "picked", text: hasTaste(taste) ? "Picked for you, from what you like" : "Homes to start with" },
    }),
  );
}

// How long the home they just rated on an agent's link leads their feed.
const RATED_LEADS_FOR = 24 * 60 * 60 * 1000;

// The home they most recently liked or passed on, on a link an agent sent
// them, while it's fresh: first in their feed, as their own entry ("You
// passed on this home"), so Home leads with what they just did and what
// the sign-up promised follows it. Nobody else's pass is ever an entry.
async function ratedEntries(rated: Awaited<ReturnType<typeof getRatedHomes>>): Promise<HomeFeedEntry[]> {
  const [latest] = rated;
  if (!latest || Date.now() - +new Date(latest.ratedAt) > RATED_LEADS_FOR) return [];
  const [listing] = await listingsOf([latest.listingKey]);
  if (!listing) return [];
  return [
    entryOf("rated", listing, latest.ratedAt, {
      reason: {
        kind: "rated",
        text: latest.verdict === "like" ? "You liked this home" : "You passed on this home",
        verdict: latest.verdict,
      },
    }),
  ];
}

// What an item is to the ranking: its id, when, its homes, whose it is, and
// where it came from.
const describe = (item: FeedItem): Candidate =>
  item.kind === "post"
    ? { id: item.id, at: item.at, keys: item.homes.map((home) => home.key), author: item.who.profileId, source: "post" }
    : {
        id: `home:${item.home.key}`,
        at: item.at,
        keys: [item.home.key],
        author: item.reason ? null : (item.why.who[0]?.profileId ?? null),
        source: item.reason ? (item.reason.kind === "rated" ? "following" : item.reason.kind) : item.id.startsWith("new:") ? "new" : "following",
      };

// A session: half an hour of looking. The shuffle among near-equal scores
// holds for that long, then comes out a little differently.
const SESSION = 30 * 60 * 1000;

// Someone's home feed: the home they just rated on an agent's link, when
// they have; then what the people they follow did since they last looked,
// then everything else in order of what's worth their time (lib/feed-rank.ts):
// what's popular, new deals and listings, homes near them and homes picked
// for them, with what they've already seen falling back, and a few places
// kept for homes they've never seen. Each home once (the people you follow
// first), never one they passed on, in public or on a link. (`account` is
// who's asking: the reel's `from=feed` reads the same feed, in the same order.)
export const getHomeFeed = cache(async (account: Account, visitorId: string | null): Promise<FeedItem[]> => {
  if (!account) return [];
  const [[place], passed, rated, following, popular, fresh] = await Promise.all([
    sql<{ city: string; state: string }[]>`
      select location_city as city, location_state as state from accounts where id = ${account.id}`,
    visitorId
      ? sql<{ listing_key: string }[]>`
          select listing_key from public_reactions where visitor_id = ${visitorId} and reaction = 'dislike'`
      : Promise.resolve([]),
    // What they decided on the links agents sent them: one verdict per
    // home, the newest, newest first (never from a link of their own).
    getRatedHomes(account.id),
    followingEntries(visitorId),
    popularEntries(),
    newEntries(account.id),
  ]);
  const [near, lead] = await Promise.all([nearEntries(place ?? null), ratedEntries(rated)]);
  const skip = new Set([
    ...passed.map((row) => row.listing_key),
    ...rated.flatMap((home) => (home.verdict === "pass" ? [home.listingKey] : [])),
  ]);
  const taken = [...lead, ...following, ...popular, ...fresh, ...near].flatMap((item) => homesOf(item).map((home) => home.key));
  const picked = await pickedEntries(account, visitorId, [...new Set([...taken, ...skip])]);
  // (A home someone you follow is in the feed for is theirs: never again
  // for another reason. Anything else once, and never a home they passed on.)
  const theirs = new Set<string>([...lead, ...following].flatMap((item) => homesOf(item).map((home) => home.key)));
  const once = new Set<string>();
  const candidates: FeedItem[] = [];
  for (const entry of [...popular, ...fresh, ...near, ...picked]) {
    const key = entry.kind === "post" ? "" : entry.home.key;
    if (theirs.has(key) || once.has(key) || skip.has(key)) continue;
    once.add(key);
    candidates.push(entry);
  }
  const all = [...following, ...candidates];
  const ids = all.map((item) => describe(item).id);
  const [engagement, affinity, seen, seenAt] = await Promise.all([
    getEngagement([...new Set(all.flatMap((item) => homesOf(item).map((home) => home.key)))]),
    getAffinity(visitorId),
    getImpressions(visitorId, ids),
    getHomeSeen(visitorId),
  ]);
  const now = Date.now();
  const ranked = rankFeed(
    all,
    describe,
    { now, seed: `${visitorId ?? account.id}:${Math.floor(now / SESSION)}`, engagement, affinity, seen, seenAt },
    FEED_MOST - lead.length,
  );
  // (The home they just rated leads, whatever they decided.)
  return [...lead, ...ranked];
});

// The homes in a feed, in its order, each once: what opens full screen.
export const feedKeys = (entries: FeedItem[]) => [...new Set(entries.flatMap((item) => homesOf(item).map((home) => home.key)))];

// The order Home last showed someone their feed in. Their page writes it in
// a cookie once it's in front of them (components/home/feed-order.tsx), for
// half an hour (a visit); the pop-out's `from=feed` walks the homes in that
// order. Ranked again, the feed would come out differently: the cards they
// have just scrolled past count as seen by then and fall back, so the home
// they tapped would no longer be where it was. (Whose it is, then the keys:
// someone else's order on a shared device is never used.)
export const FEED_ORDER = { name: "feed_order", maxAge: 30 * 60 };
// (Kept well under a browser's 4KB for a cookie, encoded: any keys past it
// keep their own order, after the ones it has: inFeedOrder.)
const FEED_ORDER_BYTES = 3500;
export function feedOrderValue(owner: string, keys: string[]) {
  let value = `${owner}|`;
  let size = encodeURIComponent(value).length;
  for (const [i, key] of keys.entries()) {
    const add = (i ? "," : "") + key;
    const bytes = encodeURIComponent(add).length;
    if (size + bytes > FEED_ORDER_BYTES) break;
    value += add;
    size += bytes;
  }
  return value;
}

// These homes in the order the feed was shown in, as far as it says (any it
// didn't have keep their own order, after them).
export function inFeedOrder(keys: string[], saved: string | undefined, owner: string): string[] {
  if (!saved) return keys;
  let value = saved;
  try {
    value = decodeURIComponent(saved);
  } catch {}
  const [who, list = ""] = value.split("|");
  if (who !== owner) return keys;
  const have = new Set(keys);
  const first = [...new Set(list.split(","))].filter((key) => have.has(key));
  const placed = new Set(first);
  return [...first, ...keys.filter((key) => !placed.has(key))];
}

// Homes picked for someone by their taste, none of them already in their
// feed: the masonry under it, and the reel's `from=picks`, in the same order.
// The more people someone follows, the more homes their feed has taken; so
// when fewer than six are left, it's made up to six with the best of the
// homes that are in their feed, after the ones that aren't.
export const getPicks = cache(
  async (viewer: Account, device: string | undefined, visitorId: string | null): Promise<FeedPost[]> => {
    const [taste, entries] = await Promise.all([getTaste(visitorId), getHomeFeed(viewer, visitorId)]);
    const exclude = feedKeys(entries);
    const picks = await getReel(viewer, device, taste, { limit: PICKS, exclude });
    if (picks.length >= PICKS_LEAST || exclude.length === 0) return picks;
    const have = new Set(picks.map((post) => post.listing.ListingKey));
    const any = await getReel(viewer, device, taste, { limit: PICKS });
    return [...picks, ...any.filter((post) => !have.has(post.listing.ListingKey))].slice(0, PICKS_LEAST);
  },
);

// Their own take on each of these homes, so a heart in the feed starts out
// right and changes only the like (whatever else they said stays).
export async function myReactions(visitorId: string | null, keys: string[]): Promise<Record<string, ReactionState>> {
  if (!visitorId || keys.length === 0) return {};
  const rows = await sql<({ listing_key: string } & ReactionState)[]>`
    select listing_key, reaction, liked, disliked from public_reactions
    where visitor_id = ${visitorId} and listing_key in ${sql(keys)}`;
  return Object.fromEntries(
    rows.map((row) => [row.listing_key, { reaction: row.reaction, liked: row.liked, disliked: row.disliked }]),
  );
}

// Under each card: how many liked the home, and how many comments it has.
export type FeedCounts = { likes: number; comments: number };

// How many liked each of these homes (anyone, in public or on a link,
// once each, as the home's own page counts them) and how many comments its
// public conversation has (the public ones, and those shared from a link).
export async function feedCounts(keys: string[]): Promise<Record<string, FeedCounts>> {
  if (keys.length === 0) return {};
  const [likes, comments] = await Promise.all([
    sql<{ listing_key: string; n: number }[]>`
      select listing_key, count(*)::int as n from (
        select listing_key, 'v' || visitor_id as who from public_reactions
        where reaction = 'like' and listing_key in ${sql(keys)}
        union
        -- (Someone on a link by their account counts as their public self.)
        select r.listing_key, ${linkWho("r")} from reactions r
        where r.reaction = 'like' and r.listing_key in ${sql(keys)}
        union
        select listing_key, 'v' || visitor_id from public_photo_likes where listing_key in ${sql(keys)}
        union
        select pl.listing_key, ${linkWho("pl")} from photo_likes pl where pl.listing_key in ${sql(keys)}) x
      group by listing_key`,
    sql<{ listing_key: string; n: number }[]>`
      select listing_key, count(*)::int as n from (
        select listing_key from public_comments where listing_key in ${sql(keys)}
        union all
        select listing_key from comments where shared_publicly and listing_key in ${sql(keys)}) x
      group by listing_key`,
  ]);
  const counts: Record<string, FeedCounts> = {};
  for (const key of keys) counts[key] = { likes: 0, comments: 0 };
  for (const row of likes) counts[row.listing_key] = { ...counts[row.listing_key], likes: row.n };
  for (const row of comments) counts[row.listing_key] = { ...counts[row.listing_key], comments: row.n };
  return counts;
}

// Where "new" starts on their home page: the last time they had it open
// before this visit, or null (never, or not since this was kept). Read before
// the page marks it seen. Half an hour without the home page ends a visit.
// Within one the page renders again and again (an inline reply or a comment
// from the pop-out calls refresh(), which re-renders it), and "new" mustn't
// move under them mid-visit, so it's fixed when the visit starts.
// home_seen_at is the last time the page rendered for them; home_seen_prev is
// the boundary kept for the visit under way.
export async function getHomeSeen(visitorId: string | null): Promise<string | null> {
  if (!visitorId) return null;
  const [row] = await sql<{ seen: Date | null }[]>`
    select case
      when home_seen_at is null or home_seen_at < now() - interval '30 minutes' then home_seen_at
      else home_seen_prev
    end as seen
    from visitors where id = ${visitorId}`;
  return row?.seen?.toISOString() ?? null;
}

// Marks their home seen now. A new visit (the page hasn't rendered for them in
// half an hour) moves the boundary up to the last time it did; a render
// within the visit only keeps the visit going. (The right-hand sides read the
// row as it was, so the case sees the old home_seen_at.)
export async function markHomeSeen(visitorId: string) {
  await sql`
    update visitors set
      home_seen_prev = case
        when home_seen_at is null or home_seen_at < now() - interval '30 minutes' then home_seen_at
        else home_seen_prev
      end,
      home_seen_at = now()
    where id = ${visitorId}`;
}
