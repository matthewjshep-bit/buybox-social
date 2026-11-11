"use client";

import { Pointer } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// A quick look at how it works, the first time: a few short steps, each
// pointing at the thing itself (the facts, a photo, the heart), with a finger
// tapping it. Tap anywhere for the next; Skip ends it. Once per device, for
// each kind: an agent's link, the home page signed out, and the agent's own
// link, where they write their notes.

export type TourKind = "link" | "home" | "notes";

const STORAGE = "buybox:tour";

type Seen = Partial<Record<TourKind, boolean>>;

function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Seen;
  } catch {
    return {};
  }
}

function remember(kind: TourKind) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ ...readSeen(), [kind]: true }));
  } catch {
    // Storage can be off (a private window): it shows again next time.
  }
}

// Whether this device should see the tour. Never for a browser driven by a
// script (the tests), unless it asks for it.
function wanted(kind: TourKind) {
  try {
    if (navigator.webdriver && localStorage.getItem(`${STORAGE}:test`) !== "1") return false;
  } catch {
    if (navigator.webdriver) return false;
  }
  return !readSeen()[kind];
}

// One step: what it points at, in the home on screen, and what it says.
// `at`: where the finger taps (the price, in the facts), if not the middle.
export type TourStep = {
  target: string;
  at?: string;
  // Round, the size of a fingertip's reach, in the middle of what it points
  // at (a photo), rather than around all of it.
  spot?: boolean;
  title: string;
  // (Or worded for a mouse or trackpad, `fine`, or a finger.)
  body: string | ((fine: boolean) => string);
};

// Whether a tour is due, and the way to end it. Waits until `ready` (a home is
// on screen, nothing open over it) has held for a moment, so the home shows first.
export function useTour(kind: TourKind | null, ready: boolean) {
  const [due, setDue] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!kind || !ready || done || due) return;
    // (Seen before: done at once, for the nudges.)
    const show = wanted(kind);
    const timer = setTimeout(() => (show ? setDue(true) : setDone(true)), show ? 900 : 0);
    return () => clearTimeout(timer);
  }, [kind, ready, done, due]);
  const finish = useCallback(() => {
    if (kind) remember(kind);
    setDue(false);
    setDone(true);
  }, [kind]);
  // Done: nothing more to show (seen before, or just now). The nudges wait for it.
  return { showing: due && !done, done: done || !kind, finish };
}

type Box = { left: number; top: number; width: number; height: number };

const PAD = 6;
const SPOT = 132;
const GUTTER = 16;

// The steps, drawn over the page: the screen dimmed but for what each points
// at, and a card beside it.
// `root`: what to look in for each step's thing (the first of its kind
// that's on screen counts).
export function Tour({ root: rootOf, steps, onDone }: { root: () => HTMLElement | null; steps: TourStep[]; onDone: () => void }) {
  const [root] = useState(rootOf);
  // A mouse or trackpad scrolls on to the next home; a finger swipes.
  const [fine] = useState(() => matchMedia("(pointer: fine)").matches);
  // Only the steps whose thing is on screen.
  const [shown] = useState(() => steps.filter((step) => root && find(root, step.target)));
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<{ box: Box; round: boolean; tap: { x: number; y: number } } | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const title = useId();
  const step = shown[index];
  const last = index === shown.length - 1;

  const advance = useCallback(() => {
    if (last) onDone();
    else setIndex((i) => i + 1);
  }, [last, onDone]);

  // Where the step's thing is, kept up to date if the window changes.
  useLayoutEffect(() => {
    if (!step || !root) return;
    const place = () => {
      const el = find(root, step.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const tapEl = step.at ? find(root, step.at) : null;
      const t = tapEl?.getBoundingClientRect() ?? r;
      // A photo: a round spot a little above its middle, where things usually are.
      const tap = step.spot
        ? { x: r.left + r.width / 2, y: r.top + r.height * 0.45 }
        : { x: t.left + t.width / 2, y: t.top + t.height * 0.7 };
      const box = step.spot
        ? { left: tap.x - SPOT / 2, top: tap.y - SPOT / 2, width: SPOT, height: SPOT }
        : { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setHole({ box, round: Boolean(step.spot), tap });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [step, root]);

  // The card above or below it, whichever has room (over it, near its top, if neither).
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !hole) return;
    const height = el.offsetHeight;
    const below = hole.box.top + hole.box.height + 14;
    const above = hole.box.top - 14 - height;
    const room = window.innerHeight - GUTTER;
    setCardTop(below + height <= room ? below : above >= GUTTER ? above : Math.max(GUTTER, hole.box.top + 14));
  }, [hole, index]);

  useEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, [index, cardTop]);

  useEffect(() => {
    if (shown.length === 0) onDone();
  }, [shown.length, onDone]);
  if (!step || !hole) return null;

  const left = Math.min(
    Math.max(GUTTER, hole.tap.x - 160),
    Math.max(GUTTER, window.innerWidth - GUTTER - Math.min(320, window.innerWidth - GUTTER * 2)),
  );
  const holeStyle: CSSProperties = {
    left: hole.box.left,
    top: hole.box.top,
    width: hole.box.width,
    height: hole.box.height,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title}
      data-tour-open
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDone();
        }
      }}
      className="fixed inset-0 z-[60] animate-[fade-in_250ms_ease-out_both]"
    >
      {/* Everything dimmed but what it points at. A tap anywhere is the next step. */}
      <button type="button" tabIndex={-1} aria-hidden onClick={advance} className="absolute inset-0 cursor-default" />
      <div
        aria-hidden
        style={holeStyle}
        className={cn(
          "pointer-events-none absolute shadow-[0_0_0_200vmax_rgb(0_0_0/0.62)] ring-2 ring-white/85 transition-[left,top,width,height,border-radius] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          hole.round ? "rounded-full" : "rounded-2xl",
        )}
      />
      {/* A finger, tapping where to tap: a ring spreading from the spot, and
          the fingertip just under it, so what it points at stays readable. */}
      <span
        key={`tap-${index}`}
        aria-hidden
        style={{ left: hole.tap.x, top: hole.tap.y }}
        className="pointer-events-none absolute"
      >
        <span className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.2)] animate-[spot-ripple_1.4s_ease-out_infinite]" />
        <span className="absolute -left-2.5 top-2 block origin-[30%_0] animate-[tour-tap_1.4s_ease-in-out_infinite]">
          <Pointer size={30} strokeWidth={1.75} className="fill-white text-ink drop-shadow-[0_2px_4px_rgb(0_0_0/0.45)]" />
        </span>
      </span>
      <div
        ref={card}
        key={`card-${index}`}
        data-light
        style={{ left, top: cardTop ?? hole.box.top + hole.box.height + 14, visibility: cardTop === null ? "hidden" : undefined }}
        className="absolute w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 text-ink shadow-[0_16px_48px_rgb(0_0_0/0.4)] animate-[nudge-in_300ms_ease-out_both]"
      >
        <p id={title} className="text-body font-semibold">
          {step.title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          {typeof step.body === "function" ? step.body(fine) : step.body}
        </p>
        <div className="mt-3 flex items-center gap-2">
          {shown.length > 1 && (
            <p className="mr-auto flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${shown.length}`}>
              {shown.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-ink" : "w-1.5 bg-stone-300")}
                />
              ))}
            </p>
          )}
          {!last && (
            <button type="button" onClick={onDone} className={cn(button({ kind: "ghost" }), "text-stone-600", shown.length <= 1 && "ml-auto")}>
              Skip
            </button>
          )}
          <button
            ref={next}
            type="button"
            onClick={advance}
            className={cn(button({ kind: "neutral" }), last && shown.length <= 1 && "ml-auto")}
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The first of these that's on screen (of a home's photos, the one showing).
const find = (root: HTMLElement, selector: string) => [...root.querySelectorAll(selector)].find(visible) ?? null;

// On screen, and not hidden away.
function visible(el: Element | null) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.opacity !== "0";
}

// What each tour says, for the home on screen. `agent`: the agent's first
// name ("your agent" without one). `notesFor`: on their own link, who the
// agent's notes are for. `agentTake`: the agent left notes on this home.
// `more`: there's another home after it.
export function tourSteps(
  kind: TourKind,
  { agent, notesFor, agentTake, more }: { agent: string; notesFor?: string; agentTake: boolean; more: boolean },
): TourStep[] {
  const facts = { target: '[data-tour="facts"]', at: '[data-fact="Price"]' };
  const photo = { target: '[aria-roledescription="carousel"] [data-photo-frame]', spot: true };
  const heart = { target: "[data-rail] [aria-pressed], [data-actions] [aria-pressed]" };
  const Agent = agent.charAt(0).toUpperCase() + agent.slice(1);
  if (kind === "notes") {
    const who = notesFor ?? "your client";
    return [
      { ...facts, title: "Add your take", body: `Tap any detail, like the price, to like it or leave ${who} a note.` },
      { ...photo, title: "Point things out", body: "Tap anything in a photo, the new roof or the yard, to note it." },
      {
        target: '[data-tour="done"]',
        title: `${who.charAt(0).toUpperCase() + who.slice(1)} sees your notes`,
        body: "Your face marks each one on the link. Tap Done when you're finished.",
      },
    ];
  }
  return [
    ...(agentTake
      ? [
          {
            target: "[data-photo-caption] > *",
            title: `${Agent} left you notes`,
            body: `They show here, one at a time, and ${agent}'s face marks each detail they picked out.`,
          },
        ]
      : []),
    { ...facts, title: "Tap any detail", body: "Like the price, the beds or the address, or say something about it." },
    {
      ...photo,
      title: "Tap anything in a photo",
      body: kind === "link" ? `The kitchen, the yard: like it, or tell ${agent} what you think.` : "The kitchen, the yard: like it, or say something about it.",
    },
    {
      ...heart,
      title: "Love the home?",
      body: (fine) =>
        more
          ? `Tap the heart. Then ${fine ? "scroll down" : "swipe up"} for the next ${kind === "link" ? "one" : "home"}.`
          : "Tap the heart.",
    },
  ];
}
