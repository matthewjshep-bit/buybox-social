"use client";

import { Check, SendHorizontal } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { replyAsAgent } from "@/app/dashboard/actions";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";

// Under a client's card, as Facebook has it: the agent's own face, and a box
// right there to answer them in ("Reply to Ben…"), into that home's
// conversation on their link, whatever they did. Enter sends (Shift+Enter is
// a new line). Once sent, the reply joins the ones above it. When what they
// said is waiting on the agent, the box is ringed in amber.
export function InlineReply({
  me,
  reply,
  waiting,
}: {
  me: { name: string; photo: string | null };
  reply: { shareId: string; listingKey: string; name: string; to: string };
  waiting: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();

  const send = () => {
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await replyAsAgent(reply.shareId, reply.listingKey, text, reply.to);
      if (result.error) setError(result.error);
      else {
        setBody("");
        setSent(true);
      }
    });
  };

  return (
    <form
      className="mt-2 flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Avatar name={me.name} tone="agent" size={8} photo={me.photo} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="relative">
          <textarea
            ref={box}
            value={body}
            rows={1}
            maxLength={1000}
            placeholder={`Reply to ${reply.name}…`}
            aria-label={`Reply to ${reply.name}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setBody(event.target.value);
              setSent(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            className={cn(
              "block max-h-40 min-h-11 w-full resize-none rounded-[22px] bg-stone-100 py-2.5 pl-4 pr-12 text-body leading-6 text-ink [field-sizing:content] placeholder:text-stone-500 focus:bg-white focus:outline-2 focus:outline-brand",
              waiting && "ring-2 ring-amber-300",
            )}
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            aria-label={pending ? "Sending" : "Send"}
            className="absolute bottom-0.5 right-0.5 grid size-10 place-items-center rounded-full text-brand hover:bg-brand/10 disabled:text-stone-400 disabled:hover:bg-transparent"
          >
            <SendHorizontal aria-hidden size={20} />
          </button>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="mt-1 px-3 text-meta text-red-700">
            {error}
          </p>
        ) : (
          sent && (
            <p role="status" className="mt-1 flex items-center gap-1 px-3 text-meta font-semibold text-emerald-700">
              <Check aria-hidden size={14} /> Sent to {reply.name}
            </p>
          )
        )}
      </div>
    </form>
  );
}
