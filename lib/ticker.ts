// The line above the price: what people did on a home lately, one thing at a
// time, each pointing at where they did it. Free of server code, so the
// browser can use it too.
import type { Headline } from "./feed";
import type { Listing } from "./listings/types";
import { FACTS, isPointTag, mediaKeyOf, spotName, tagPhrase, tagPosition, thingOf } from "./photos";
import { describeReaction, type ReactionState } from "./reactions";
import type { TimelineItem } from "./timeline";

// One thing someone did, already cut down to what this viewer may see: on
// public pages, never a dislike or a pass, private words or a private name
// (the server sees to that before it reaches the page).
export type TickerEvent = {
  // Its kind and where it came from, the same from one load to the next.
  id: string;
  kind:
    | "spot-like"
    | "spot-dislike"
    | "fact-like"
    | "fact-dislike"
    | "comment"
    | "private-comment"
    | "reaction"
    | "anon-likes"
    | "sent";
  // `key`: on an agent's link, who it is, the same on every load and giving
  // nothing away (two people can share a first name). `agent`: "You" is the
  // agent, on their own link, so their face stays in ink, with their `name`.
  who: { tone: TickerTone; name: string | null; profileId?: string; key?: string; agent?: boolean };
  at: string;
  // The photo it's in, or the facts (FACTS).
  mediaKey?: string;
  // The tag as it was left: "@62.3,68.1", "Front door", "Price".
  spot?: string;
  // What they said, cut short, where it may be shown.
  body?: string;
  commentId?: string;
  // A reaction to the home itself.
  state?: ReactionState;
  // Folded likes: how many.
  count?: number;
};

// You; someone by name; an agent's own client (to that agent); the agent on
// their link; or someone who stays unnamed here.
export type TickerTone = "you" | "person" | "client" | "agent" | "anonymous";

// At most this many recent things for each home, newest first.
export const TICKER_EVENTS = 12;
// At most this many go round at once.
export const CYCLE_MOST = 5;
// What someone said, cut to this many characters (at a word, with "…").
export const TICKER_WORDS = 140;

export const clipWords = (body: string, most = TICKER_WORDS) => {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= most) return text;
  const cut = text.slice(0, most - 1);
  return `${cut.includes(" ") ? cut.replace(/\s+\S*$/, "") : cut}…`;
};

const isDislike = (event: TickerEvent) =>
  event.kind === "spot-dislike" || event.kind === "fact-dislike" || event.state?.reaction === "dislike";

// Something in a photo (not the facts), where it can be pointed at.
export const onPhoto = (event: TickerEvent) =>
  Boolean(event.mediaKey && event.spot && event.mediaKey !== FACTS) &&
  (event.kind === "spot-like" || event.kind === "spot-dislike" || event.kind === "comment");

export const onFact = (event: TickerEvent) =>
  event.mediaKey === FACTS &&
  Boolean(event.spot) &&
  (event.kind === "fact-like" || event.kind === "fact-dislike" || event.kind === "comment");

const newestFirst = (a: TickerEvent, b: TickerEvent) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id);

// On an agent's link, where there's no feed query: what's in the home's own
// thread, already only the link's. What you did or said is "You", like
// everyone's own; `agentViewing`: the agent on their own link, whose words
// there are theirs ("You", with their face in ink).
export function eventsFromTimeline(items: TimelineItem[], { agentViewing = false } = {}): TickerEvent[] {
  const events: TickerEvent[] = [];
  for (const item of items) {
    if (item.kind === "comment") {
      // (Replies read as part of what they answer, in the comments, not on their own.)
      if (item.parentId) continue;
      events.push({
        id: `comment:${item.id}`,
        kind: "comment",
        who: item.isAgent
          ? agentViewing
            ? { tone: "you", name: item.name, agent: true }
            : { tone: "agent", name: item.name, ...(item.personKey && { key: item.personKey }) }
          : item.mine
            ? { tone: "you", name: null }
            : item.fromPrivateChat
              ? { tone: "anonymous", name: null }
              : {
                  tone: "person",
                  name: item.name,
                  ...(item.profileId && { profileId: item.profileId }),
                  ...(item.personKey && { key: item.personKey }),
                },
        at: item.at,
        ...(item.spot && { mediaKey: item.spot.mediaKey, spot: item.spot.tag }),
        body: clipWords(item.body),
        commentId: item.id,
      });
      continue;
    }
    const who: TickerEvent["who"] = item.isAgent
      ? agentViewing
        ? { tone: "you", name: item.name, agent: true }
        : { tone: "agent", name: item.name, ...(item.personKey && { key: item.personKey }) }
      : item.mine
      ? { tone: "you", name: null }
      : item.fromPrivateChat
        ? { tone: "anonymous", name: null }
        : {
            tone: "person",
            name: item.name,
            ...(item.profileId && { profileId: item.profileId }),
            ...(item.personKey && { key: item.personKey }),
          };
    const person = item.mine ? "you" : (item.personKey ?? (item.fromPrivateChat ? item.id : item.name));
    const { state } = item;
    if (state.reaction || state.liked.length || state.disliked.length) {
      events.push({ id: `reaction:${person}`, kind: "reaction", who, at: item.reactedAt ?? item.at, state });
    }
    for (const [things, like] of [
      [item.photos, true],
      [item.photoDislikes, false],
    ] as const) {
      for (const thing of things) {
        if (!thing.mediaKey || !thing.spot) continue;
        const fact = thing.mediaKey === FACTS;
        events.push({
          id: `${like ? "like" : "dislike"}:${person}:${thing.mediaKey}\u0000${thing.spot}`,
          kind: fact ? (like ? "fact-like" : "fact-dislike") : like ? "spot-like" : "spot-dislike",
          who,
          at: thing.at ?? item.at,
          mediaKey: thing.mediaKey,
          spot: thing.spot,
        });
      }
    }
  }
  // The agent's own take leads the line for everyone else on their link: it's
  // what they sent it to say, their words before their likes. Then the newest first.
  const agentFirst = (event: TickerEvent) => (event.who.tone === "agent" ? (event.kind === "comment" ? 0 : 1) : 2);
  return events.sort((a, b) => agentFirst(a) - agentFirst(b) || newestFirst(a, b)).slice(0, TICKER_EVENTS);
}

// From the one latest thing, where a page has nothing more (an older caller).
export function eventsFromHeadline(headline: Headline | null): TickerEvent[] {
  if (!headline) return [];
  const id = `headline:${headline.kind}:${headline.at}`;
  if (headline.kind === "sent") return [{ id, kind: "sent", who: { tone: headline.who, name: null }, at: headline.at }];
  const who: TickerEvent["who"] =
    headline.who === "anonymous"
      ? { tone: "anonymous", name: null }
      : { tone: headline.who === "client" ? "client" : "person", name: headline.name };
  if (headline.kind === "comment") {
    return [{ id, kind: headline.who === "anonymous" ? "private-comment" : "comment", who, at: headline.at }];
  }
  if (headline.kind === "photo") {
    return [
      {
        id,
        kind: headline.mediaKey === FACTS ? "fact-like" : "spot-like",
        who,
        at: headline.at,
        ...(headline.mediaKey && { mediaKey: headline.mediaKey }),
        spot: headline.tag,
      },
    ];
  }
  return [{ id, kind: "reaction", who, at: headline.at, state: headline.state }];
}

// Who goes round, in what order: the newest that isn't a dislike first, so
// what's said first is good news; then what's on the photo on screen; then
// the people closest to you (the link's, or your own clients), and spots
// before what was said, before reactions to the home, folded likes and sends.
// One item for each person and spot, and no more than two for anyone; of
// unnamed people's, only one of any that would read the same ("A buyer
// commented privately").
export function buildCycle(
  events: TickerEvent[],
  photoKey: string | undefined,
  mode: "public" | "share",
  // Only what happened on the photo on screen (and about the home as a
  // whole): what's shown can always be pointed at, right there.
  photoOnly = false,
) {
  if (photoOnly) events = events.filter((event) => !onPhoto(event) || event.mediaKey === photoKey);
  if (events.length === 0) return [];
  const here = (event: TickerEvent) => Boolean(photoKey) && event.mediaKey === photoKey && onPhoto(event);
  // It leads with the newest (what you've just done, when you have), or on an
  // agent's link, the agent's own words.
  const first =
    events.find((event) => event.who.tone === "agent" && event.kind === "comment") ??
    events.find((event) => !isDislike(event)) ??
    events[0];
  const close = (event: TickerEvent) =>
    mode === "share" ? event.who.tone !== "anonymous" : event.who.tone === "client";
  const kindTier = (event: TickerEvent) =>
    onPhoto(event)
      ? 0
      : event.kind === "comment" || event.kind === "private-comment" || onFact(event)
        ? 1
        : event.kind === "reaction"
          ? 2
          : event.kind === "anon-likes"
            ? 3
            : 4;
  // On their link, the agent's own take goes round before anyone else's.
  const lead = (event: TickerEvent) => (event.who.tone === "agent" ? (event.kind === "comment" ? 0 : 1) : 2);
  const rest = events
    .filter((event) => event !== first)
    .sort(
      (a, b) =>
        lead(a) - lead(b) ||
        Number(here(b)) - Number(here(a)) ||
        (here(a) ? 0 : Number(close(b)) - Number(close(a)) || kindTier(a) - kindTier(b)) ||
        newestFirst(a, b),
    );
  const personOf = (event: TickerEvent) =>
    event.who.tone === "you"
      ? "you"
      : event.who.tone === "anonymous" || !event.who.name
        ? null
        : `${event.who.tone}:${event.who.key ?? event.who.profileId ?? event.who.name}`;
  const placeOf = (event: TickerEvent) =>
    event.mediaKey && event.spot ? `${event.mediaKey}\u0000${event.spot}` : event.kind === "reaction" ? "home" : event.id;
  // How an unnamed person's item reads: two that read the same are one.
  const readsAs = (event: TickerEvent) =>
    JSON.stringify([event.kind, event.mediaKey, event.spot, event.body, event.state, event.count]);
  const cycle: TickerEvent[] = [];
  const seen = new Set<string>();
  const perPerson = new Map<string, number>();
  for (const event of [first, ...rest]) {
    const person = personOf(event);
    const key = person ? `${person}\u0001${placeOf(event)}` : `anonymous\u0001${readsAs(event)}`;
    // (The agent's take, all of it, as far as the line holds.)
    const most = event.who.tone === "agent" ? CYCLE_MOST : 2;
    if (seen.has(key) || (person && (perPerson.get(person) ?? 0) >= most)) continue;
    seen.add(key);
    if (person) perPerson.set(person, (perPerson.get(person) ?? 0) + 1);
    cycle.push(event);
    if (cycle.length === CYCLE_MOST) break;
  }
  return cycle;
}

// Who, in a sentence: "Maya"; "Toby, your client,"; "Jordan (your agent)".
function whoText(who: TickerEvent["who"]) {
  if (who.tone === "you") return "You";
  if (who.tone === "anonymous" || !who.name) return "A buyer";
  if (who.tone === "client") return `${who.name}, your client,`;
  if (who.tone === "agent") return `${who.name.split(" ")[0] || who.name} (your agent)`;
  return who.name;
}

// A spot, in a sentence: "the front door"; on the photo on screen, "a spot in
// this photo" (or, where it can't be pointed at, "a spot near the bottom right
// of this photo"); on another, "a spot in the kitchen", "a spot outside".
// `names`: what of where it is that already says, so it isn't said twice.
function thingText(listing: Listing, event: TickerEvent, photoKey: string | undefined, unseen: boolean) {
  const plain = (thing: string) => ({ thing, names: null as "room" | "photo" | null });
  if (!event.mediaKey || !event.spot) return plain("it");
  if (event.mediaKey === FACTS) return plain(tagPhrase(event.spot));
  const photo = listing.Media.find((m) => mediaKeyOf(m) === event.mediaKey);
  const thing = thingOf(photo, event.spot);
  if (thing) return plain(tagPhrase(thing));
  if (!isPointTag(event.spot)) return plain(spotName(listing, { mediaKey: event.mediaKey, tag: event.spot }));
  if (event.mediaKey === photoKey) {
    const at = unseen && photo ? tagPosition(photo, event.spot) : null;
    return { thing: at ? `a spot ${partOf(at)} of this photo` : "a spot in this photo", names: "photo" as const };
  }
  const room = photo?.ImageOf;
  if (room && /exterior|front|facade/i.test(room)) return { thing: "a spot outside", names: "room" as const };
  if (room) return { thing: `a spot in the ${room.toLowerCase()}`, names: "room" as const };
  return { thing: spotName(listing, { mediaKey: event.mediaKey, tag: event.spot }), names: "photo" as const };
}

// Which part of a photo a point is in: "near the bottom right", "near the
// top", "in the middle".
function partOf({ x, y }: { x: number; y: number }) {
  const across = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : null;
  const down = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : null;
  return across || down ? `near the ${[down, across].filter(Boolean).join(" ")}` : "in the middle";
}

// "2h" → "2 hours ago"; "just now", "this week"; a date as it is.
export function spokenAgo(ago: string) {
  const match = /^(\d+)([mhd])$/.exec(ago);
  if (!match) return /^[a-z]/.test(ago) ? ago.charAt(0).toUpperCase() + ago.slice(1) : `On ${ago}`;
  const n = Number(match[1]);
  const unit = { m: "minute", h: "hour", d: "day" }[match[2] as "m" | "h" | "d"];
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

// Between the parts of where and when: a line may break before the dot, never
// after it ("· 2h" stays together, as does "photo 3").
export const DOT = " \u00b7\u00a0";
const photoNumber = (index: number) => `photo\u00a0${index + 1}`;

// What a tap on it does, said at the end of its name.
export type TickerTap = "spot" | "other-photo" | "spot-comments" | "comment" | "fact" | "home";

// How one item reads. `sentence`: who did what, in full ("Bea commented on
// the porch"), for its name. `line1`: the same, shown, shorter for a comment
// on a spot ("Bea, on the porch": the speech bubble and the words below say
// the rest). `words`: what they said, quoted. `meta`: where (when it isn't
// said already) and when, after the words or the sentence. `line2`: the
// words and meta together.
export function eventText(
  event: TickerEvent,
  listing: Listing,
  {
    photoKey,
    ago,
    // The spot's on the photo on screen but can't be pointed at (it's under
    // the buttons): the line says where.
    unseen = false,
  }: { photoKey: string | undefined; ago: string; unseen?: boolean },
) {
  const who = whoText(event.who);
  const { thing, names } = thingText(listing, event, photoKey, unseen);
  const index = event.mediaKey ? listing.Media.findIndex((m) => mediaKeyOf(m) === event.mediaKey) : -1;
  const elsewhere = onPhoto(event) && index >= 0 && event.mediaKey !== photoKey;
  const where =
    names === "photo"
      ? null
      : elsewhere
        ? [names === "room" ? null : listing.Media[index].ImageOf, photoNumber(index)].filter(Boolean).join(DOT)
        : onPhoto(event) && unseen
          ? "this photo"
          : null;
  let sentence: string;
  switch (event.kind) {
    case "spot-like":
    case "fact-like":
      sentence = `${who} liked ${thing}`;
      break;
    case "spot-dislike":
    case "fact-dislike":
      sentence = `${who} didn't like ${thing}`;
      break;
    case "comment":
      sentence = event.mediaKey && event.spot ? `${who} commented on ${thing}` : `${who} commented`;
      break;
    case "private-comment":
      sentence = `${who} commented privately`;
      break;
    case "reaction":
      sentence = `${who} ${describeReaction(event.state ?? { reaction: "like", liked: [], disliked: [] })}`;
      break;
    case "anon-likes":
      sentence = `${event.count ?? 2} buyers liked this home`;
      break;
    case "sent":
      sentence = event.who.tone === "you" ? "You sent this to a client" : "An agent sent this to a buyer";
      break;
  }
  const words = event.body ? `“${event.body}”` : null;
  const line1 =
    words && event.kind === "comment" && event.mediaKey && event.spot ? `${who.replace(/,$/, "")}, on ${thing}` : sentence;
  // Under what was said, only which photo (the place is in line 1).
  const meta = [words ? (elsewhere ? photoNumber(index) : null) : where, ago].filter(Boolean).join(DOT);
  const line2 = [words, meta].filter(Boolean).join(DOT);
  const tap: TickerTap =
    event.kind === "comment" && onPhoto(event)
      ? event.who.tone === "client"
        ? elsewhere
          ? "other-photo"
          : "spot"
        : "spot-comments"
      : onPhoto(event)
        ? elsewhere
          ? "other-photo"
          : "spot"
        : onFact(event)
          ? event.kind === "comment"
            ? "spot-comments"
            : "fact"
          : event.kind === "comment" && event.commentId
            ? "comment"
            : "home";
  return { who, sentence, line1, line2, meta, where, words, tap, index, elsewhere };
}
