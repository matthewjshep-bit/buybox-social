"use client";

import { Hand, Heart, Pause, Play, StepForward } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { EventFace } from "@/components/spot-highlight";
import { cn, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { buildCycle, DOT, eventText, onPhoto, spokenAgo, type TickerEvent, type TickerTap } from "@/lib/ticker";

// What people did on the photo on screen, in a caption floating at its foot,
// one thing at a time: who and what, then what they said and when, with a
// soft hotspot on the photo right where they did it. It holds still on the
// newest first, then goes round the few that matter most, quickly; the old
// line lifts away as the next rises into its place. After three rounds (or a
// minute and a half) it rests on who liked the home. It stops for anything
// else you're doing, and it can be paused for the whole visit.

// How long each one shows: longer for more words.
const DWELL_MS = 3500;
const LONGEST_MS = 5500;
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

// Something else has the page just now: a sheet or a prompt is open over the
// line, someone's typing, or the tab is out of sight. The line waits. (A
// window the line is itself in, such as a home opened over another page,
// isn't in its way.)
const busy = (line: Element | null) =>
  document.visibilityState === "hidden" ||
  [...document.querySelectorAll("dialog[open]")].some((dialog) => !line || !dialog.contains(line)) ||
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
  likes,
  restOnLikes = true,
  box,
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
  // How many people liked the home: what it rests on.
  likes: number;
  // Whether it rests on who liked it (false: where that's said already, just
  // below, it rests on the first, still).
  restOnLikes?: boolean;
  // The line's own box, to tell a window it's in from one over it.
  box: RefObject<HTMLElement | null>;
}) {
  const reduced = useReducedMotion();
  const pausedForVisit = useSyncExternalStore(subscribePaused, readPaused, () => false);
  // The same list while it says the same: a page that refreshes itself hands
  // over new copies, and the one showing shouldn't start its time again.
  const said = JSON.stringify(events);
  const [kept, setKept] = useState({ said, events });
  if (kept.said !== said) setKept({ said, events });
  const steady = kept.said === said ? kept.events : events;
  const cycle = useMemo(() => buildCycle(steady, photoKey, mode, true), [steady, photoKey, mode]);
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
  // Resting: on who liked it, or with nobody's like to show (or that said
  // already), the first, still.
  const summary = resting && restOnLikes && likes > 0;
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
  const top = steady[0]?.id ?? null;
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
  const running = rotating && active && !held && !hovered;
  const text = item ? eventText(item, listing, { photoKey, ago: timeAgo(item.at) }) : null;
  const dwellMs = text ? dwellFor(text.line1.length + text.line2.length) : DWELL_MS;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      if (busy(box.current)) {
        setDwell((n) => n + 1);
        return;
      }
      const now = Date.now();
      const most = run.limit ?? ROUNDS * cycle.length;
      if (run.turns >= most || (run.until !== null && now >= run.until)) {
        setResting(true);
        setId(null);
        return;
      }
      setId(cycle[(index + 1) % cycle.length].id);
      setRun({ turns: run.turns + 1, limit: run.limit, until: run.until ?? now - dwellMs + BUDGET_MS });
    }, dwellMs);
    return () => clearTimeout(timer);
  }, [running, index, dwell, dwellMs, run, cycle, box]);

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
    active,
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
  | { kind: "item"; event: TickerEvent; words: ReturnType<typeof eventText>; ago: string }
  | { kind: "rest"; text: string };

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
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The caption's frosted ground: it reads on the brightest photo.
const caption =
  "pointer-events-auto flex min-h-12 max-w-full items-center rounded-[1.25rem] bg-black/60 text-white shadow-[0_4px_20px_rgb(0_0_0/0.35)] ring-1 ring-white/10 backdrop-blur-md split:min-h-14 split:rounded-[1.375rem]";

// Where someone's face goes: their profile, if they have one the page may
// show (never on an agent's link), or yours.
function profileOf(event: TickerEvent, yours: string | null) {
  if (event.who.profileId) return { href: `/people/${event.who.profileId}`, label: `${event.who.name ?? "Their"}'s profile` };
  if (event.who.tone === "you" && yours) return { href: yours, label: "Your profile" };
  return null;
}

// The face at the start of the line, like a profile picture: whoever did it,
// or a heart for who liked the home. A tap on it goes to their profile.
function Face({
  shown,
  myName,
  yours,
  ghost = false,
  link = false,
}: {
  shown: Shown;
  myName: string | null;
  yours: string | null;
  ghost?: boolean;
  link?: boolean;
}) {
  if (shown.kind === "rest") {
    return (
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 split:size-9">
        <Heart size={16} className="fill-rose-500 text-rose-500" />
      </span>
    );
  }
  const face = <EventFace event={shown.event} myName={myName} caption ghost={ghost} />;
  const profile = link ? profileOf(shown.event, yours) : null;
  if (!profile) return <span aria-hidden>{face}</span>;
  return (
    <Link
      href={profile.href}
      aria-label={profile.label}
      className="shrink-0 rounded-full outline-offset-2 transition-transform hit-44 hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      {face}
    </Link>
  );
}

export function ActivityTicker({
  ticker,
  listing,
  photoKey,
  liked,
  hint,
  unseen,
  onTap,
  box,
  line,
  myName = null,
  yours = null,
}: {
  ticker: Ticker;
  listing: Listing;
  photoKey: string | undefined;
  // Your name, for your own face; and where your profile is (null: none here,
  // as on an agent's link).
  myName?: string | null;
  yours?: string | null;
  // Who liked the home, for the rest: how many, the names the page may give
  // (never yours), and whether you did.
  liked: { count: number; names: string[]; you: boolean };
  // Said when nobody's done anything on this photo yet (null: nothing).
  hint: string | null;
  // The spot is on this photo, but under the buttons, so it isn't pointed at.
  unseen: boolean;
  // Unset beside the map, where it's just to read: the first, still.
  // `keyboard`: pressed with a key, so what it opens takes the keyboard.
  onTap?: (event: TickerEvent, tap: TickerTap, photoIndex: number, keyboard: boolean) => void;
  // Its box (as given to the ticker) and the item, for the keyboard to come
  // back to.
  box?: RefObject<HTMLDivElement | null>;
  line?: RefObject<HTMLButtonElement | null>;
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
      <div role="group" aria-label="Recent activity" data-keep-clear className={cn(caption, "gap-2.5 py-2 pl-2 pr-3.5 split:gap-3 split:py-2.5 split:pl-2.5 split:pr-4")}>
        <span aria-hidden className="flex size-8 split:size-9 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
          <Hand size={16} className="text-white/85" />
        </span>
        <p className="text-meta leading-[18px] text-white/90 split:text-sm split:leading-5">{hint}</p>
      </div>
    );
  }

  const describe = (key: string | null): Shown | null => {
    if (key === "rest") return { kind: "rest", text: likedBy(liked.count, liked.names, liked.you) };
    const event = cycle.find((e) => e.id === key) ?? (item?.id === key ? item : null);
    if (!event) return null;
    const ago = event.kind === "anon-likes" ? "this week" : timeAgo(event.at);
    const words = eventText(event, listing, { photoKey, ago, unseen: event === item && unseen });
    return { kind: "item", event, words, ago };
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
      home: "See the Porchcard",
    };
    const where = words.elsewhere ? `, in photo ${words.index + 1}` : words.where ? `, in ${words.where}` : "";
    name = `${ended(`${words.sentence}${where}${event.body ? `: ${event.body}` : ""}`)} ${spokenAgo(ago)}. ${what[words.tap]}.`;
  } else if (now?.kind === "rest") {
    name = `${now.text}. See the Porchcard.`;
  }

  const multi = cycle.length > 1 && !readOnly;
  // (With reduced motion, a plain crossfade, which the reset for it lets through.)
  const enter = moved && (reduced ? "animate-[fade-in_150ms_linear_both]" : "animate-[ticker-in_300ms_cubic-bezier(0.05,0.7,0.1,1)_120ms_both]");
  const exit = reduced ? "animate-[fade-out_150ms_linear_both]" : "animate-[ticker-out_200ms_cubic-bezier(0.3,0,0.8,0.15)_both]";
  const crossfade = reduced ? { "data-crossfade": true } : {};
  // Each showing: the face, then the words, coming and going together.
  const showing = "col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 split:gap-3";
  const row = "flex min-w-0 flex-1 flex-col justify-center rounded-xl py-1.5 text-left split:py-2";
  // With reduced motion it only moves by hand, so its step-on button shows.
  const stepper = multi && reduced;

  return (
    <div
      ref={box}
      role="group"
      aria-label="Recent activity"
      // A tap on it is on it, not on the photo under it.
      data-keep-clear
      onPointerEnter={() => ticker.setHovered(true)}
      onPointerLeave={() => ticker.setHovered(false)}
      onFocus={(event) => {
        // The keyboard coming in stops it, until Play.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if ((event.target as HTMLElement).matches(":focus-visible") && ticker.rotating) ticker.stop();
      }}
      className={cn(caption, "pl-2 split:pl-2.5", stepper ? "pr-1.5" : "pr-3.5 split:pr-4")}
    >
      {/* First for the keyboard (so it can be stopped before it's read),
          last on screen. Pause and Play are only for the keyboard, showing
          while it's on them: a pointer resting on the line holds it, a tap
          on it stops it, and it rests by itself after a few rounds. */}
      {multi &&
        (reduced ? (
          <button
            type="button"
            aria-label="Show the next activity"
            onClick={ticker.step}
            className="order-last ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-white/85 hit-44 hover:bg-white/15"
          >
            {/* A step on, not the photo's arrow. */}
            <StepForward aria-hidden size={16} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={ticker.halted ? "Play activity" : "Pause activity"}
            onClick={ticker.halted ? ticker.play : ticker.pause}
            className="order-last -mr-2.5 ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 [&:not(:focus-visible)]:sr-only"
          >
            {ticker.halted ? <Play aria-hidden size={14} className="fill-current" /> : <Pause aria-hidden size={14} className="fill-current" />}
          </button>
        ))}
      <div
        // Said as it changes only when it's moved by hand or stopped, and
        // only for the home on screen.
        aria-live={ticker.active && !ticker.rotating ? "polite" : "off"}
        aria-atomic="true"
        className="relative grid min-w-0 flex-1"
      >
        {leaving && (
          <div key={`leaving-${shown.n}`} aria-hidden {...crossfade} className={cn(showing, "pointer-events-none", exit)}>
            <Face shown={leaving} myName={myName} yours={yours} ghost />
            <span className={row}>
              <Lines shown={leaving} ghost />
            </span>
          </div>
        )}
        {now && (
          <div key={shown.key} {...crossfade} className={cn(showing, enter)}>
            <Face shown={now} myName={myName} yours={yours} link={!readOnly} />
            {readOnly ? (
              <div className={row}>
                <Lines shown={now} />
              </div>
            ) : (
              <button
                ref={line}
                type="button"
                aria-label={name}
                // The time is the server's until the page wakes up, as on the line itself.
                suppressHydrationWarning
                onClick={(click) => {
                  ticker.stop();
                  const keyboard = click.detail === 0;
                  if (now.kind === "item") onTap?.(now.event, now.words.tap, now.words.index, keyboard);
                  else onTap?.(cycle[0], "home", -1, keyboard);
                }}
                onPointerEnter={(event) => event.pointerType === "mouse" && ticker.setLooking(true)}
                onPointerLeave={() => ticker.setLooking(false)}
                onFocus={() => ticker.setLooking(true)}
                onBlur={() => ticker.setLooking(false)}
                className={row}
              >
                <Lines shown={now} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// A sentence, with a full stop unless it has its own.
const ended = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

// Words drawn rather than written, for the copy that's leaving: the page only
// ever says (and finds) what's showing.
function Drawn({ text, className }: { text: string; className?: string }) {
  return <span data-text={text} className={cn("before:content-[attr(data-text)]", className)} />;
}

// Who (in bold) and what, with when after it; under it, what they said.
function Lines({ shown, ghost = false }: { shown: Shown; ghost?: boolean }) {
  // (Times are the server's until the page wakes up.)
  const say = (text: string, className?: string) =>
    ghost ? (
      <Drawn text={text} className={className} />
    ) : (
      <span className={className} suppressHydrationWarning>
        {text}
      </span>
    );
  if (shown.kind === "rest") return say(shown.text, "line-clamp-2 text-body font-semibold leading-5 split:text-base split:leading-[22px]");
  const { words } = shown;
  // The name as it starts the line ("Jenny", or "Jenny, on the porch").
  const who = [words.who, words.who.replace(/,$/, "")].find((name) => words.line1.startsWith(name)) ?? "";
  const when = words.meta ? `${DOT}${words.meta}` : "";
  return (
    <>
      <span className="line-clamp-2 text-body leading-5 split:text-base split:leading-[22px]" suppressHydrationWarning>
        {say(who, "font-semibold")}
        {say(words.line1.slice(who.length))}
        {!words.words && say(when, "text-meta text-white/70 split:text-sm")}
      </span>
      {words.words && (
        <span className="flex min-w-0 text-meta leading-[18px] text-white/80 split:text-sm split:leading-5" suppressHydrationWarning>
          {say(words.words, "min-w-0 truncate")}
          {say(when, "shrink-0 whitespace-pre text-white/70")}
        </span>
      )}
    </>
  );
}
