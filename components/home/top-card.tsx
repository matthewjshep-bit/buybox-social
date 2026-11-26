"use client";

import { ArrowRight, Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Avatar, HomeThumb, RoleChip } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { Top, TopPart } from "@/lib/top";
import { tab } from "@/lib/ui";

// "Top", beside the feed on Home: the head of Popular, a few of each of its
// three lists (homes, people, agents), one at a time. It turns to the next
// by itself, slowly, while nobody's using it: never while the pointer is on
// it or it has focus, never once someone has picked a part themselves, and
// never for someone who'd rather things didn't move. All three are laid in
// one place, so the card is as tall as the tallest and never jumps as it
// turns. Each line goes where the same line on Popular goes, and "See all"
// to that list on Popular.

const TURN_MS = 8_000;

const LABEL: Record<TopPart, string> = { homes: "Homes", people: "People", agents: "Agents" };

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

// A place in the list, quiet: the list is the point, not the numbers.
function Rank({ n }: { n: number }) {
  return (
    <span className="w-4 shrink-0 text-center text-sm font-semibold tabular-nums text-muted">
      <span className="sr-only">Number </span>
      {n}
    </span>
  );
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-1.5 transition-colors hover:bg-stone-50 focus-visible:bg-stone-50"
      >
        {children}
      </Link>
    </li>
  );
}

export function TopCard({ top, id, className }: { top: Top; id: string; className?: string }) {
  const parts = (["homes", "people", "agents"] as const).filter((part) => top[part].length > 0);
  const [on, setOn] = useState<TopPart>(parts.includes(top.start) ? top.start : (parts[0] ?? "homes"));
  // Someone picked a part: it stays where they put it.
  const [held, setHeld] = useState(false);
  // The pointer's on it, or something in it has focus: either holds it still.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const tabs = useRef<Partial<Record<TopPart, HTMLButtonElement | null>>>({});
  const many = parts.length > 1;

  useEffect(() => {
    if (!many || held || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      // (Not while the page is in the background: they'd come back to a different part.)
      if (document.hidden) return;
      setOn((current) => parts[(parts.indexOf(current) + 1) % parts.length]);
    }, TURN_MS);
    return () => window.clearInterval(timer);
    // (`parts` is the same three, or fewer, for the life of the page.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [many, held, paused]);

  if (parts.length === 0) return null;

  const pick = (part: TopPart, focus = false) => {
    setOn(part);
    setHeld(true);
    if (focus) tabs.current[part]?.focus();
  };
  // Arrow keys go along the tabs, Home and End to either end.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = parts.indexOf(on);
    const to =
      event.key === "ArrowRight"
        ? parts[(at + 1) % parts.length]
        : event.key === "ArrowLeft"
          ? parts[(at - 1 + parts.length) % parts.length]
          : event.key === "Home"
            ? parts[0]
            : event.key === "End"
              ? parts[parts.length - 1]
              : null;
    if (!to) return;
    event.preventDefault();
    pick(to, true);
  };

  const over = {
    homes: top.homesOver,
    people: top.peopleOver,
    agents: "Most listings",
  }[on];
  const seeAll = {
    homes: `/popular?period=${top.homesPeriod}`,
    people: `/popular/people?period=${top.peoplePeriod}`,
    agents: "/popular/agents",
  }[on];

  const panels: Record<TopPart, ReactNode> = {
    homes: top.homes.map((home, i) => (
      <Row key={home.key} href={`/reel?${new URLSearchParams({ from: `popular:${top.homesPeriod}`, home: home.key })}`}>
        <Rank n={i + 1} />
        <HomeThumb src={home.photo} sizes="64px" className="h-11 w-14 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-semibold">
              {home.price ? formatPrice(home.price) : home.address.split(",")[0]}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 text-meta font-semibold tabular-nums text-stone-700">
              {home.likes > 0 && (
                <span className="flex items-center gap-1">
                  <Heart aria-hidden size={12} className="fill-rose-500 text-rose-500" />
                  {home.likes}
                  <span className="sr-only"> {home.likes === 1 ? "like" : "likes"}</span>
                </span>
              )}
              {home.comments > 0 && (
                <span className="flex items-center gap-1">
                  <MessageCircle aria-hidden size={12} className="text-stone-500" />
                  {home.comments}
                  <span className="sr-only"> {home.comments === 1 ? "comment" : "comments"}</span>
                </span>
              )}
            </span>
          </span>
          <span className="block truncate text-meta text-muted">
            {home.address.split(",")[0]}
            {home.city && `, ${home.city}`}
          </span>
        </span>
      </Row>
    )),
    people: top.people.map((person, i) => (
      <Row key={person.profileId} href={`/people/${person.profileId}`}>
        <Rank n={i + 1} />
        <Avatar name={person.face} tone={person.agent ? "agent" : "person"} size={9} photo={person.photo} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{person.me ? `${person.name} (you)` : person.name}</span>
            <RoleChip role={person.agent ? (person.kind && person.kind !== "buyer" ? person.kind : "agent") : null} small />
          </span>
          <span className="block truncate text-meta text-muted">
            {[person.likes > 0 && plural(person.likes, "like"), person.comments > 0 && plural(person.comments, "comment")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </Row>
    )),
    agents: top.agents.map((agent, i) => (
      <Row key={agent.profileId} href={`/people/${agent.profileId}?tab=listings`}>
        <Rank n={i + 1} />
        <Avatar name={agent.face} tone="agent" size={9} photo={agent.photo} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{agent.me ? `${agent.name} (you)` : agent.name}</span>
          <span className="block truncate text-meta text-muted">
            {[agent.brokerage, agent.forSale > 0 && `${agent.forSale} for sale`].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Row>
    )),
  };

  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-2xl bg-white pb-1 pt-3 ring-1 ring-stone-200", className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // (Someone going through it by keyboard is reading it: it stays put for good.)
      onFocus={() => {
        setFocused(true);
        setHeld(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="flex items-baseline justify-between gap-3 px-4">
        <h2 id={id} className="text-body font-semibold">
          Top
        </h2>
        <span className="truncate text-meta text-muted">{over}</span>
      </div>
      {many && (
        <div role="tablist" aria-label="Top" onKeyDown={onKey} className="mt-1 flex border-b border-stone-200 px-2">
          {parts.map((part) => (
            <button
              key={part}
              ref={(node) => {
                tabs.current[part] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${part}`}
              aria-selected={part === on}
              aria-controls={`${id}-panel-${part}`}
              tabIndex={part === on ? 0 : -1}
              onClick={() => pick(part)}
              className={cn(tab(part === on), "-mb-px min-h-11 flex-1 justify-center px-2 text-sm sm:px-2")}
            >
              {LABEL[part]}
            </button>
          ))}
        </div>
      )}
      {/* All of them in one place, the one showing on top: the card keeps the tallest one's height. */}
      <div className="grid grid-cols-[minmax(0,1fr)] pt-1.5 [grid-template-areas:'top']">
        {parts.map((part) => (
          <div
            key={part}
            id={`${id}-panel-${part}`}
            role={many ? "tabpanel" : undefined}
            aria-labelledby={many ? `${id}-tab-${part}` : undefined}
            className={cn(
              "transition-[opacity,visibility] duration-300 [grid-area:top] motion-reduce:transition-none",
              part === on ? "visible opacity-100" : "invisible opacity-0",
            )}
          >
            <ol aria-label={`Top ${LABEL[part].toLowerCase()}`} className="px-1">
              {panels[part]}
            </ol>
          </div>
        ))}
      </div>
      <Link
        href={seeAll}
        className="mx-4 mt-1 flex min-h-11 items-center justify-center gap-1 border-t border-stone-200 pt-1 text-sm font-semibold text-stone-700 hover:text-ink"
      >
        See all<span className="sr-only"> top {LABEL[on].toLowerCase()}</span> <ArrowRight aria-hidden size={14} />
      </Link>
    </section>
  );
}
