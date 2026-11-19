"use client";

import { useState, type ReactNode } from "react";
import { replyAsAgent } from "@/app/dashboard/actions";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";
import { useHoldRow } from "./held-feed";
import { InlineBox } from "./inline-box";

// Where an answer goes: that home's conversation on their link, to them.
type ReplyTo = { shareId: string; listingKey: string; to: string };

// Under a client's card, as Facebook has it: the agent's own face, and a box
// right there to answer them in ("Reply to Ben…"), into that home's
// conversation on their link, whatever they did. Enter sends (Shift+Enter is
// a new line). Once sent, the reply joins the ones above it. When what they
// said is waiting on the agent, the box is ringed in amber.
export function InlineReply({
  me,
  reply,
  waiting,
  autoFocus = false,
}: {
  me: { name: string; photo: string | null };
  reply: ReplyTo & { name: string };
  waiting: boolean;
  autoFocus?: boolean;
}) {
  return (
    <InlineBox
      me={me}
      agent
      className="mt-2"
      placeholder={`Reply to ${reply.name}…`}
      label={`Reply to ${reply.name}`}
      sendLabel={["Send", "Sending"]}
      sent={`Sent to ${reply.name}`}
      ring={waiting}
      autoFocus={autoFocus}
      onSend={async (text) => (await replyAsAgent(reply.shareId, reply.listingKey, text, reply.to)).error ?? null}
    />
  );
}

const same = (a: ReplyTo | null, b: ReplyTo | null) =>
  Boolean(a && b && a.shareId === b.shareId && a.listingKey === b.listingKey && a.to === b.to);

// A client's row in "Your clients" on Home (`children`: their face, name and
// the one thing to know about them), with one filled Reply beside it while
// they're waiting. Tapped, the box to answer them opens right under their
// row, ready to type in. `reply`: what's waiting (null when nothing is).
// Once it's answered they aren't waiting any more and the button goes; the
// box stays open, still saying "Sent to Jo", until the page is left. If
// something else of theirs is waiting by then, Reply is back beside them for
// that. (Once the box is open, the list keeps their row: `useHoldRow`.)
export function RevealReply({
  me,
  name,
  reply,
  children,
}: {
  me: { name: string; photo: string | null };
  name: string;
  reply: ReplyTo | null;
  children: ReactNode;
}) {
  // What the open box answers.
  const [open, setOpen] = useState<ReplyTo | null>(null);
  const holdRow = useHoldRow();
  const waiting = same(reply, open);
  return (
    <>
      <div className="flex items-center gap-2 pr-4">
        {children}
        {reply && !waiting && (
          <button
            type="button"
            onClick={() => {
              setOpen(reply);
              holdRow();
            }}
            className={cn(button({ kind: "primary" }), "shrink-0")}
          >
            Reply<span className="sr-only"> to {name}</span>
          </button>
        )}
      </div>
      {open && (
        <div className="px-4 pb-2">
          <InlineReply
            // (A box of its own for each thing answered.)
            key={`${open.shareId}|${open.listingKey}|${open.to}`}
            me={me}
            reply={{ ...open, name }}
            waiting={waiting}
            autoFocus
          />
        </div>
      )}
    </>
  );
}
