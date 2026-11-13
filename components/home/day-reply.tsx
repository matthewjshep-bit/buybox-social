"use client";

import { ArrowRight, Check, MessageSquareReply } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ReplyBox } from "@/components/home/reply-box";

// A client card's footer: what only the agent sees on the left, one thing to
// do on the right. When what they said is waiting for an answer, that's
// Reply, opening a box under it; once sent, it says so, with the way to their
// link. (What it offers is decided when the page arrives, so the answer
// refreshing the page doesn't swap it out from under the agent.)
export function DayFooter({
  info,
  reply,
  action,
}: {
  info: ReactNode;
  reply: { shareId: string; listingKey: string; name: string } | null;
  action: { href: string; label: string };
}) {
  const [waiting] = useState(reply);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const boxId = useId();
  return (
    <>
      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-x-3">
        <div className="min-w-0 flex-1">{info}</div>
        {!waiting ? (
          <Link
            href={action.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold text-brand hover:bg-black/5"
          >
            {action.label} <ArrowRight aria-hidden size={14} />
          </Link>
        ) : sent ? (
          <p role="status" className="flex shrink-0 items-center gap-2 text-meta">
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <Check aria-hidden size={14} /> Sent to {waiting.name}
            </span>
            <Link
              href={`/dashboard/shares/${waiting.shareId}?tab=homes#home-${encodeURIComponent(waiting.listingKey)}`}
              className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
            >
              Open their link
            </Link>
          </p>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? boxId : undefined}
            onClick={() => setOpen((now) => !now)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-brand hover:bg-black/5"
          >
            <MessageSquareReply aria-hidden size={16} /> Reply<span className="sr-only"> to {waiting.name}</span>
          </button>
        )}
      </div>
      {waiting && open && !sent && (
        <div id={boxId} className="mt-1">
          <ReplyBox
            shareId={waiting.shareId}
            listingKey={waiting.listingKey}
            name={waiting.name}
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
