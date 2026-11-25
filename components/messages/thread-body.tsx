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

export function ThreadBody({
  threadKey,
  items,
  me,
  compose,
  notice = null,
}: {
  threadKey: string;
  items: ThreadItem[];
  me: { name: string; photo: string | null; agent: boolean };
  compose: string;
  // Something for the moment, between the messages and the box (links just made).
  notice?: ReactNode;
}) {
  const [about, setAbout] = useState<ReplyAbout | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = items.length;
  // The newest at the bottom, in view, as a phone's messages open.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
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
              <CommentMessage key={item.id} item={item} quote={!sameHomeAs(items[i - 1], item)} />
            ) : (
              <MessageBubble key={item.id} item={item} />
            ),
          )}
        </ul>
      </div>
      {notice}
      <Composer threadKey={threadKey} me={me} about={about} onClearAbout={() => setAbout(null)} compose={compose} />
    </>
  );
}
