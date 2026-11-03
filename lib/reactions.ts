// How people react to a home: like or dislike it overall, plus any specifics
// they want to call out. Free of server code, so the browser can use it too.

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

// A home is "trending" with this many reactions or comments in the past week.
export const TRENDING_MIN_THIS_WEEK = 3;

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

// "the kitchen", "the kitchen and natural light", "the yard, vibe and price".
const listOf = (things: string[]) => {
  const labels = things.map((thing) => thing.toLowerCase());
  if (labels.length <= 1) return `the ${labels[0] ?? ""}`;
  return `the ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
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
// "liked the marble counters" (from a photo). The negative choice is called
// Pass everywhere, so it's worded that way.
export function describeReaction({ reaction, liked, disliked }: ReactionState, photoTags: string[] = []): string {
  const likes = likedThings(liked, photoTags);
  const dislikes = disliked.map(aspectLabel) as string[];
  if (reaction === "like") {
    if (likes.length && dislikes.length) return `liked ${listOf(likes)} but not ${listOf(dislikes)}`;
    if (likes.length) return `liked ${listOf(likes)}`;
    if (dislikes.length) return `liked this, but not ${listOf(dislikes)}`;
    return "liked this";
  }
  if (reaction === "dislike") {
    if (dislikes.length && likes.length) return `passed, didn't like ${listOf(dislikes)} but liked ${listOf(likes)}`;
    if (dislikes.length) return `passed, didn't like ${listOf(dislikes)}`;
    if (likes.length) return `passed, but liked ${listOf(likes)}`;
    return "passed on this";
  }
  if (likes.length) return `liked ${listOf(likes)}`;
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
