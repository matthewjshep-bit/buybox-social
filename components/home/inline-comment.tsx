"use client";

import { SendHorizontal } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { commentInReel } from "@/app/homes/actions";
import { CommentBubble } from "@/components/comment-bubble";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";

// Under a home in the feed, as Facebook has it: your face, and a box right
// there to say something about the home ("Write a comment…"), into its
// public conversation. Enter posts (Shift+Enter is a new line); what you
// said shows straight away, just above the box.
export function InlineComment({
  me,
  listingKey,
  address,
  agent = false,
}: {
  me: { name: string; photo: string | null };
  listingKey: string;
  address: string;
  agent?: boolean;
}) {
  const [body, setBody] = useState("");
  const [posted, setPosted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorId = useId();

  const send = () => {
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await commentInReel(listingKey, text);
      if (!result.ok) setError(result.error);
      else {
        setPosted((now) => [...now, text]);
        setBody("");
      }
    });
  };

  return (
    <div className="relative z-20 flex flex-col gap-2 px-3.5 pt-3">
      {posted.length > 0 && (
        <ul aria-label="What you said" className="flex flex-col gap-2">
          {posted.map((text, i) => (
            <li key={i}>
              <CommentBubble name="You" face={me.name} photo={me.photo} agent={agent}>
                {text}
              </CommentBubble>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Avatar name={me.name} tone={agent ? "agent" : "person"} size={8} photo={me.photo} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="relative">
            <textarea
              value={body}
              rows={1}
              maxLength={1000}
              placeholder="Write a comment…"
              aria-label={`Comment on ${address}`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              className={cn(
                "block max-h-40 min-h-11 w-full resize-none rounded-[22px] bg-stone-100 py-2.5 pl-4 pr-12 text-body leading-6 text-ink [field-sizing:content] placeholder:text-stone-500 focus:bg-white focus:outline-2 focus:outline-brand",
              )}
            />
            <button
              type="submit"
              disabled={pending || !body.trim()}
              aria-label={pending ? "Posting" : "Post"}
              className="absolute bottom-0.5 right-0.5 grid size-10 place-items-center rounded-full text-brand hover:bg-brand/10 disabled:text-stone-400 disabled:hover:bg-transparent"
            >
              <SendHorizontal aria-hidden size={20} />
            </button>
          </div>
          {error && (
            <p id={errorId} role="alert" className="mt-1 px-3 text-meta text-red-700">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
