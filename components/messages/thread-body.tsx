"use client";

import { useEffect, useRef, useState } from "react";
import { Composer, type ReplyAbout } from "@/components/messages/composer";
import { HomesMessage, MessageBubble } from "@/components/messages/home-card";
import type { ThreadItem } from "@/lib/messages";

// A conversation's messages, oldest first, scrolled to the newest, with the
// box to write in at the foot. Reply on a home points the box at that home.
export function ThreadBody({
  threadKey,
  items,
  me,
  compose,
}: {
  threadKey: string;
  items: ThreadItem[];
  me: { name: string; photo: string | null; agent: boolean };
  compose: string;
}) {
  const [about, setAbout] = useState<ReplyAbout | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = items.length + items.reduce((sum, item) => sum + (item.kind === "homes" ? item.homes.reduce((n, h) => n + h.comments.length, 0) : 0), 0);
  // The newest at the bottom, in view, as a phone's messages open.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
        <ul aria-label="Messages" className="flex flex-col gap-5">
          {items.map((item) =>
            item.kind === "homes" ? (
              <HomesMessage
                key={item.id}
                item={item}
                viewerIsAgent={me.agent}
                showAll={items.length === 1}
                onReply={(home) => setAbout({ shareId: item.shareId, listingKey: home.key, address: home.address })}
              />
            ) : (
              <MessageBubble key={item.id} item={item} />
            ),
          )}
        </ul>
      </div>
      <Composer threadKey={threadKey} me={me} about={about} onClearAbout={() => setAbout(null)} compose={compose} />
    </>
  );
}
