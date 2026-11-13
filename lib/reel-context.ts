// What a feed of homes opened full screen (or in the pop-out) is about, and
// the take on each home in it: whose homes these are ("Maya's highlights"),
// and what she did on each one, so every home says who and why. Worked out
// once on the server, for this viewer, then handed to the page as it is:
// never put in the address. Free of server code, so the browser can use the
// types and the little helpers here too.
import type { ProfileCard } from "./profile";

// Whoever the take is from. `profileId`: their page, when they have one the
// viewer may open (a client on a link may not).
export type ContextWho = { name: string; profileId: string | null; photo: string | null; agent: boolean };

// A spot they picked out in a photo (or a fact, under FACTS), to go to.
export type ContextSpot = { mediaKey: string; tag: string; name: string; kind: "like" | "dislike" | "comment" };

export type ContextTake = {
  who: ContextWho;
  // What they did, without their name: "liked the porch and the kitchen".
  sentence: string;
  // The newest of it.
  at: string;
  verdict: "like" | "pass" | null;
  // At most TAKE_SPOTS, newest first.
  spots: ContextSpot[];
  facts: { kind: "like" | "dislike"; phrase: string; tag: string }[];
  // What they said, at most TAKE_COMMENTS, oldest first, each cut short. An
  // empty id: a quote with nothing to open on its own (the comments open).
  comments: { id: string; body: string; spot: { name: string } | null; likes: number; replies: number }[];
  // How many more they said than shown here.
  moreComments?: number;
  // From an agent's own link: only that agent sees it.
  private: boolean;
  // Why it's in your feed: "who you follow".
  reason?: string;
};

export type HomeContext = {
  takes: ContextTake[];
  // The photo the home opens on (from 0): the one they did something on.
  photo: number | null;
  // Picked for you: why it fits your taste.
  forYou?: string[];
};

export type ReelContextKind = "person" | "feed" | "client" | "share" | "pick";

export type ReelContext = {
  kind: ReelContextKind;
  // "Maya's highlights", "Jenny's homes", "Your feed".
  title: string;
  // Whose they are, for the face beside the title and Follow at the end.
  who: ContextWho | null;
  // The filter the page had on: "Comments", "Kitchen island".
  filter: string | null;
  // Someone's page with Liked, Passed or Comments on.
  show?: "liked" | "passed" | "comments";
  // Every home in it, in its order, for "3 of 12".
  keys: string[];
  homes: Record<string, HomeContext>;
  // Where the title goes: their page (with the same filter), the link, your feed.
  href: string;
  // How the end card calls them: "Follow Maya", "Send Jenny more".
  name?: string;
  // A client's or a link's homes: the link they're on.
  shareId?: string;
  // Your own page.
  me?: boolean;
  // Whoever's looking already follows them (no Follow at the end).
  following?: boolean;
  // Whoever's looking can follow people (signed in).
  canFollow?: boolean;
};

export const TAKE_SPOTS = 6;
export const TAKE_COMMENTS = 3;
export const TAKE_CHARS = 280;

// What someone said, cut at a word to `most` characters, with "…".
export const clipTake = (body: string, most = TAKE_CHARS) => {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= most) return text;
  const cut = text.slice(0, most - 1);
  return `${cut.includes(" ") ? cut.replace(/\s+\S*$/, "") : cut}…`;
};

// A page's filters as part of an address, only those that aren't the
// default, in the page's own order: show, about, side.
export function filterParams(
  filters: { show?: string | null; about?: string | null; side?: string | null } | null | undefined,
): [string, string][] {
  const params: [string, string][] = [];
  if (filters?.show && filters.show !== "all") params.push(["show", filters.show]);
  if (filters?.about) {
    params.push(["about", filters.about]);
    if (filters.side) params.push(["side", filters.side]);
  }
  return params;
}

// "3 of 12": where a home is in it (null when it isn't).
export function placeIn(context: ReelContext, key: string | null) {
  const at = key ? context.keys.indexOf(key) : -1;
  return at === -1 ? null : `${at + 1} of ${context.keys.length}`;
}

// One person's take on one home, from the cards their page shows for it (a
// home can have a card on each of several days, newest first): the newest
// sentence, everything they picked out, and the last few things they said.
// `owner`: their own page, seen by them, all of it. Anyone else sees what a
// public surface may show, likes and words: no dislike, no pass, unless the
// page itself lists passes (`passList`: its Passed filter, or the pass side
// of a topic), where a home they only passed on says just that. The comments
// they liked of others' are only ever on their own page, and never here.
export function takeFromCards(
  cards: ProfileCard[],
  who: ContextWho,
  { owner = false, passList = false }: { owner?: boolean; passList?: boolean } = {},
): ContextTake | null {
  if (cards.length === 0) return null;
  const newest = cards[0];
  const spots: ContextSpot[] = [];
  const seenSpots = new Set<string>();
  for (const card of cards) {
    for (const spot of card.spots) {
      if (!owner && spot.kind === "dislike") continue;
      const id = `${spot.kind}\u0000${spot.mediaKey}\u0000${spot.tag}`;
      if (seenSpots.has(id)) continue;
      seenSpots.add(id);
      spots.push(spot);
    }
  }
  const facts: ContextTake["facts"] = [];
  const seenFacts = new Set<string>();
  for (const card of cards) {
    for (const fact of card.facts) {
      if (!owner && fact.kind === "dislike") continue;
      const id = `${fact.kind}\u0000${fact.tag}`;
      if (seenFacts.has(id)) continue;
      seenFacts.add(id);
      facts.push(fact);
    }
  }
  const said = cards
    .flatMap((card) => card.comments)
    .sort((a, b) => b.at.localeCompare(a.at));
  const comments = said
    .slice(0, TAKE_COMMENTS)
    .reverse()
    .map((comment) => ({
      id: comment.id,
      body: clipTake(comment.body),
      spot: comment.spot ? { name: comment.spot.name } : null,
      likes: comment.likes,
      replies: comment.replies,
    }));
  // Their like or pass as the newest card that has one says it.
  const decided = cards.find((card) => card.liked || card.passed);
  const liked = Boolean(decided?.liked);
  const passed = Boolean(decided?.passed && !decided.liked);
  const base = {
    who,
    at: newest.at,
    comments,
    ...(said.length > comments.length && { moreComments: said.length - comments.length }),
    private: false,
  };
  if (owner) {
    return {
      ...base,
      sentence: newest.sentence,
      verdict: liked ? "like" : passed ? "pass" : null,
      spots: spots.slice(0, TAKE_SPOTS),
      facts,
    };
  }
  // Someone else's: only the good news, and what they said.
  const sentence = cards.map((card) => card.likeSentence).find(Boolean) ?? "";
  const nothingKind = !sentence && spots.length === 0 && facts.length === 0 && comments.length === 0;
  if (nothingKind && cards.some((card) => card.passed) && passList) {
    return { ...base, sentence: "Passed on this home", verdict: "pass", spots: [], facts: [], comments: [] };
  }
  return { ...base, sentence, verdict: liked ? "like" : null, spots: spots.slice(0, TAKE_SPOTS), facts };
}
