import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CaughtUp, sinceWords } from "@/components/home/caught-up";
import { FollowText } from "@/components/home/follow-text";
import { FollowingCard, StripCard } from "@/components/home/following-card";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";
import type { FeedWho, HomeFeedEntry } from "@/lib/home-feed";
import type { ReactionState } from "@/lib/reactions";
import { card } from "@/lib/ui";

// The Following stream, on anyone's home: one card per home per day from the
// people they follow (a big photo, a heart to like it too, what they said),
// newest first; a day when someone liked three homes or more and said
// nothing is one small strip of them instead. Where what's new since they
// last looked ends, "You're all caught up", then a few older ones, and then
// it stops.

// Older cards shown after the caught-up line.
const OLDER_MOST = 20;
// A day of likes this big, with nothing said, is a strip rather than cards.
const STRIP_FROM = 3;
// On a phone (no rail beside the feed), people worth following come after this many cards.
const SUGGEST_AFTER = 3;

type Item = { kind: "card"; entry: HomeFeedEntry } | { kind: "strip"; entries: HomeFeedEntry[] };

// One person's like with nothing said: what a strip is made of.
const quiet = (entry: HomeFeedEntry) =>
  entry.liked && entry.said.length === 0 && entry.why.who.length === 1 && Boolean(entry.why.who[0].profileId);

// The stream's cards, with each person's busy, wordless days drawn as strips
// where their first card would have been.
function itemsOf(entries: HomeFeedEntry[]): Item[] {
  const dayOf = (entry: HomeFeedEntry) => `${entry.why.who[0].profileId}|${entry.day}`;
  const days = new Map<string, HomeFeedEntry[]>();
  for (const entry of entries.filter(quiet)) days.set(dayOf(entry), [...(days.get(dayOf(entry)) ?? []), entry]);
  const placed = new Set<string>();
  return entries.flatMap((entry): Item[] => {
    const day = quiet(entry) ? days.get(dayOf(entry)) : undefined;
    if (!day || day.length < STRIP_FROM) return [{ kind: "card", entry }];
    if (placed.has(dayOf(entry))) return [];
    placed.add(dayOf(entry));
    return [{ kind: "strip", entries: day }];
  });
}

export function FollowingFeed({
  entries,
  mine,
  seenAt,
  suggestions = [],
  empty,
}: {
  entries: HomeFeedEntry[];
  // Their own take on each home, by key, for the hearts.
  mine: Record<string, ReactionState>;
  // When they last looked at their home: what's new is what's newer.
  seenAt: string | null;
  // People worth following, shown in the stream on a phone.
  suggestions?: (FeedWho & { profileId: string })[];
  // What to say when there's nothing at all.
  empty: ReactNode;
}) {
  if (entries.length === 0) {
    return <div className={cn(card, "px-5 py-6 text-center text-body text-stone-700")}>{empty}</div>;
  }
  // Newest first, so what's new is the start of it.
  const fresh = entries.filter((entry) => !seenAt || entry.at > seenAt);
  const freshItems = itemsOf(fresh);
  const olderItems = itemsOf(entries.slice(fresh.length).slice(0, OLDER_MOST));
  const suggestAt = Math.min(SUGGEST_AFTER, freshItems.length + olderItems.length) - 1;

  const render = (items: Item[], offset: number) =>
    items.map((item, i) => (
      <Fragment key={item.kind === "card" ? item.entry.id : `strip:${item.entries[0].id}`}>
        {item.kind === "card" ? (
          <FollowingCard entry={item.entry} mine={mine[item.entry.home.key] ?? null} />
        ) : (
          <StripCard entries={item.entries} />
        )}
        {offset + i === suggestAt && suggestions.length > 0 && <InlineSuggestions people={suggestions} />}
      </Fragment>
    ));

  return (
    <div className="flex flex-col gap-4">
      {freshItems.length > 0 && <ul className="flex flex-col gap-4">{render(freshItems, 0)}</ul>}
      {freshItems.length > 0 ? (
        <CaughtUp>
          {seenAt ? `You've seen everything new ${sinceWords(seenAt)}` : "That's everything new from people you follow"}
        </CaughtUp>
      ) : (
        <CaughtUp title="Nothing new from people you follow">Here&apos;s what they liked before</CaughtUp>
      )}
      {olderItems.length > 0 && <ul className="flex flex-col gap-4">{render(olderItems, freshItems.length)}</ul>}
    </div>
  );
}

// People worth following, as one row in the stream (on a phone, where there's
// no rail beside it for them).
function InlineSuggestions({ people }: { people: (FeedWho & { profileId: string })[] }) {
  return (
    <li className={cn(card, "p-3.5 lg:hidden")}>
      <h2 className="text-meta font-semibold text-muted">People with your taste</h2>
      <ul className="-mx-3.5 mt-2 flex snap-x gap-3 overflow-x-auto px-3.5 [scrollbar-width:none]">
        {people.slice(0, 5).map((person) => (
          <li key={person.profileId} className="flex w-24 shrink-0 snap-start flex-col items-center gap-1 text-center">
            <Link
              href={`/people/${person.profileId}`}
              className="flex flex-col items-center gap-1 rounded-xl focus-visible:outline-offset-2"
            >
              <Avatar name={person.face || person.name} tone={person.agent ? "agent" : "person"} photo={person.photo} size={10} />
              <span className="w-24 truncate text-meta font-semibold">{person.name}</span>
            </Link>
            <FollowText personId={person.profileId} name={person.name} />
          </li>
        ))}
      </ul>
    </li>
  );
}
