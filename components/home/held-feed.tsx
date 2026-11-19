"use client";

import { createContext, Fragment, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

// The Clients stream's cards, under their headings, staying where they were
// when the page opened. Answering a card that's waiting would otherwise move
// it out from under the agent's hands (it isn't waiting any more, so the
// server lists it further down) and lose its "Sent to Ben". So each card keeps
// its place, with whatever is new in it, until a card that wasn't there
// arrives or one starts waiting; then everything is in the server's order again.

export type FeedSection = {
  heading: string;
  // "Waiting for you": in amber, with a dot.
  attention?: boolean;
  items: { id: string; waiting: boolean; node: ReactNode }[];
};

// Where each card was, and whether it was waiting then.
type Layout = { heading: string; attention: boolean; cards: { id: string; waiting: boolean }[] }[];

const layoutOf = (sections: FeedSection[]): Layout =>
  sections.map((section) => ({
    heading: section.heading,
    attention: Boolean(section.attention),
    cards: section.items.map((item) => ({ id: item.id, waiting: item.waiting })),
  }));

export function HeldFeed({ sections }: { sections: FeedSection[] }) {
  const [held, setHeld] = useState(() => layoutOf(sections));
  const items = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, item] as const)));
  let layout = held;
  const was = new Map(held.flatMap((section) => section.cards.map((card) => [card.id, card.waiting] as const)));
  if ([...items.values()].some((item) => !was.has(item.id) || (item.waiting && !was.get(item.id)))) {
    layout = layoutOf(sections);
    setHeld(layout);
  }
  return (
    <>
      {layout.map((section) => {
        // (A card that's gone since is left out, and a heading with none left.)
        const there = section.cards.flatMap((card) => items.get(card.id) ?? []);
        if (there.length === 0) return null;
        // Once everything under "Waiting for you" has been answered, it says so.
        const waiting = section.attention && there.some((item) => item.waiting);
        const heading = section.attention && !waiting ? "Answered" : section.heading;
        return (
          <section key={section.heading} aria-label={heading}>
            <h3
              className={cn(
                "flex items-center gap-2 px-1 text-body font-semibold",
                waiting ? "text-amber-900" : "text-muted",
              )}
            >
              {waiting && <span aria-hidden className="size-2.5 rounded-full bg-amber-500" />}
              {heading}
            </h3>
            <ul className="mt-2 flex flex-col gap-4">
              {there.map((item) => (
                // (Each is a list item of its own; the key keeps what's typed in it.)
                <Fragment key={item.id}>{item.node}</Fragment>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

// The same for a short list of people ("Your clients" on Home), which shows
// only its first few. `rows`: everyone, in the server's order; `show`: how
// many of them it would show now. Answering someone would otherwise move
// them down the list, or off it, with the box just typed in and its "Sent to
// Jo". So the rows that were showing stay, in their places, until someone
// who wasn't waiting (or wasn't showing) starts to wait. Then it's the rows
// the server would show now, in the places they had, anyone newly waiting
// ahead of them; and a row whose reply box has been opened (`useHoldRow`)
// stays whatever happens, so what was sent from it still says so.
const HoldRow = createContext<() => void>(() => {});

// For something in a row: called once the row mustn't go (its box is open).
export const useHoldRow = () => useContext(HoldRow);

type HeldRow = { id: string; waiting: boolean };

export function HeldRows({
  rows,
  show,
  className,
}: {
  rows: (HeldRow & { node: ReactNode })[];
  show: number;
  className?: string;
}) {
  const want = rows.slice(0, show).map((row): HeldRow => ({ id: row.id, waiting: row.waiting }));
  const [held, setHeld] = useState(want);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  let layout = held;
  const was = new Map(held.map((row) => [row.id, row.waiting] as const));
  if (want.some((row) => row.waiting && !was.get(row.id))) {
    const wanted = new Set(want.map((row) => row.id));
    const staying = held
      .filter((row) => byId.has(row.id) && (wanted.has(row.id) || kept.has(row.id)))
      .map((row) => ({ id: row.id, waiting: byId.get(row.id)!.waiting }));
    const arriving = want.filter((row) => !was.has(row.id));
    layout = [...arriving.filter((row) => row.waiting), ...staying, ...arriving.filter((row) => !row.waiting)];
    setHeld(layout);
  }
  return (
    <ul className={className}>
      {layout.map(({ id }) => {
        // (Someone who's gone since is left out.)
        const row = byId.get(id);
        if (!row) return null;
        return (
          // (Each is a list item of its own; the key keeps what's typed in it.)
          <HoldRow.Provider key={id} value={() => setKept((now) => (now.has(id) ? now : new Set(now).add(id)))}>
            {row.node}
          </HoldRow.Provider>
        );
      })}
    </ul>
  );
}
