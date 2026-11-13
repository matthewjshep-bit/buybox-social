import { cache } from "react";
import type { Account } from "./auth";
import { sql } from "./db";
import { getReel, type FeedPost } from "./feed";
import { getFollowedIds } from "./follows";
import { photoUrl } from "./person-photo";
import { buildCards, getProfilePerson, getProfileRows, withoutPasses, type ProfileCard } from "./profile";
import type { ReactionState } from "./reactions";
import { getTaste } from "./taste";

// The home page's Following stream, signed in: what the people you follow
// liked and said in public, one entry per home per day however many of them
// it was ("Matthew, Eva and 2 others liked this home"). Built only from what
// each of their pages shows a stranger, and only the good parts: likes, spot
// likes and comments. Never a pass, a dislike or a "but not", whatever they
// keep public, because a feed puts it in front of people who didn't go
// looking. An agent's clients and what's happened around your own comments
// live elsewhere (the agent home, the bell). Any home in it opens the homes
// full screen, in the feed's order (`feedKeys`).

// `photo`: their own, where they've added one, in place of their initial.
export type FeedWho = { name: string; face: string; profileId: string | null; agent: boolean; photo: string | null };

// A home as a card shows it: the facts, and the photo it's about (the one
// with the newest thing they liked, else the first), large.
export type FeedHome = {
  key: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  active: boolean;
  photo: { url: string; index: number; alt: string; width?: number; height?: number } | null;
};

// Why a home is in your feed, for the card and for the reel's take on it:
// who (likers first), what they did without their names ("liked this home"),
// what they said (newest first, as they wrote it), and the photo it's about.
export type FeedWhy = { key: string; who: FeedWho[]; sentence: string; quotes: string[]; photo: number | null };

export type HomeFeedEntry = {
  // The home and the day: one entry each.
  id: string;
  at: string;
  day: string;
  home: FeedHome;
  why: FeedWhy;
  // What was said, with who said it, newest first: the card's quote bubbles.
  said: { who: FeedWho; body: string }[];
  // Whether anyone liked it, rather than only saying something about it.
  liked: boolean;
};

// How far the feed reads, and how much it holds.
const FOLLOWED_MOST = 100;
const CARDS_PER_PERSON = 20;
const FEED_MOST = 60;
const QUOTES = 2;
// Homes picked for someone, after the feed.
const PICKS = 12;

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
  const rows = await getProfileRows(id, false);
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
        .flatMap((take) => take.card.comments.map((comment) => ({ who: take.who, body: comment.body, at: comment.at })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, QUOTES)
        .map(({ who, body }) => ({ who, body }));
      // The photo with the newest thing anyone liked or said something about
      // in it, else the newest card's (the home's first photo).
      const photo = newest.find((take) => take.card.pins.length > 0)?.card.photo ?? top.photo;
      return {
        id,
        at: top.at,
        day: top.day,
        home: { ...top.home, photo },
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

// Someone's Following stream, newest first. (`account` is who's asking: the
// signature stays as the reel's `from=feed` calls it. What's in it depends
// only on whom their page follows.)
export const getHomeFeed = cache(async (account: Account, visitorId: string | null): Promise<HomeFeedEntry[]> => {
  if (!account || !visitorId) return [];
  const ids = [...(await getFollowedIds(visitorId))].slice(0, FOLLOWED_MOST);
  const takes = (await Promise.all(ids.map(takesOf))).flat();
  return entriesOf(takes).slice(0, FEED_MOST);
});

// The homes in a feed, in its order, each once: what opens full screen.
export const feedKeys = (entries: HomeFeedEntry[]) => [...new Set(entries.map((entry) => entry.home.key))];

// Homes picked for someone by their taste, none of them already in their
// feed: the masonry under it, and the reel's `from=picks`, in the same order.
export const getPicks = cache(
  async (viewer: Account, device: string | undefined, visitorId: string | null): Promise<FeedPost[]> => {
    const [taste, entries] = await Promise.all([getTaste(visitorId), getHomeFeed(viewer, visitorId)]);
    return getReel(viewer, device, taste, { limit: PICKS, exclude: feedKeys(entries) });
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

// The faces along the top of a buyer's home: the people they follow, those
// with something new in public lately first. Only likes and comments count
// as news, so a ring never gives away a pass.
export type FollowedFace = FeedWho & { profileId: string; lastAt: string | null };
export async function getFollowedFaces(visitorId: string | null, most = 15): Promise<FollowedFace[]> {
  if (!visitorId) return [];
  const rows = await sql<{ id: string; name: string; is_agent: boolean; photo_v: string | null; last_at: Date | null }[]>`
    select v.id,
      case when a.id is not null and btrim(a.full_name) = '' then '' else v.first_name end as name,
      coalesce(a.role = 'agent', false) as is_agent, left(md5(a.photo_data_url), 10) as photo_v,
      greatest(
        (select max(r.updated_at) from public_reactions r where r.visitor_id = v.id and r.reaction = 'like'),
        (select max(pl.created_at) from public_photo_likes pl where pl.visitor_id = v.id),
        (select max(c.created_at) from public_comments c where c.visitor_id = v.id)
      ) as last_at
    from follows f
    join visitors v on v.id = f.followed_id
    left join accounts a on a.id = v.account_id
    where f.follower_id = ${visitorId}
    order by last_at desc nulls last, f.created_at desc
    limit ${most}`;
  return rows.map((row) => ({
    name: nameOr(row.name, row.is_agent),
    face: row.name,
    profileId: row.id,
    agent: row.is_agent,
    photo: photoUrl(row.id, row.photo_v),
    lastAt: row.last_at?.toISOString() ?? null,
  }));
}

// Who's worth following: people busy in public lately, most first, never
// yourself or anyone you follow already, and only people with a name.
export async function suggestPeople(visitorId: string | null, most = 5): Promise<(FeedWho & { profileId: string })[]> {
  const followed = await getFollowedIds(visitorId);
  const rows = await sql<{ id: string; name: string; is_agent: boolean; photo_v: string | null }[]>`
    select v.id, v.first_name as name, coalesce(a.role = 'agent', false) as is_agent,
      left(md5(a.photo_data_url), 10) as photo_v
    from visitors v
    left join accounts a on a.id = v.account_id
    join (
      select visitor_id, updated_at as at from public_reactions
      union all select visitor_id, created_at from public_comments
      union all select visitor_id, created_at from public_photo_likes
    ) x on x.visitor_id = v.id
    where x.at > now() - interval '60 days'
      and btrim(v.first_name) <> '' and (a.id is null or btrim(a.full_name) <> '')
      and v.id::text <> ${visitorId ?? ""}
    group by v.id, v.first_name, a.role, a.photo_data_url
    order by count(*) desc, max(x.at) desc
    limit 40`;
  return rows
    .filter((row) => !followed.has(row.id))
    .slice(0, most)
    .map((row) => ({ name: row.name, face: row.name, profileId: row.id, agent: row.is_agent, photo: photoUrl(row.id, row.photo_v) }));
}

// Agents' own colours, by their page's id: their face on a client's home is
// ringed in it, as their links are.
export async function brandColorsOf(profileIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(profileIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (ids.length === 0) return {};
  const rows = await sql<{ id: string; brand_color: string | null }[]>`
    select v.id, a.brand_color from visitors v join accounts a on a.id = v.account_id
    where v.id in ${sql(ids)} and a.role = 'agent'`;
  return Object.fromEntries(rows.flatMap((row) => (row.brand_color ? [[row.id, row.brand_color]] : [])));
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
