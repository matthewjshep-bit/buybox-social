import { sql } from "./db";
import type { Listing } from "./listings/types";
import { FACTS, isPointTag, mediaKeyOf, thingOf } from "./photos";
import { aspectLabel, type Aspect, type Sentiment } from "./reactions";

// One client's feedback, rolled up: everything they liked and didn't across
// every home their agent sent them, on every link of the agent's they're on.
// What they like, what they don't, what depends on the home, and then each
// home with what they made of it. Only ever for the agent whose links these
// are: nothing here is public.

// Something they liked or didn't, and in how many homes.
export type FeedbackThing = { thing: string; homes: number };

export type FeedbackHome = {
  key: string;
  address: string;
  city: string;
  photo: string | null;
  reaction: Sentiment | null;
  likes: string[];
  dislikes: string[];
  comments: number;
  // The home full screen, among this client's homes, where its own feedback is.
  href: string;
};

export type ClientFeedback = {
  // Homes sent, and how many they've said yes or no to.
  sent: number;
  liked: number;
  passed: number;
  likes: FeedbackThing[];
  dislikes: FeedbackThing[];
  // Liked in one home and not in another: "Layout".
  mixed: string[];
  // The homes they've done anything with first, newest first; then the rest.
  homes: FeedbackHome[];
  // Whether there's anything to show at all.
  any: boolean;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const has = (things: string[], thing: string) => things.some((t) => same(t, thing));
const add = (things: string[], thing: string) => {
  if (!has(things, thing)) things.push(thing);
};

// "Kitchen island" for a tag in a photo, a fact ("Price"), or a spot they
// tapped that sits on something named; null for a bare spot with no name.
function nameOf(listing: Listing, mediaKey: string, tag: string) {
  if (mediaKey === FACTS) return tag;
  if (!isPointTag(tag)) return tag;
  return thingOf(listing.Media.find((photo) => mediaKeyOf(photo) === mediaKey), tag);
}

export async function getClientFeedback(agentId: string, participantIds: string[]): Promise<ClientFeedback> {
  const none: ClientFeedback = { sent: 0, liked: 0, passed: 0, likes: [], dislikes: [], mixed: [], homes: [], any: false };
  if (participantIds.length === 0) return none;
  // Only on the agent's own links, whoever the ids say they are.
  const mine = sql`
    select p.id from participants p join shares s on s.id = p.share_id
    where s.agent_id = ${agentId} and p.id in ${sql(participantIds)}`;
  const [sent, reactions, likes, dislikes, comments] = await Promise.all([
    // Each home they were sent, with the place on the link that is them (newest link first).
    sql<{ listing_key: string; participant_id: string; data: Listing; sent_at: Date }[]>`
      select sl.listing_key, p.id as participant_id, l.data, s.created_at as sent_at
      from participants p
        join shares s on s.id = p.share_id
        join share_listings sl on sl.share_id = s.id and sl.removed_at is null
        join listings l on l.listing_key = sl.listing_key
      where p.id in (${mine})
      order by s.created_at desc, sl.position`,
    sql<{ listing_key: string; reaction: Sentiment | null; liked: Aspect[]; disliked: Aspect[]; updated_at: Date }[]>`
      select listing_key, reaction, liked, disliked, updated_at from reactions
      where participant_id in (${mine}) order by updated_at`,
    sql<{ listing_key: string; media_key: string; tag: string; created_at: Date }[]>`
      select listing_key, media_key, tag, created_at from photo_likes where participant_id in (${mine})`,
    sql<{ listing_key: string; media_key: string; tag: string; created_at: Date }[]>`
      select listing_key, media_key, tag, created_at from photo_dislikes where participant_id in (${mine})`,
    sql<{ listing_key: string; n: number; last_at: Date }[]>`
      select listing_key, count(*)::int as n, max(created_at) as last_at from comments
      where participant_id in (${mine}) group by listing_key`,
  ]);
  if (sent.length === 0) return none;

  // Each home once (its newest link), with what they made of it.
  type Row = FeedbackHome & { at: number };
  const homes = new Map<string, Row>();
  const listings = new Map<string, Listing>();
  for (const row of sent) {
    if (homes.has(row.listing_key)) continue;
    listings.set(row.listing_key, row.data);
    homes.set(row.listing_key, {
      key: row.listing_key,
      address: row.data.UnparsedAddress,
      city: row.data.City,
      photo: [...row.data.Media].sort((a, b) => a.Order - b.Order)[0]?.MediaURL ?? null,
      reaction: null,
      likes: [],
      dislikes: [],
      comments: 0,
      href: `/reel?${new URLSearchParams({ from: `client:${row.participant_id}`, home: row.listing_key })}`,
      at: 0,
    });
  }
  const touch = (home: Row, at: Date) => {
    home.at = Math.max(home.at, at.getTime());
  };
  // (Oldest first, so on a home that's on two links the newest answer stands.)
  for (const row of reactions) {
    const home = homes.get(row.listing_key);
    if (!home) continue;
    if (row.reaction) home.reaction = row.reaction;
    for (const aspect of row.liked) add(home.likes, aspectLabel(aspect));
    for (const aspect of row.disliked) add(home.dislikes, aspectLabel(aspect));
    if (row.reaction || row.liked.length || row.disliked.length) touch(home, row.updated_at);
  }
  for (const [rows, list] of [
    [likes, "likes"],
    [dislikes, "dislikes"],
  ] as const) {
    for (const row of rows) {
      const home = homes.get(row.listing_key);
      const listing = listings.get(row.listing_key);
      if (!home || !listing) continue;
      const thing = nameOf(listing, row.media_key, row.tag);
      if (thing) add(home[list], thing);
      touch(home, row.created_at);
    }
  }
  for (const row of comments) {
    const home = homes.get(row.listing_key);
    if (!home) continue;
    home.comments = row.n;
    touch(home, row.last_at);
  }
  // In any one home, what they didn't like wins over a heart on the same
  // thing: passing on the kitchen and hearting its photo isn't liking the kitchen.
  for (const home of homes.values()) home.likes = home.likes.filter((thing) => !has(home.dislikes, thing));

  // Across the homes: each thing with how many homes it was liked (or not) in.
  const tally = (list: "likes" | "dislikes") => {
    const counts: FeedbackThing[] = [];
    for (const home of homes.values()) {
      for (const thing of home[list]) {
        const found = counts.find((count) => same(count.thing, thing));
        if (found) found.homes += 1;
        else counts.push({ thing, homes: 1 });
      }
    }
    return counts.sort((a, b) => b.homes - a.homes || a.thing.localeCompare(b.thing));
  };
  const allLikes = tally("likes");
  const allDislikes = tally("dislikes");
  const mixed = allLikes.filter((like) => allDislikes.some((dislike) => same(dislike.thing, like.thing))).map((like) => like.thing);

  const all = [...homes.values()];
  const done = all.filter((home) => home.at > 0).sort((a, b) => b.at - a.at);
  const rest = all.filter((home) => home.at === 0);
  return {
    sent: all.length,
    liked: all.filter((home) => home.reaction === "like").length,
    passed: all.filter((home) => home.reaction === "dislike").length,
    likes: allLikes.filter((like) => !has(mixed, like.thing)),
    dislikes: allDislikes.filter((dislike) => !has(mixed, dislike.thing)),
    mixed,
    homes: [...done, ...rest].map((row) => {
      const home: FeedbackHome & { at?: number } = { ...row };
      delete home.at;
      return home;
    }),
    any: done.length > 0,
  };
}
