"use client";

import { Check, SendHorizontal } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";

// Under a card, as Facebook has it: your face, and a box right there to say
// something in. Enter sends (Shift+Enter is a new line); the box grows with
// what's typed. `onSend` gives back what went wrong, or nothing once it's
// sent, and the box empties. `sent`: said under the box once it has, until
// they type again. `ring`: ringed in amber, when something waits on them.
export function InlineBox({
  me,
  agent = false,
  placeholder,
  label,
  sendLabel,
  sent,
  ring = false,
  onSend,
  className,
}: {
  me: { name: string; photo: string | null };
  agent?: boolean;
  placeholder: string;
  label: string;
  sendLabel: [idle: string, busy: string];
  sent?: string;
  ring?: boolean;
  onSend: (text: string) => Promise<string | null>;
  className?: string;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const errorId = useId();

  const send = () => {
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const problem = await onSend(text);
      if (problem) setError(problem);
      else {
        setBody("");
        setDone(true);
      }
    });
  };

  return (
    <form
      className={cn("flex items-start gap-2", className)}
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
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setBody(event.target.value);
              setDone(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            className={cn(
              "block max-h-40 min-h-11 w-full resize-none rounded-[22px] bg-stone-100 py-2.5 pl-4 pr-12 text-body leading-6 text-ink [field-sizing:content] placeholder:text-stone-500 focus:bg-white focus:outline-2 focus:outline-brand",
              ring && "ring-2 ring-amber-300",
            )}
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            aria-label={sendLabel[pending ? 1 : 0]}
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
          sent &&
          done && (
            <p role="status" className="mt-1 flex items-center gap-1 px-3 text-meta font-semibold text-emerald-700">
              <Check aria-hidden size={14} /> {sent}
            </p>
          )
        )}
      </div>
    </form>
  );
}
