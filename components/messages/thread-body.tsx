"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Composer, type ReplyAbout } from "@/components/messages/composer";
import { CommentMessage, HomesMessage, MessageBubble } from "@/components/messages/home-card";
import type { ThreadItem } from "@/lib/messages";

// A conversation's messages, oldest first, scrolled to the newest, with the
// box to write in at the foot. Reply on a home points the box at that home.
// One quote of the home over a run of words about it: a comment right after
// another about the same home, from the same side, says it once.
const sameHomeAs = (before: ThreadItem | undefined, item: ThreadItem) =>
  before?.kind === "comment" && item.kind === "comment" && before.about.anchor === item.about.anchor && before.mine === item.mine;

// With several people in it, whoever's talking is named over the first of
// their words in a row (not the viewer's own, nor a send of homes, which
// says who sent it).
const startsRun = (before: ThreadItem | undefined, item: ThreadItem) =>
  item.kind !== "homes" && !item.mine && !(before && before.kind !== "homes" && !before.mine && before.by.name === item.by.name);

// How near the foot counts as reading the newest (px): a new message keeps
// them there; anyone further up, reading back, stays where they are.
const NEAR_FOOT = 120;

export function ThreadBody({
  threadKey,
  items,
  group = false,
  me,
  compose,
  notice = null,
}: {
  threadKey: string;
  items: ThreadItem[];
  // Several people in it: each named over their words.
  group?: boolean;
  me: { name: string; photo: string | null; agent: boolean };
  compose: string;
  // Something for the moment, between the messages and the box (links just made).
  notice?: ReactNode;
}) {
  const [about, setAbout] = useState<ReplyAbout | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Opened (or reading) at the foot, until they scroll up from it.
  const atFoot = useRef(true);
  const count = items.length;
  const newestMine = items.at(-1)?.mine ?? false;
  // The newest at the bottom, in view, as a phone's messages open; and as
  // more comes in (it refreshes on its own), only for someone already at
  // the foot, or who just wrote it, never pulling a reader away from older ones.
  useEffect(() => {
    const el = scroller.current;
    if (el && (atFoot.current || newestMine)) el.scrollTop = el.scrollHeight;
  }, [count, newestMine]);
  return (
    <>
      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          atFoot.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_FOOT;
        }}
        // (Positioned, so words kept for a screen reader stay inside it rather
        // than stretching the page.)
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
      >
        <ul aria-label="Messages" className="flex flex-col gap-4">
          {items.map((item, i) =>
            item.kind === "homes" ? (
              <HomesMessage
                key={item.id}
                item={item}
                viewerIsAgent={me.agent}
                onReply={(home) => setAbout({ shareId: item.shareId, listingKey: home.key, address: home.address })}
              />
            ) : item.kind === "comment" ? (
              <CommentMessage
                key={item.id}
                item={item}
                quote={!sameHomeAs(items[i - 1], item)}
                named={group && startsRun(items[i - 1], item)}
              />
            ) : (
              <MessageBubble key={item.id} item={item} named={group && startsRun(items[i - 1], item)} />
            ),
          )}
        </ul>
      </div>
      {notice}
      <Composer threadKey={threadKey} me={me} about={about} onClearAbout={() => setAbout(null)} compose={compose} />
    </>
  );
}
