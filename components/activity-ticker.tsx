"use client";

import { ChevronRight, Hand, Pause, Play, User } from "lucide-react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EventFace, markDot, markOf } from "@/components/spot-highlight";
import { cn, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { mediaKeyOf, tagPosition } from "@/lib/photos";
import { buildCycle, eventText, onPhoto, spokenAgo, type TickerEvent, type TickerTap } from "@/lib/ticker";

// What people did on a home lately, in the slot above the price, one thing at
// a time: who and what, then what they said (or where) and when, with their
// face on the photo right where they did it. It holds still on the newest
// first, then, on the home on screen, goes round the few that matter most,
// each long enough to read and look; the old line lifts away as the next
// rises into its place. After three rounds (or a minute and a half) it rests
// on who liked the home. It stops for anything else you're doing, and it can
// be paused for the whole visit.

// How long each one shows: longer for more words.
const DWELL_MS = 6000;
const LONGEST_MS = 8000;
const dwellFor = (chars: number) => Math.min(LONGEST_MS, DWELL_MS + Math.max(0, Math.ceil((chars - 60) / 60)) * 1000);
// How long it goes round before it rests.
const ROUNDS = 3;
const BUDGET_MS = 90_000;
// How soon after a new photo comes to rest the line turns to what's on it.
const SETTLE_MS = 400;
// How long the old line takes to leave (or, with reduced motion, to fade).
const OUT_MS = 200;
const FADE_MS = 150;

// Paused for this visit: every home, until this tab closes (a new tab starts
// again), so one tap never switches it off for good.
const PAUSE_KEY = "buybox:ticker";
const pauseListeners = new Set<() => void>();
let pausedNow: boolean | null = null;
const readPaused = () => {
  if (pausedNow === null) {
    try {
      pausedNow = sessionStorage.getItem(PAUSE_KEY) === "paused";
    } catch {
      pausedNow = false;
    }
  }
  return pausedNow;
};
const subscribePaused = (onChange: () => void) => {
  pauseListeners.add(onChange);
  return () => {
    pauseListeners.delete(onChange);
  };
};
function pauseForVisit(paused: boolean) {
  pausedNow = paused;
  try {
    if (paused) sessionStorage.setItem(PAUSE_KEY, "paused");
    else sessionStorage.removeItem(PAUSE_KEY);
  } catch {
    // Storage off: paused for as long as the page is open.
  }
  pauseListeners.forEach((listener) => listener());
}

// Reduced motion, as the system has it now (it can change while the page is open).
const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const query = matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeMotion,
    () => matchMedia(REDUCE).matches,
    () => false,
  );

// Something else has the page just now: a sheet or a prompt is open, someone's
// typing, or the tab is out of sight. The line waits.
const busy = () =>
  document.visibilityState === "hidden" ||
  Boolean(document.querySelector("dialog[open]")) ||
  Boolean(document.activeElement?.closest("input, textarea, select, [contenteditable], [data-composer]"));

// A round of the budget: how many have shown, how many may, and until when.
type Run = { turns: number; limit: number | null; until: number | null };
const FRESH: Run = { turns: 1, limit: null, until: null };

export type Ticker = ReturnType<typeof useTicker>;

export function useTicker({
  events,
  listing,
  photoKey,
  mode,
  active,
  held,
  pinHovered = null,
  likes,
}: {
  events: TickerEvent[];
  listing: Listing;
  // The photo that's come to rest on screen.
  photoKey: string | undefined;
  mode: "public" | "share";
  // This home is the one on screen (and not just a look, beside the map).
  active: boolean;
  // Something's over it or under way: a card, a sheet, a finger on the photo,
  // the photo sliding.
  held: boolean;
  // A pointer on a spot on the photo (its tag): on this one's, it waits.
  pinHovered?: string | null;
  // How many people liked the home: what it rests on.
  likes: number;
}) {
  const reduced = useReducedMotion();
  const pausedForVisit = useSyncExternalStore(subscribePaused, readPaused, () => false);
  const cycle = useMemo(() => buildCycle(events, photoKey, mode), [events, photoKey, mode]);
  const [id, setId] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  // Stopped on this home: by a tap on it, or the keyboard coming in. Until
  // Play, or another home.
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  // The line is being looked at: a pointer on it, or the keyboard.
  const [looking, setLooking] = useState(false);
  const [run, setRun] = useState<Run>(FRESH);
  // Counts requests for a fresh dwell.
  const [dwell, setDwell] = useState(0);

  const found = cycle.findIndex((event) => event.id === id);
  const index = found === -1 ? 0 : found;
  // Resting with nobody's like to show: the first, still.
  const summary = resting && likes > 0;
  const item = summary ? null : (cycle[index] ?? null);

  // Off screen, a home shows its first, still, and starts afresh when it's back.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setId(null);
      setResting(false);
      setStopped(false);
      setHovered(false);
      setLooking(false);
      setRun(FRESH);
    }
  }
  // Something new at the top (someone just said something): straight to it.
  const top = events[0]?.id ?? null;
  const [topSeen, setTopSeen] = useState(top);
  if (top !== topSeen) {
    setTopSeen(top);
    setId(null);
    setResting(false);
    setRun(FRESH);
  }
  // On to another photo: once it's come to rest, to the newest thing on it.
  const [photoSeen, setPhotoSeen] = useState(photoKey);
  const [turned, setTurned] = useState(0);
  if (photoKey !== photoSeen) {
    setPhotoSeen(photoKey);
    setTurned((n) => n + 1);
  }

  const multi = cycle.length > 1;
  // Going round, unless paused, stopped, resting or still by choice.
  const rotating = multi && !reduced && !pausedForVisit && !stopped && !resting;
  const running = rotating && active && !held && !hovered && !(pinHovered !== null && item?.spot === pinHovered);
  const text = item ? eventText(item, listing, { photoKey, ago: timeAgo(item.at) }) : null;
  const dwellMs = text ? dwellFor(text.line1.length + text.line2.length) : DWELL_MS;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      if (busy()) {
        setDwell((n) => n + 1);
        return;
      }
      const now = Date.now();
      const most = run.limit ?? ROUNDS * cycle.length;
      if (run.turns >= most || (run.until !== null && now >= run.until)) {
        setResting(true);
        return;
      }
      setId(cycle[(index + 1) % cycle.length].id);
      setRun({ turns: run.turns + 1, limit: run.limit, until: run.until ?? now - dwellMs + BUDGET_MS });
    }, dwellMs);
    return () => clearTimeout(timer);
  }, [running, index, dwell, dwellMs, run, cycle]);

  const latest = useRef({ cycle, stopped, resting, photoKey, active });
  useLayoutEffect(() => {
    latest.current = { cycle, stopped, resting, photoKey, active };
  });
  useEffect(() => {
    if (turned === 0) return;
    const timer = setTimeout(() => {
      const now = latest.current;
      if (!now.active || now.stopped) return;
      const target = now.cycle.find((event) => onPhoto(event) && event.mediaKey === now.photoKey);
      if (!target) return;
      setId(target.id);
      // Resting already: one more round, for this photo.
      if (now.resting) {
        setResting(false);
        setRun({ turns: 1, limit: now.cycle.length, until: null });
      }
      setDwell((n) => n + 1);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [turned]);

  // Which showing this is, and whether it's the first of this one (for the
  // ripple), and what was up before it (for it to leave).
  const shownKey = summary ? "rest" : (item?.id ?? "none");
  const [shown, setShown] = useState({ key: shownKey, n: 0, first: true, from: null as string | null });
  const [seen, setSeen] = useState<string[]>([shownKey]);
  if (shown.key !== shownKey) {
    const first = !seen.includes(shownKey);
    setShown({ key: shownKey, n: shown.n + 1, first, from: shown.key });
    setSeen(first ? [...seen, shownKey] : seen);
  }
  if (!active && seen.length > 1) setSeen([shownKey]);

  return {
    cycle,
    item,
    index,
    summary,
    resting,
    rotating,
    running,
    reduced,
    looking,
    shown,
    // Play shows in place of Pause: paused, stopped, or resting.
    halted: pausedForVisit || stopped || resting,
    setHovered,
    setLooking,
    pause: () => pauseForVisit(true),
    play: () => {
      pauseForVisit(false);
      setStopped(false);
      if (resting) {
        setResting(false);
        setId(null);
        setRun(FRESH);
      }
      setDwell((n) => n + 1);
    },
    // With reduced motion, one step at a time, by hand.
    step: () => setId(cycle[(index + 1) % cycle.length]?.id ?? null),
    stop: () => setStopped(true),
  };
}

// What a home's activity reads as, for the line and for its leaving copy.
type Shown =
  | { kind: "item"; event: TickerEvent; words: ReturnType<typeof eventText>; ago: string; thumb: Thumb | null }
  | { kind: "rest"; text: string; faces: (string | null)[] };

type Thumb = { url: string; x: number; y: number; dot: string; ratio: number };

// "Maya, Sam and 4 others liked this"; "You and Maya liked this"; "6 people liked this"
function likedBy(likes: number, names: string[], you: boolean) {
  const named = [...(you ? ["you"] : []), ...names].slice(0, Math.min(2, likes));
  const rest = likes - named.length;
  const text =
    named.length === 0
      ? `${likes} ${likes === 1 ? "person" : "people"} liked this`
      : rest > 0
        ? `${named.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"} liked this`
        : `${named.join(" and ")} liked this`;
  return { named, rest, text: text.charAt(0).toUpperCase() + text.slice(1) };
}

export function ActivityTicker({
  ticker,
  listing,
  photoKey,
  myName,
  liked,
  hint,
  unseen,
  underline,
  onTap,
}: {
  ticker: Ticker;
  listing: Listing;
  photoKey: string | undefined;
  myName: string | null;
  // Who liked the home, for the rest: how many, the names the page may give
  // (never yours), and whether you did.
  liked: { count: number; names: string[]; you: boolean };
  // Said when nobody's done anything yet (null: nothing).
  hint: string | null;
  // The spot is on this photo, but under the buttons, so it isn't pointed at.
  unseen: boolean;
  // A pointer is on this one's spot on the photo.
  underline: boolean;
  // Unset beside the map, where it's just to read: the first, still.
  onTap?: (event: TickerEvent, tap: TickerTap, photoIndex: number) => void;
}) {
  const { cycle, item, summary, reduced, shown } = ticker;
  const readOnly = !onTap;
  // The old line, while it leaves.
  const [gone, setGone] = useState(0);
  useEffect(() => {
    if (shown.n === 0) return;
    const timer = setTimeout(() => setGone(shown.n), reduced ? FADE_MS : OUT_MS);
    return () => clearTimeout(timer);
  }, [shown.n, reduced]);

  if (cycle.length === 0) {
    if (!hint) return null;
    return (
      <div role="group" aria-label="Recent activity" className="flex min-w-0 items-center gap-2.5 text-white/70 split:text-stone-600">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 split:bg-stone-100">
          <Hand size={16} className="text-white/60 split:text-stone-500" />
        </span>
        <p className="line-clamp-2 text-[15px] leading-5">{hint}</p>
      </div>
    );
  }

  const rest = likedBy(liked.count, liked.names, liked.you);
  const describe = (key: string | null): Shown | null => {
    if (key === "rest") {
      const faces = [
        ...rest.named.map((name) => (name === "you" ? (myName ?? "") : name)),
        ...(rest.rest > 0 ? [null] : []),
      ].slice(0, 3);
      return { kind: "rest", text: rest.text, faces };
    }
    const event = cycle.find((e) => e.id === key) ?? (item?.id === key ? item : null);
    if (!event) return null;
    const ago = event.kind === "anon-likes" ? "this week" : timeAgo(event.at);
    const words = eventText(event, listing, { photoKey, ago, unseen: event === item && unseen });
    return { kind: "item", event, words, ago, thumb: words.elsewhere ? thumbOf(listing, event) : null };
  };
  const now = summary ? describe("rest") : item ? describe(item.id) : null;
  const leaving = shown.n > gone && shown.from ? describe(shown.from) : null;
  const moved = shown.n > 0;

  // Said in full, with when and what a tap does: "Bea commented on the porch:
  // Love the porch swing. 2 hours ago. See the comments about it."
  let name = "";
  if (now?.kind === "item") {
    const { words, event, ago } = now;
    const what: Record<TickerTap, string> = {
      spot: "Show it on the photo",
      "other-photo": `Show it in photo ${words.index + 1}`,
      "spot-comments": "See the comments about it",
      comment: "See it in the comments",
      fact: `Show ${event.spot ? `the ${event.spot.toLowerCase()}` : "it"}`,
      home: "See the comments",
    };
    const where = words.elsewhere ? `, in photo ${words.index + 1}` : words.where ? ", in this photo" : "";
    name = `${ended(`${words.line1}${where}${event.body ? `: ${event.body}` : ""}`)} ${spokenAgo(ago)}. ${what[words.tap]}.`;
  } else if (now?.kind === "rest") {
    name = `${now.text}. See the comments.`;
  }

  const multi = cycle.length > 1 && !readOnly;
  // (With reduced motion, a plain crossfade, which the reset for it lets through.)
  const enter = moved && (reduced ? "animate-[fade-in_150ms_linear_both]" : "animate-[ticker-in_300ms_cubic-bezier(0.05,0.7,0.1,1)_120ms_both]");
  const exit = reduced ? "animate-[fade-out_150ms_linear_both]" : "animate-[ticker-out_200ms_cubic-bezier(0.3,0,0.8,0.15)_both]";
  const crossfade = reduced ? { "data-crossfade": true } : {};
  const row = "-mx-1 flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 text-left";

  return (
    <div
      role="group"
      aria-label="Recent activity"
      onPointerEnter={() => ticker.setHovered(true)}
      onPointerLeave={() => ticker.setHovered(false)}
      onFocus={(event) => {
        // The keyboard coming in stops it, until Play.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if ((event.target as HTMLElement).matches(":focus-visible") && ticker.rotating) ticker.stop();
      }}
      className="flex h-12 min-w-0 flex-1 items-center"
    >
      {multi && (
        // First for the keyboard, last on screen: under it, which one this
        // is of the few going round.
        <div className="relative order-last -mr-2 flex h-12 w-11 shrink-0 items-center justify-center">
          {reduced ? (
            <button
              type="button"
              aria-label="Show the next activity"
              onClick={ticker.step}
              className="flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 split:text-stone-600 split:hover:bg-stone-100"
            >
              <ChevronRight aria-hidden size={18} />
            </button>
          ) : (
            <button
              type="button"
              aria-label={ticker.halted ? "Play activity" : "Pause activity"}
              onClick={ticker.halted ? ticker.play : ticker.pause}
              className="flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 split:text-stone-600 split:hover:bg-stone-100"
            >
              {ticker.halted ? <Play aria-hidden size={16} className="fill-current" /> : <Pause aria-hidden size={16} className="fill-current" />}
            </button>
          )}
          {!summary && (
            <span aria-hidden className="pointer-events-none absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-[3px]">
              {cycle.map((event, i) => (
                <span
                  key={event.id}
                  className={cn(
                    "size-1 rounded-full",
                    i === ticker.index ? "bg-white split:bg-stone-800" : "bg-white/40 split:bg-stone-300",
                  )}
                />
              ))}
            </span>
          )}
        </div>
      )}
      <div
        aria-live={ticker.rotating ? "off" : "polite"}
        aria-atomic="true"
        className="relative flex h-12 min-w-0 flex-1 items-center"
      >
        {leaving && (
          <div aria-hidden {...crossfade} className={cn("pointer-events-none absolute inset-0 flex items-center", exit)}>
            <span className={row}>
              <Lines shown={leaving} myName={myName} ghost />
            </span>
          </div>
        )}
        {now &&
          (readOnly ? (
            <div key={shown.key} {...crossfade} className={cn(row, enter)}>
              <Lines shown={now} myName={myName} />
            </div>
          ) : (
            <button
              key={shown.key}
              type="button"
              aria-label={name}
              {...crossfade}
              // The time is the server's until the page wakes up, as on the line itself.
              suppressHydrationWarning
              onClick={() => {
                ticker.stop();
                if (now.kind === "item") onTap?.(now.event, now.words.tap, now.words.index);
                else onTap?.(cycle[0], "home", -1);
              }}
              onPointerEnter={(event) => event.pointerType === "mouse" && ticker.setLooking(true)}
              onPointerLeave={() => ticker.setLooking(false)}
              onFocus={() => ticker.setLooking(true)}
              onBlur={() => ticker.setLooking(false)}
              className={cn(row, "split:hover:bg-stone-50", enter)}
            >
              <Lines shown={now} myName={myName} underline={underline} />
            </button>
          ))}
      </div>
    </div>
  );
}

// A sentence, with a full stop unless it has its own.
const ended = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

// A photo of this home in miniature, with a dot where it happened.
function thumbOf(listing: Listing, event: TickerEvent): Thumb | null {
  const photo = listing.Media.find((m) => mediaKeyOf(m) === event.mediaKey);
  const at = photo && event.spot ? tagPosition(photo, event.spot) : null;
  if (!photo || !at) return null;
  const ratio = photo.ImageWidth && photo.ImageHeight ? photo.ImageWidth / photo.ImageHeight : 1;
  return { url: photo.MediaURL, x: at.x, y: at.y, dot: markDot[markOf(event)], ratio };
}

// Words drawn rather than written, for the copy that's leaving: the page only
// ever says (and finds) what's showing.
function Drawn({ text, className }: { text: string; className?: string }) {
  return <span data-text={text} className={cn("before:content-[attr(data-text)]", className)} />;
}

function Lines({ shown, myName, ghost = false, underline = false }: { shown: Shown; myName: string | null; ghost?: boolean; underline?: boolean }) {
  const say = (text: string, className: string) =>
    ghost ? <Drawn text={text} className={className} /> : <span className={className}>{text}</span>;
  if (shown.kind === "rest") {
    return (
      <>
        {/* Each face over the next, so every initial reads whole. */}
        <span aria-hidden className="flex shrink-0 pl-1.5">
          {shown.faces.map((name, i) => (
            <span
              key={i}
              style={{ zIndex: shown.faces.length - i }}
              className={cn(
                "relative -ml-1.5 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-night [text-shadow:none] split:ring-white",
                name ? "bg-brand text-white" : "bg-stone-500 text-white",
              )}
            >
              {name ? (ghost ? <Drawn text={name[0]?.toUpperCase() ?? ""} /> : name[0]?.toUpperCase()) : <User size={11} />}
            </span>
          ))}
        </span>
        {say(shown.text, "line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-5")}
      </>
    );
  }
  const { event, words, thumb } = shown;
  const { line1, line2 } = words;
  return (
    <>
      <EventFace event={event} myName={myName} ghost={ghost} />
      <span className="min-w-0 flex-1">
        {say(line1, cn("block truncate text-[15px] font-semibold leading-5", underline && "underline underline-offset-2"))}
        <span className="block truncate text-[13px] leading-[18px] text-white/75 split:text-stone-600" suppressHydrationWarning>
          {ghost ? <Drawn text={line2} /> : line2}
        </span>
      </span>
      {thumb && (
        <span aria-hidden className="relative size-8 shrink-0 overflow-hidden rounded-md bg-stone-800">
          <Image src={thumb.url} alt="" fill sizes="32px" className="object-contain" />
          <span
            style={{
              left: `${(thumb.ratio >= 1 ? thumb.x : 0.5 + (thumb.x - 0.5) * thumb.ratio) * 100}%`,
              top: `${(thumb.ratio >= 1 ? 0.5 + (thumb.y - 0.5) / thumb.ratio : thumb.y) * 100}%`,
            }}
            className={cn("absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white", thumb.dot)}
          />
        </span>
      )}
    </>
  );
}
