import type { ReactNode } from "react";
import { CaughtUp } from "@/components/home/caught-up";
import { FeedGate } from "@/components/home/feed-gate";
import { FollowingCard, StripCard } from "@/components/home/following-card";
import { PostCard } from "@/components/home/post-card";
import { Seen } from "@/components/home/seen";
import { cn } from "@/lib/format";
import type { FeedCounts, FeedItem, HomeFeedEntry } from "@/lib/home-feed";
import type { PostEntry } from "@/lib/posts";
import type { ReactionState } from "@/lib/reactions";
import { card } from "@/lib/ui";

// The Following stream, on anyone's home: one card per home per day from the
// people they follow (a big photo, a bar with its likes and comments, which
// unfurl right there), newest first; a day when someone liked three homes or
// more and said nothing is one small strip of them instead. Where what's new
// since they last looked ends, "You're all caught up", then a few older
// ones, and then it stops. With nothing new it starts straight on the older
// ones: no line saying so above a page full of homes.

// Older cards shown after the caught-up line.
const OLDER_MOST = 20;
// A day of likes this big, with nothing said, is a strip rather than cards.
const STRIP_FROM = 3;
// With nothing new, whatever goes in the stream (`among`) comes after this many cards.
const AMONG_AFTER = 3;

type Item = { kind: "card"; entry: HomeFeedEntry } | { kind: "strip"; entries: HomeFeedEntry[] } | { kind: "post"; entry: PostEntry };

// One person's like with nothing said: what a strip is made of.
const quiet = (entry: HomeFeedEntry) =>
  entry.liked && entry.said.length === 0 && entry.why.who.length === 1 && Boolean(entry.why.who[0].profileId);

// The stream's cards, with each person's busy, wordless days drawn as strips
// where their first card would have been.
function itemsOf(entries: FeedItem[]): Item[] {
  const dayOf = (entry: HomeFeedEntry) => `${entry.why.who[0].profileId}|${entry.day}`;
  const days = new Map<string, HomeFeedEntry[]>();
  for (const entry of entries) if (entry.kind !== "post" && quiet(entry)) days.set(dayOf(entry), [...(days.get(dayOf(entry)) ?? []), entry]);
  const placed = new Set<string>();
  return entries.flatMap((entry): Item[] => {
    if (entry.kind === "post") return [{ kind: "post", entry }];
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
  counts,
  seenAt,
  among = null,
  empty,
  me = null,
}: {
  entries: FeedItem[];
  // Their own take on each home, by key, for the hearts.
  mine: Record<string, ReactionState>;
  // How many liked each home and how many comments it has, by key, for the bars.
  counts: Record<string, FeedCounts>;
  // When they last looked at their home: what's new is what's newer.
  seenAt: string | null;
  // Something of the page's to show in the stream, where someone with a busy
  // feed still comes to it (people to follow, on a screen with no rail beside
  // the feed): straight after the caught-up line, or after the third card
  // when nothing is new. Not shown when there's nothing at all: the page
  // places it then.
  among?: ReactNode;
  // What to say when there's nothing at all.
  empty: ReactNode;
  // Who's looking (by name, for the sign-up gate: someone signed in with a
  // name is simply in), or nobody.
  me?: { name: string; photo: string | null; agent?: boolean } | null;
}) {
  if (entries.length === 0) {
    return <div className={cn(card, "px-5 py-6 text-center text-body text-stone-700")}>{empty}</div>;
  }
  // Newest first, so what's new is the start of it.
  const fresh = entries.filter((entry) => !seenAt || entry.at > seenAt);
  const freshItems = itemsOf(fresh);
  const olderItems = itemsOf(entries.slice(fresh.length).slice(0, OLDER_MOST));
  const list = (items: Item[]) =>
    items.length > 0 && (
      <ul className="flex flex-col gap-4">
        {items.map((item) =>
          item.kind === "card" ? (
            <FollowingCard
              key={item.entry.id}
              entry={item.entry}
              mine={mine[item.entry.home.key] ?? null}
              counts={counts[item.entry.home.key] ?? { likes: 0, comments: 0 }}
            />
          ) : item.kind === "post" ? (
            <PostCard key={item.entry.id} entry={item.entry} reelFrom="feed" mine={mine} counts={counts} />
          ) : (
            <StripCard key={`strip:${item.entries[0].id}`} entries={item.entries} />
          ),
        )}
      </ul>
    );

  // Nothing older to come after it (a feed that isn't one long timeline):
  // the people card after the first few, and the end of it said at the end.
  const body =
    freshItems.length > 0 && olderItems.length === 0 ? (
      <div className="flex flex-col gap-4">
        {list(freshItems.slice(0, AMONG_AFTER))}
        {among}
        {list(freshItems.slice(AMONG_AFTER))}
        <CaughtUp />
      </div>
    ) : freshItems.length === 0 ? (
      <div className="flex flex-col gap-4">
        {list(olderItems.slice(0, AMONG_AFTER))}
        {among}
        {list(olderItems.slice(AMONG_AFTER))}
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        {list(freshItems)}
        <CaughtUp />
        {among}
        {list(olderItems)}
      </div>
    );
  // (The cards' hearts and comments all work through the one gate; what was
  // in front of them is noted, for next time.)
  return (
    <FeedGate myName={me?.name || null}>
      <Seen>{body}</Seen>
    </FeedGate>
  );
}
