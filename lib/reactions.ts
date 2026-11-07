// How people react to a home: like or dislike it overall, plus any specifics
// they want to call out. Free of server code, so the browser can use it too.

import type { Listing } from "./listings/types";
import { mediaKeyOf } from "./photos";

export type Sentiment = "like" | "dislike";

export const ASPECTS = [
  { id: "aesthetic", label: "Aesthetic" },
  { id: "exterior", label: "Exterior" },
  { id: "vibe", label: "Vibe" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathrooms", label: "Bathrooms" },
  { id: "layout", label: "Layout" },
  { id: "light", label: "Natural light" },
  { id: "yard", label: "Yard" },
  { id: "location", label: "Location" },
  { id: "price", label: "Price" },
] as const;

export type Aspect = (typeof ASPECTS)[number]["id"];

export const ASPECT_IDS = ASPECTS.map((a) => a.id) as Aspect[];

export const aspectLabel = (id: Aspect) => ASPECTS.find((a) => a.id === id)?.label ?? id;

// `reaction` is null only when nothing is selected at all: picking a specific
// also sets the overall sentiment if there wasn't one yet.
export type ReactionState = { reaction: Sentiment | null; liked: Aspect[]; disliked: Aspect[] };

export const NO_REACTION: ReactionState = { reaction: null, liked: [], disliked: [] };

export type AspectCounts = Partial<Record<Aspect, number>>;

// A home is "trending" with this many reactions or comments in the past week,
// from at least this many people (one person tapping three things isn't a
// trend), and only if that puts it among the busiest few homes for sale.
export const TRENDING_MIN_THIS_WEEK = 3;
export const TRENDING_MIN_PEOPLE = 2;
export const TRENDING_TOP = 3;

// Tapping Like or Dislike itself: on, or off again.
export function toggleOverall(state: ReactionState, sentiment: Sentiment): ReactionState {
  if (state.reaction !== sentiment) return { ...state, reaction: sentiment };
  const liked = sentiment === "like" ? [] : state.liked;
  const disliked = sentiment === "dislike" ? [] : state.disliked;
  return {
    liked,
    disliked,
    reaction: liked.length ? "like" : disliked.length ? "dislike" : null,
  };
}

// Picking a specific under Like or Dislike. A specific can't be both.
export function toggleAspect(state: ReactionState, sentiment: Sentiment, aspect: Aspect): ReactionState {
  const own = sentiment === "like" ? state.liked : state.disliked;
  const other = sentiment === "like" ? state.disliked : state.liked;
  const nextOwn = own.includes(aspect) ? own.filter((a) => a !== aspect) : [...own, aspect];
  const nextOther = other.filter((a) => a !== aspect);
  return {
    // No reaction means nothing was picked yet, so the first specific sets it.
    reaction: state.reaction ?? (nextOwn.length ? sentiment : null),
    liked: sentiment === "like" ? nextOwn : nextOther,
    disliked: sentiment === "like" ? nextOther : nextOwn,
  };
}

// A spot someone tapped that isn't on any named thing, said by where it is
// (spotPlace): "outside", "in the kitchen", "in photo 3".
export type PlacedSpot = { place: string };

// Where in a home a spot with no name is, as the ticker says it: "outside"
// for the outside or front of the house, "in the kitchen" for a room, and
// "in photo 3" only when the photo doesn't say what it shows.
export function spotPlace(listing: Pick<Listing, "Media">, mediaKey: string) {
  const index = listing.Media.findIndex((photo) => mediaKeyOf(photo) === mediaKey);
  const room = listing.Media[index]?.ImageOf;
  if (room && /exterior|front|facade/i.test(room)) return "outside";
  if (room) return `in the ${room.toLowerCase()}`;
  return index >= 0 ? `in photo ${index + 1}` : "in a photo";
}

// "a spot outside", "2 spots in the kitchen": spots with no name, one phrase
// per place, in the order they were tapped. Null is a place nobody said
// ("@42,61" on its own): "a spot in a photo", "2 spots in the photos".
export function spotsIn(places: (string | null)[]) {
  const counts = new Map<string | null, number>();
  for (const place of places) counts.set(place, (counts.get(place) ?? 0) + 1);
  return [...counts].map(([place, n]) =>
    n === 1 ? `a spot ${place ?? "in a photo"}` : `${n} spots ${place ?? "in the photos"}`,
  );
}

// "the kitchen", "the kitchen and natural light", "the yard, vibe and price";
// what wasn't liked takes "or": "the yard or price". Spots come last, in the
// same list: "the deck and a spot outside".
const listOf = (named: string[], spots: string[], joiner: "and" | "or") => {
  const items = [...named.map((thing, i) => `${i === 0 ? "the " : ""}${thing.toLowerCase()}`), ...spots];
  if (items.length <= 1) return items[0] ?? null;
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items.at(-1)}`;
};

// Specifics plus anything liked in the photos, without repeats ("Kitchen" twice).
const likedThings = (liked: Aspect[], photoTags: string[]) => {
  const things = liked.map(aspectLabel) as string[];
  for (const tag of photoTags) {
    if (!things.some((t) => t.toLowerCase() === tag.toLowerCase())) things.push(tag);
  }
  return things;
};

// "liked the kitchen and vibe", "passed on this", "passed, didn't like the yard",
// "liked the marble counters" (from a photo), "liked the deck and a spot in
// the kitchen". The negative choice is called Pass everywhere, so it's
// worded that way.
export function describeReaction(
  { reaction, liked, disliked }: ReactionState,
  // Things liked in the photos: their names, a spot with no name as it was
  // saved ("@42,61"), or one said by where it is ({ place: "outside" }).
  photoTags: (string | PlacedSpot)[] = [],
  // Things not liked in the photos, or facts: "the price".
  photoDislikes: (string | PlacedSpot)[] = [],
): string {
  // Specifics and named things listed, then spots that aren't on a named
  // thing, by where they are. Null when there are none.
  const things = (aspects: Aspect[], tags: (string | PlacedSpot)[], joiner: "and" | "or") => {
    const names = tags.filter((tag): tag is string => typeof tag === "string" && !tag.startsWith("@"));
    const places = tags.flatMap((tag) => (typeof tag !== "string" ? [tag.place] : tag.startsWith("@") ? [null] : []));
    return listOf(likedThings(aspects, names), spotsIn(places), joiner);
  };
  const likes = things(liked, photoTags, "and");
  const dislikes = things(disliked, photoDislikes, "or");
  if (reaction === "like") {
    if (likes && dislikes) return `liked ${likes} but not ${dislikes}`;
    if (likes) return `liked ${likes}`;
    if (dislikes) return `liked this, but not ${dislikes}`;
    return "liked this";
  }
  if (reaction === "dislike") {
    if (dislikes && likes) return `passed, didn't like ${dislikes} but liked ${likes}`;
    if (dislikes) return `passed, didn't like ${dislikes}`;
    if (likes) return `passed, but liked ${likes}`;
    return "passed on this";
  }
  if (likes && dislikes) return `liked ${likes} but not ${dislikes}`;
  if (likes) return `liked ${likes}`;
  if (dislikes) return `didn't like ${dislikes}`;
  return "reacted";
}

// The specifics offered after Like or Pass. Things you can see are liked right
// on the photos, so Like offers only what photos can't show; Pass, which
// photos can't express, offers everything.
export const CHIPS: Record<Sentiment, Aspect[]> = {
  like: ["price", "location", "layout", "vibe"],
  dislike: ASPECTS.map((a) => a.id),
};

// What a stranger may see of a private reaction: the likes, never the dislikes.
export const publicSideOf = (state: ReactionState): ReactionState | null =>
  state.reaction === "like"
    ? { reaction: "like", liked: state.liked, disliked: [] }
    : state.liked.length
      ? { reaction: "like", liked: state.liked, disliked: [] }
      : null;

// Most-mentioned first.
export const topAspects = (counts: AspectCounts, limit = Infinity) =>
  (Object.entries(counts) as [Aspect, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || aspectLabel(a[0]).localeCompare(aspectLabel(b[0])))
    .slice(0, limit);
