// The Scorecard: everything people think of one home, in one place, built
// from what the page already has for this viewer (so never more than they may
// see). Free of server code, so the browser can build it as people tap.

import type { FeedPost } from "./feed";
import { formatPrice } from "./format";
import { isSampleListing, type Listing, type ListingMedia } from "./listings/types";
import {
  aspectOfFact,
  aspectOfTag,
  FACTS,
  isPointTag,
  likeId,
  mediaKeyOf,
  tagNameIn,
  tagPosition,
  thingOf,
  type FactTag,
  type PhotoLikes,
} from "./photos";
import { aspectLabel, topAspects, type Aspect, type AspectCounts, type ReactionState } from "./reactions";
import type { PhotoThing, TimelineComment, TimelineItem, TimelineReaction } from "./timeline";

// Public pages; an agent's link, as the people on it see it; or the agent's
// own view of their client's link (the dashboard).
export type ScorecardMode = "public" | "share" | "agent";

// You, as you are right now on this page (what you've just tapped counts at
// once): your reaction to the home, and your likes and dislikes in its photos
// and facts (by likeId).
export type ScorecardViewer = { state: ReactionState; liked: string[]; disliked: string[] };

// A spot in a photo, or one of the facts ("facts", "Price").
export type ScorecardSpot = { mediaKey: string; tag: string };

// One person's take on the home, from their line in its conversation.
export type ScorecardPerson = {
  key: string;
  // "You" for you.
  name: string;
  you: boolean;
  // From a private chat, on a public page: "A buyer".
  anonymous: boolean;
  state: ReactionState;
  liked: PhotoThing[];
  disliked: PhotoThing[];
  at: string;
};

export type AspectRow = {
  aspect: Aspect;
  label: string;
  count: number;
  // Your own reaction includes it.
  you: boolean;
  // Who, as far as this viewer may know: names, then how many more.
  names: string[];
  others: number;
  // The spots behind it, most liked first, and what was said about them.
  spots: SpotRow[];
  comments: TimelineComment[];
};

export type SpotRow = {
  id: string;
  // Every spot it stands for (two taps on the same front door are one row).
  ids: string[];
  spot: ScorecardSpot;
  // "Front door"; "A spot in the kitchen"
  name: string;
  // "Exterior · photo 1"
  where: string;
  photo: ListingMedia;
  index: number;
  // Where on the photo (null: the photo as a whole).
  at: { x: number; y: number } | null;
  // How many people (one who tapped it twice is one).
  count: number;
  names: string[];
  others: number;
  newest: string;
  tone: "like" | "dislike";
};

export type FactRow = {
  label: string;
  value: string;
  // One that can be liked or talked about, with what people did.
  tag?: FactTag;
  likes: number;
  dislikes: number;
  comments: number;
};

export type CompareRow = { aspect: Aspect; label: string; cells: { likes: number; passes: number }[] };

export type Scorecard = {
  mode: ScorecardMode;
  header: { address: string; line: string };
  // Nobody has liked, passed on or said anything yet.
  quiet: boolean;
  feel: {
    likes: number;
    passes: number;
    comments: number;
    // Said in private chats, and not among those shown (a count only).
    privateMore: number;
    // How many people, and how many of them liked it without passing, for
    // "5 of 7 liked it" and the bar.
    people: number;
    likedOnly: number;
    bar: boolean;
    // On an agent's link with a few people: who, by name.
    named: { liked: string[]; passed: string[]; notYet: string[] } | null;
  };
  say: { sentences: string[]; from: string; at: string | null } | null;
  aspects: { liked: AspectRow[]; disliked: AspectRow[] | null };
  agree: { label: string; things: string[] }[] | null;
  photos: { loved: SpotRow[]; pause: SpotRow[] | null; pauseNone: string | null } | null;
  said: { top: TimelineComment[]; total: number; privateMore: number };
  // "You liked this.", then what you liked and didn't, as lists.
  take: { verdict: string | null; liked: string[]; disliked: string[]; reacted: boolean; forYou: string[] | null };
  people: PersonTake[] | null;
  facts: FactRow[];
  about: { remarks: string | null; listedBy: string | null; sample: boolean };
  // Public pages: views, sends and private conversations, never passes.
  activity: string | null;
  compare: { homes: string[]; rows: CompareRow[] } | null;
};

// Agent mode: what each person on the link thinks.
export type PersonTake = {
  key: string;
  name: string;
  verdict: string;
  likes: string[];
  passes: string[];
  comment: TimelineComment | null;
};

// The ones people can see: comments at the top level, not replies.
const topComments = (items: TimelineItem[]) =>
  items.filter((item): item is TimelineComment => item.kind === "comment" && !item.parentId);
const allComments = (items: TimelineItem[]) => items.filter((item): item is TimelineComment => item.kind === "comment");
const reactionLines = (items: TimelineItem[]) =>
  items.filter((item): item is TimelineReaction => item.kind === "reaction");

const splitId = (id: string) => {
  const at = id.indexOf("\u0000");
  return { mediaKey: id.slice(0, at), tag: id.slice(at + 1) };
};

const thingFrom = (listing: Listing, id: string): PhotoThing => {
  const { mediaKey, tag } = splitId(id);
  return {
    tag: mediaKey === FACTS ? tag : tagNameIn(listing, mediaKey, tag),
    mediaUrl: listing.Media.find((m) => mediaKeyOf(m) === mediaKey)?.MediaURL ?? null,
    mediaKey,
    spot: tag,
  };
};

// Numbers one to nine as words.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export const numberWord = (n: number) => WORDS[n] ?? n.toLocaleString("en-US");
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "Ben", "Ben and Nina", "Ben, Nina and Owen"
export const namesList = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// "the kitchen, the covered porch and the natural light"
const thingsList = (things: string[]) => namesList(things.map((thing) => `the ${thing.toLowerCase()}`));

// What a spot reads as in a list: the thing it's on, or where it is.
function spotName(listing: Listing, photo: ListingMedia | undefined, index: number, tag: string) {
  const thing = photo ? thingOf(photo, tag) : tag;
  if (thing) return capital(thing);
  if (photo?.ImageOf) return `A spot in the ${photo.ImageOf.toLowerCase()}`;
  return index >= 0 ? `A spot in photo ${index + 1}` : "A spot in a photo";
}

// The broad specific a liked (or disliked) thing counts toward.
function aspectOfThing(listing: Listing, thing: PhotoThing): Aspect | null {
  if (!thing.mediaKey) return null;
  if (thing.mediaKey === FACTS) return aspectOfFact(thing.spot ?? thing.tag);
  const photo = listing.Media.find((m) => mediaKeyOf(m) === thing.mediaKey);
  const raw = thing.spot ?? thing.tag;
  return photo ? aspectOfTag(photo, thingOf(photo, raw) ?? raw) : null;
}

// Everyone with a line in the conversation, you as you are right now.
function peopleOf(post: FeedPost, viewer: ScorecardViewer | undefined): ScorecardPerson[] {
  const people = reactionLines(post.timeline).map(
    (line): ScorecardPerson => ({
      key: line.personKey ?? line.id,
      name: line.mine ? "You" : line.name,
      you: line.mine,
      anonymous: Boolean(line.fromPrivateChat),
      state: line.state,
      liked: line.photos,
      disliked: line.photoDislikes,
      at: line.at,
    }),
  );
  // You first, wherever people are named.
  if (!viewer) return people.sort((a, b) => Number(b.you) - Number(a.you));
  const own = people.find((person) => person.you);
  const live: ScorecardPerson = {
    key: own?.key ?? "you",
    name: "You",
    you: true,
    anonymous: false,
    state: viewer.state,
    liked: viewer.liked.map((id) => thingFrom(post.listing, id)),
    disliked: viewer.disliked.map((id) => thingFrom(post.listing, id)),
    at: own?.at ?? new Date().toISOString(),
  };
  const rest = people.filter((person) => !person.you);
  return hasTake(live) ? [live, ...rest] : rest;
}

const hasTake = (person: ScorecardPerson) =>
  Boolean(person.state.reaction) || person.liked.length > 0 || person.disliked.length > 0 || person.state.liked.length > 0;
// Liked it: the heart, or anything in its photos, short of passing.
const likedIt = (person: ScorecardPerson) =>
  person.state.reaction === "like" || (person.state.reaction !== "dislike" && (person.liked.length > 0 || person.state.liked.length > 0));
const passedIt = (person: ScorecardPerson) => person.state.reaction === "dislike";

// The things a person liked (or didn't), by name: specifics (picked, or what
// a like in a photo counts toward) and named things in the photos and facts,
// each once.
function thingsOf(listing: Listing, person: ScorecardPerson, tone: "like" | "dislike") {
  const aspects = [...aspectsOf(listing, person, tone)].map(aspectLabel) as string[];
  const named = (tone === "like" ? person.liked : person.disliked).map((thing) => thing.tag).filter((tag) => !isPointTag(tag));
  const seen = new Set<string>();
  return [...aspects, ...named].filter((thing) => {
    const key = thing.toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

// Each person's aspects, once each: picked, or liked in a photo or fact. What
// they didn't like counts only as picked with a pass, as the page's totals do.
function aspectsOf(listing: Listing, person: ScorecardPerson, tone: "like" | "dislike") {
  if (tone === "dislike") return new Set<Aspect>(person.state.disliked);
  return new Set<Aspect>([
    ...person.state.liked,
    ...person.liked.map((thing) => aspectOfThing(listing, thing)).filter((a): a is Aspect => Boolean(a)),
  ]);
}

// Counts per photo spot with you as you are now (the page's copy, less what
// you had, plus what you have).
function liveCounts(likes: PhotoLikes, viewer: ScorecardViewer | undefined) {
  const tally = (counts: Record<string, number>, had: string[], has: string[] | undefined) => {
    const out: Record<string, number> = { ...counts };
    if (!has) return out;
    for (const id of had) out[id] = (out[id] ?? 0) - 1;
    for (const id of has) out[id] = (out[id] ?? 0) + 1;
    return out;
  };
  return {
    likes: tally(likes.counts, likes.mine, viewer?.liked),
    dislikes: tally(likes.dislikes, likes.mineDisliked, viewer?.disliked),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function buildScorecard(
  post: FeedPost,
  mode: ScorecardMode,
  {
    viewer,
    agentName,
    siblings,
    myName,
  }: {
    viewer?: ScorecardViewer;
    agentName?: string;
    // The other homes on the same link, to compare with.
    siblings?: FeedPost[];
    // Your first name, so you're never "not yet" on your own link.
    myName?: string | null;
  } = {},
): Scorecard {
  const { listing } = post;
  const named = mode !== "public";
  const people = peopleOf(post, viewer);
  const counts = liveCounts(post.photoLikes, viewer);
  const comments = allComments(post.timeline);
  const top = topComments(post.timeline);
  const shownPrivate = comments.filter((c) => c.fromPrivateChat).length;
  const privateMore = mode === "public" ? Math.max(0, post.privateComments - shownPrivate) : 0;

  // ① How people feel.
  let likes: number;
  let passes: number;
  let total: number;
  // Of those, how many liked it and didn't pass (a pass with a heart on
  // something in its photos counts among the likes, as on the rail).
  let likedOnly: number;
  if (named) {
    likes = people.filter(likedIt).length;
    passes = people.filter(passedIt).length;
    total = people.filter((person) => likedIt(person) || passedIt(person)).length;
    likedOnly = likes;
  } else {
    // The page's own counts (everyone who liked it, a pass only from a
    // public page), with yours as it is now.
    const base = post.mine;
    const hadLikes = base.reaction === "like" || post.photoLikes.mine.length > 0;
    const hasLikes = viewer ? viewer.state.reaction === "like" || viewer.liked.length > 0 : hadLikes;
    likes = Math.max(0, post.likes - (hadLikes ? 1 : 0) + (hasLikes ? 1 : 0));
    const hadPass = base.reaction === "dislike";
    const hasPass = viewer ? viewer.state.reaction === "dislike" : hadPass;
    passes = Math.max(0, post.dislikes - (hadPass ? 1 : 0) + (hasPass ? 1 : 0));
    // Someone who passed but liked something in a photo counts once.
    const both = people.filter((person) => !person.anonymous && passedIt(person) && person.liked.length > 0).length;
    total = Math.max(likes, passes, likes + passes - both);
    likedOnly = Math.max(0, total - passes);
  }
  const quiet = total === 0 && comments.length === 0 && privateMore === 0 && people.every((person) => !hasTake(person));
  const few = named && total <= 5;
  const members = post.members ?? [];
  // (You're "You" here: by your own name too.)
  const reactedNames = new Set(
    people.filter(hasTake).flatMap((person) => (person.you && myName ? [person.name, myName] : [person.name]).map((n) => n.toLowerCase())),
  );
  const feel: Scorecard["feel"] = {
    likes,
    passes,
    comments: comments.length,
    privateMore,
    people: total,
    likedOnly,
    bar: likes + passes >= 3,
    named: few
      ? {
          liked: people.filter(likedIt).map((person) => person.name),
          passed: people.filter(passedIt).map((person) => person.name),
          notYet: members.filter((name) => !reactedNames.has(name.toLowerCase())),
        }
      : null,
  };

  // ③ By aspect.
  const peopleFor = (aspect: Aspect, tone: "like" | "dislike") =>
    people.filter((person) => aspectsOf(listing, person, tone).has(aspect));
  const youHave = (aspect: Aspect, tone: "like" | "dislike") => {
    const you = people.find((person) => person.you);
    return Boolean(you && aspectsOf(listing, you, tone).has(aspect));
  };
  const aspectCounts = (tone: "like" | "dislike"): AspectCounts => {
    if (named) {
      const out: AspectCounts = {};
      for (const person of people) for (const aspect of aspectsOf(listing, person, tone)) out[aspect] = (out[aspect] ?? 0) + 1;
      return out;
    }
    // Public: the page's totals (dislikes from public pages only), with
    // yours as it is now.
    const out: AspectCounts = { ...(tone === "like" ? post.aspects.liked : post.aspects.disliked) };
    const you = people.find((person) => person.you);
    if (viewer) {
      for (const aspect of aspectsOf(listing, basePerson(post), tone)) out[aspect] = Math.max(0, (out[aspect] ?? 0) - 1);
      if (you) for (const aspect of aspectsOf(listing, you, tone)) out[aspect] = (out[aspect] ?? 0) + 1;
    }
    return out;
  };

  const spotRows = (tone: "like" | "dislike") => spotRowsOf(listing, people, tone === "like" ? counts.likes : counts.dislikes, tone, named);
  const loved = spotRows("like");
  // Passes and dislikes show on public pages only when they were made there.
  const pause = spotRows("dislike");

  const aspectRows = (tone: "like" | "dislike"): AspectRow[] =>
    topAspects(aspectCounts(tone)).map(([aspect, count]) => {
      // You first, then the others the page may name.
      const who = peopleFor(aspect, tone).sort((a, b) => Number(b.you) - Number(a.you));
      const shown = who.filter((person) => !person.anonymous).map((person) => person.name);
      const rows = (tone === "like" ? loved : pause).filter((row) => aspectOfSpot(listing, row) === aspect);
      const about = new Set(rows.flatMap((row) => row.ids));
      return {
        aspect,
        label: aspectLabel(aspect),
        count,
        you: youHave(aspect, tone),
        names: shown,
        others: Math.max(0, count - shown.length),
        spots: rows,
        comments: top.filter((c) => c.spot && about.has(likeId(c.spot.mediaKey, c.spot.tag))),
      };
    });
  const likedAspects = aspectRows("like");
  const dislikedAspects = aspectRows("dislike");

  // ⑧ The facts.
  const factTally = (tag: FactTag) => ({
    tag,
    likes: counts.likes[likeId(FACTS, tag)] ?? 0,
    dislikes: counts.dislikes[likeId(FACTS, tag)] ?? 0,
    comments: comments.filter((c) => !c.parentId && c.spot?.mediaKey === FACTS && c.spot.tag === tag).length,
  });
  const none = { likes: 0, dislikes: 0, comments: 0 };
  const address = factTally("Address");
  const facts: FactRow[] = [
    { label: "Price", value: formatPrice(listing.ListPrice), ...factTally("Price") },
    ...(listing.LivingArea > 0
      ? [{ label: "Price per sq ft", value: formatPrice(Math.round(listing.ListPrice / listing.LivingArea)), ...none }]
      : []),
    { label: "Bedrooms", value: String(listing.BedroomsTotal), ...factTally("Bedrooms") },
    { label: "Bathrooms", value: String(listing.BathroomsTotalInteger), ...factTally("Bathrooms") },
    { label: "Living area", value: `${listing.LivingArea.toLocaleString("en-US")} sq ft`, ...factTally("Square footage") },
    ...(listing.YearBuilt ? [{ label: "Year built", value: String(listing.YearBuilt), ...none }] : []),
    ...(listing.PropertySubType ? [{ label: "Home type", value: listing.PropertySubType, ...none }] : []),
    ...(listing.OnMarketDate ? [{ label: "On the market since", value: onMarket(listing.OnMarketDate), ...none }] : []),
    // What people said about the address goes on a row of its own, so it
    // never looks like the ZIP code they liked.
    ...(address.likes + address.dislikes + address.comments > 0
      ? [{ label: "Address", value: listing.UnparsedAddress, ...address }]
      : []),
    { label: "City and ZIP", value: [listing.City, listing.PostalCode].filter(Boolean).join(" "), ...none },
  ];

  // ② What people say.
  const say = total >= 3 ? sayOf(listing, people, likedAspects, dislikedAspects, loved, pause, facts, named, total) : null;
  const latest = [...post.timeline.map((item) => item.at), post.buzz.lastActivityAt ?? ""].sort().at(-1) || null;

  // ④ Where you agree.
  const agree = named ? agreeOf(listing, people) : null;

  // ⑦ Your take.
  const you = people.find((person) => person.you);
  const state = viewer?.state ?? post.mine;
  const take = {
    verdict: state.reaction === "like" ? "You liked this." : state.reaction === "dislike" ? "You passed on this." : null,
    liked: takeList(state.liked, you?.liked ?? []),
    disliked: takeList(state.disliked, you?.disliked ?? []),
    reacted: Boolean(state.reaction),
    forYou: mode === "public" && post.reasons.length > 0 ? post.reasons : null,
  };

  // ⑩ Activity, on public pages: never a pass.
  const activity =
    mode === "public"
      ? [
          post.buzz.views > 0 && plural(post.buzz.views, "view"),
          post.buzz.sends > 0 && `agents sent it to ${plural(post.buzz.sends, "buyer")}`,
          // (Those shared here already show among the comments.)
          privateMore > 0 && `${plural(privateMore, "comment")} in private chats`,
        ]
          .filter(Boolean)
          .join(" · ") || null
      : null;

  return {
    mode,
    header: {
      address: `${listing.UnparsedAddress}, ${listing.City}`,
      line: [
        formatPrice(listing.ListPrice),
        `${listing.BedroomsTotal} bd`,
        `${listing.BathroomsTotalInteger} ba`,
        `${listing.LivingArea.toLocaleString("en-US")} sq ft`,
      ].join(" · "),
    },
    quiet,
    feel,
    say: say && say.length > 0 ? { sentences: say, from: fromLine(total, comments.length), at: latest } : null,
    aspects: {
      liked: likedAspects,
      // Passes, only where this viewer may see them: a public page's are its own.
      disliked: dislikedAspects.length > 0 ? dislikedAspects : null,
    },
    agree,
    photos:
      loved.length > 0 || pause.length > 0
        ? {
            loved,
            pause: pause.length > 0 ? pause : null,
            pauseNone: named && pause.length === 0 ? "Nobody has passed on anything yet." : null,
          }
        : null,
    said: {
      top: [...top]
        .sort((a, b) => b.likes - a.likes || b.at.localeCompare(a.at))
        .slice(0, 3),
      total: comments.length,
      privateMore,
    },
    take,
    people: mode === "agent" ? peopleTakes(listing, people, post.timeline) : null,
    facts,
    about: {
      remarks: listing.PublicRemarks?.trim() || null,
      listedBy:
        [listing.ListAgentFullName && `Listed by ${listing.ListAgentFullName}`, listing.ListOfficeName]
          .filter(Boolean)
          .join(" · ") || null,
      sample: isSampleListing(listing),
    },
    activity,
    compare: siblings && siblings.length > 0 ? compareOf([post, ...siblings], mode, agentName) : null,
  };
}

// You, as the page had you when it loaded (public pages count you in their totals).
function basePerson(post: FeedPost): ScorecardPerson {
  return {
    key: "you",
    name: "You",
    you: true,
    anonymous: false,
    state: post.mine,
    liked: post.photoLikes.mine.map((id) => thingFrom(post.listing, id)),
    disliked: post.photoLikes.mineDisliked.map((id) => thingFrom(post.listing, id)),
    at: "",
  };
}

const aspectOfSpot = (listing: Listing, row: SpotRow) =>
  aspectOfThing(listing, { tag: row.name, mediaUrl: null, mediaKey: row.spot.mediaKey, spot: row.spot.tag });

// "Oct 12 · 25 days" (the day it was listed, and how long ago).
function onMarket(date: string, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const listed = y && m && d ? new Date(y, m - 1, d) : new Date(date);
  if (Number.isNaN(listed.getTime())) return date;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.max(0, Math.round((today.getTime() - listed.getTime()) / 86_400_000));
  const day = listed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(listed.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
  return `${day} · ${days === 0 ? "today" : plural(days, "day")}`;
}

// Your take, as a list: what you picked, then named things in the photos
// and facts, each once, then how many other spots ("Vibe", "Covered porch",
// "Address", "2 spots in the photos").
function takeList(aspects: Aspect[], things: PhotoThing[]) {
  const named = things.map((thing) => thing.tag).filter((tag) => !isPointTag(tag));
  const seen = new Set<string>();
  const out = [...aspects.map(aspectLabel), ...named.map(capital)].filter((thing) => {
    const key = thing.toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });
  const spots = things.length - named.length;
  if (spots > 0) out.push(spots === 1 ? "1 spot in a photo" : `${spots} spots in the photos`);
  return out;
}

const fromLine = (reactions: number, comments: number) =>
  `From ${[plural(reactions, "reaction"), comments > 0 && plural(comments, "comment")].filter(Boolean).join(" and ")}`;

// The spots people liked (or didn't) in the photos, most first, then newest.
// A thing liked at two points (two taps on the front door) is one row, and
// its count is people, not taps.
function spotRowsOf(
  listing: Listing,
  people: ScorecardPerson[],
  counts: Record<string, number>,
  tone: "like" | "dislike",
  named: boolean,
): SpotRow[] {
  // Who's behind each row, by person; and how many the page counts but
  // can't say who (at most, on any one spot).
  const rows = new Map<string, { row: SpotRow; keys: Set<string>; unknown: number }>();
  const order = Object.entries(counts)
    .filter(([id, n]) => n > 0 && splitId(id).mediaKey !== FACTS)
    .sort((a, b) => b[1] - a[1]);
  for (const [id, count] of order) {
    const spot = splitId(id);
    const index = listing.Media.findIndex((m) => mediaKeyOf(m) === spot.mediaKey);
    const photo = listing.Media[index];
    if (!photo) continue;
    const thing = thingOf(photo, spot.tag);
    // Grouped by the thing on the photo; spots on nothing named stay apart.
    const key = thing ? `${spot.mediaKey}\u0000=${thing.toLowerCase()}` : id;
    const who = people.filter((person) =>
      (tone === "like" ? person.liked : person.disliked).some((t) => t.mediaKey === spot.mediaKey && t.spot === spot.tag),
    );
    const times = who.flatMap((person) =>
      (tone === "like" ? person.liked : person.disliked)
        .filter((t) => t.mediaKey === spot.mediaKey && t.spot === spot.tag)
        .map((t) => t.at ?? person.at),
    );
    const newest = times.sort().at(-1) ?? "";
    const names = who.filter((person) => named || !person.anonymous).map((person) => person.name);
    const unknown = Math.max(0, count - who.length);
    const had = rows.get(key);
    const at = had ?? {
      row: {
        id,
        ids: [],
        spot,
        name: spotName(listing, photo, index, spot.tag),
        where: [photo.ImageOf, `photo ${index + 1}`].filter(Boolean).join(" · "),
        photo,
        index,
        at: tagPosition(photo, spot.tag),
        count: 0,
        names: [],
        others: 0,
        newest,
        tone,
      },
      keys: new Set<string>(),
      unknown: 0,
    };
    at.row.ids.push(id);
    for (const person of who) at.keys.add(person.key);
    at.unknown = Math.max(at.unknown, unknown);
    at.row.names = [...new Set([...at.row.names, ...names])];
    if (newest > at.row.newest) at.row.newest = newest;
    at.row.count = at.keys.size + at.unknown;
    at.row.others = Math.max(0, at.row.count - at.row.names.length);
    rows.set(key, at);
  }
  return [...rows.values()].map(({ row }) => row).sort((a, b) => b.count - a.count || b.newest.localeCompare(a.newest));
}

// A theme: an aspect or a named thing chosen by two or more people (on an
// agent's link, a pass by one person can be named). Counted in people: on a
// link, everyone by name; in public, the most any one count gives.
type Theme = { label: string; count: number; who: string[] };

function themesOf(
  listing: Listing,
  people: ScorecardPerson[],
  aspects: AspectRow[],
  spots: SpotRow[],
  facts: FactRow[],
  tone: "like" | "dislike",
  named: boolean,
): Theme[] {
  const themes: Theme[] = [];
  const add = (label: string, count: number, who: string[]) => {
    const same = themes.find((t) => t.label.toLowerCase() === label.toLowerCase());
    if (same) {
      same.who = [...new Set([...same.who, ...who])];
      same.count = named ? same.who.length : Math.max(same.count, count);
    } else themes.push({ label, count: named ? who.length : count, who });
  };
  const holding = (match: (thing: PhotoThing) => boolean) =>
    named ? people.filter((p) => (tone === "like" ? p.liked : p.disliked).some(match)).map((p) => p.name) : [];
  for (const row of aspects) add(row.label, row.count, named ? people.filter((p) => aspectsOf(listing, p, tone).has(row.aspect)).map((p) => p.name) : []);
  for (const row of spots) {
    if (row.name.startsWith("A spot")) continue;
    add(row.name, row.count, row.names);
  }
  // The facts, as the facts table counts them: the price under "Price", the
  // address under "Location".
  for (const fact of facts) {
    const n = tone === "like" ? fact.likes : fact.dislikes;
    if (!fact.tag || n === 0) continue;
    const tag = fact.tag;
    const aspect = aspectOfFact(tag);
    add(aspect ? aspectLabel(aspect) : tag, n, holding((t) => t.mediaKey === FACTS && (t.spot ?? t.tag) === tag));
  }
  return themes.sort((a, b) => b.count - a.count);
}

// "Most people", "A few people": how many, in words, of everyone who reacted.
const howMany = (n: number, total: number) =>
  n > total / 2 ? "Most people" : n === 2 ? "A couple of people" : n <= 4 ? "A few people" : "People";

// One or two sentences on what people say, from what they did: no AI, no
// superlatives, no percentages, and the credit goes to the people.
function sayOf(
  listing: Listing,
  people: ScorecardPerson[],
  liked: AspectRow[],
  disliked: AspectRow[],
  loved: SpotRow[],
  pause: SpotRow[],
  facts: FactRow[],
  named: boolean,
  total: number,
): string[] {
  const allLikes = themesOf(listing, people, liked, loved, facts, "like", named);
  const likes = allLikes.filter((t) => t.count >= 2);
  const passes = themesOf(listing, people, disliked, pause, facts, "dislike", named);
  const sentences: string[] = [];
  const reactors = people.filter(hasTake).length;
  if (named && reactors <= 4) {
    // A few people on a link: by name.
    const shared = likes.filter((t) => t.who.length >= 2);
    if (shared[0]) {
      const who = shared[0].who;
      const same = shared.filter((t) => t.who.length === who.length && t.who.every((n) => who.includes(n))).slice(0, 3);
      sentences.push(`${namesList(who)} ${who.length === 2 ? "both" : "all"} like ${thingsList(same.map((t) => t.label))}.`);
    }
    const pass = passes.find((t) => t.who.length >= 1);
    if (pass) {
      const what = passes.filter((t) => t.who.join() === pass.who.join()).slice(0, 3);
      sentences.push(`${namesList(pass.who)} didn't like ${thingsList(what.map((t) => t.label))}.`);
    } else {
      const solo = allLikes.find((t) => t.who.length === 1);
      if (solo && sentences.length > 0) sentences.push(`Only ${solo.who[0]} liked ${thingsList([solo.label])}.`);
    }
    return sentences.slice(0, 2);
  }
  // The top three, each said with the words true of it: "Most people like
  // the kitchen and the aesthetic. A few people like the exterior."
  const groups: { who: string; labels: string[] }[] = [];
  for (const theme of likes.slice(0, 3)) {
    const who = howMany(theme.count, total);
    if (groups.at(-1)?.who === who) groups.at(-1)!.labels.push(theme.label);
    else groups.push({ who, labels: [theme.label] });
  }
  const said = groups.map((group) => `${group.who} like ${thingsList(group.labels)}.`);
  const passing = passes.filter((t) => t.count >= 2 || (named && t.who.length === 1));
  let pass: string | null = null;
  if (passing[0]) {
    const n = passing[0].count;
    const one = named && passing[0].who.length === 1 ? passing[0].who : null;
    // The same people, if it's one person by name; otherwise, as many.
    const what = passing.filter((t) => t.count === n && (!one || t.who.join() === one.join())).slice(0, 3);
    const who = one ? one[0] : `${capital(numberWord(n))} people`;
    pass = `${who} didn't like ${thingsList(what.map((t) => t.label))}.`;
  }
  if (said[0]) sentences.push(said[0]);
  if (pass) sentences.push(pass);
  else if (said[1]) sentences.push(said[1]);
  return sentences;
}

// Where the people on a link agree: what they all like, and what only one does.
function agreeOf(listing: Listing, people: ScorecardPerson[]): Scorecard["agree"] {
  const active = people.filter((person) => thingsOf(listing, person, "like").length > 0);
  if (active.length < 2) return null;
  const key = (thing: string) => thing.toLowerCase();
  const likesOf = new Map(active.map((person) => [person, thingsOf(listing, person, "like")]));
  const all = likesOf.get(active[0])!.filter((thing) => active.every((p) => likesOf.get(p)!.some((t) => key(t) === key(thing))));
  const lines: { label: string; things: string[] }[] = [];
  if (all.length > 0) lines.push({ label: active.length === 2 ? "Both like" : "Everyone likes", things: all });
  for (const person of active) {
    const only = likesOf
      .get(person)!
      .filter((thing) => !active.some((other) => other !== person && likesOf.get(other)!.some((t) => key(t) === key(thing))));
    if (only.length > 0) lines.push({ label: `Only ${person.you ? "you" : person.name}`, things: only });
  }
  return lines.length > 0 ? lines : null;
}

// The agent's view: one line per person, with their verdict, what they liked
// and passed on, and the last thing they said.
function peopleTakes(listing: Listing, people: ScorecardPerson[], timeline: TimelineItem[]): PersonTake[] {
  const said = topComments(timeline).filter((c) => !c.isAgent);
  const lastOf = (person: ScorecardPerson) =>
    said.filter((c) => (c.personKey ? c.personKey === person.key : c.name === person.name)).sort((a, b) => b.at.localeCompare(a.at))[0] ??
    null;
  // People who only commented have a line too.
  const talkers = said
    .filter((c) => !people.some((person) => (c.personKey ? c.personKey === person.key : c.name === person.name)))
    .reduce<Map<string, TimelineComment>>((map, c) => map.set(c.personKey ?? c.name, c), new Map());
  return [
    ...people.map((person) => ({
      key: person.key,
      name: person.name,
      verdict: passedIt(person) ? "Passed" : person.state.reaction === "like" ? "Liked it" : likedIt(person) ? "Liked things in the photos" : "No verdict yet",
      likes: thingsOf(listing, person, "like").slice(0, 3),
      passes: thingsOf(listing, person, "dislike").slice(0, 3),
      comment: lastOf(person),
    })),
    ...[...talkers.values()].map((c) => ({
      key: c.personKey ?? c.name,
      name: c.name,
      verdict: "No verdict yet",
      likes: [],
      passes: [],
      comment: said.filter((s) => (s.personKey ?? s.name) === (c.personKey ?? c.name)).sort((a, b) => b.at.localeCompare(a.at))[0] ?? c,
    })),
  ];
}

// The homes on a link side by side: each aspect, a heart or pass count per home.
function compareOf(posts: FeedPost[], mode: ScorecardMode, agentName?: string): Scorecard["compare"] {
  const cards = posts.map((post) => buildScorecard(post, mode, { agentName }));
  const aspects = new Set<Aspect>(
    cards.flatMap((card) => [...card.aspects.liked, ...(card.aspects.disliked ?? [])].map((row) => row.aspect)),
  );
  if (aspects.size === 0) return null;
  const rows = [...aspects].map((aspect) => ({
    aspect,
    label: aspectLabel(aspect),
    cells: cards.map((card) => ({
      likes: card.aspects.liked.find((row) => row.aspect === aspect)?.count ?? 0,
      passes: card.aspects.disliked?.find((row) => row.aspect === aspect)?.count ?? 0,
    })),
  }));
  return {
    homes: posts.map((post) => post.listing.UnparsedAddress),
    rows: rows.sort((a, b) => b.cells[0].likes - a.cells[0].likes || a.label.localeCompare(b.label)),
  };
}
