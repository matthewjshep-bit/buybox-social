"use client";

import { ArrowRight, Check, MessageSquareReply } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ReplyBox } from "@/components/home/reply-box";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// A client's card's footer: what only the agent sees on the left; Reply and
// the way to their link on the right. Reply answers them in that home's
// conversation on their link, whatever they did (a like, a pass, something
// said); when what they said is waiting on the agent, it's the filled button.
// Once sent, it says so. (Whether they're waiting is decided when the page
// arrives, so the answer refreshing the page doesn't move the button.)
export function DayFooter({
  info,
  reply,
  waiting,
  link,
}: {
  info: ReactNode;
  reply: { shareId: string; listingKey: string; name: string; to: string };
  waiting: boolean;
  // Their link's page, at this home.
  link: string;
}) {
  const [wasWaiting] = useState(waiting);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const boxId = useId();
  return (
    <>
      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">{info}</div>
        {sent ? (
          <p role="status" className="flex shrink-0 items-center gap-1 text-meta font-semibold text-emerald-700">
            <Check aria-hidden size={14} /> Sent to {reply.name}
          </p>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? boxId : undefined}
            onClick={() => setOpen((now) => !now)}
            className={cn(
              "shrink-0",
              wasWaiting && !open
                ? button({ kind: "primary" })
                : "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-black/5",
            )}
          >
            <MessageSquareReply aria-hidden size={16} /> Reply<span className="sr-only"> to {reply.name}</span>
          </button>
        )}
        <Link
          href={link}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold text-stone-700 hover:bg-black/5 hover:text-ink"
        >
          Open their link <ArrowRight aria-hidden size={14} />
        </Link>
      </div>
      {open && !sent && (
        <div id={boxId} className="mt-1">
          <ReplyBox
            shareId={reply.shareId}
            listingKey={reply.listingKey}
            name={reply.name}
            to={reply.to}
            onSent={() => {
              setSent(true);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
