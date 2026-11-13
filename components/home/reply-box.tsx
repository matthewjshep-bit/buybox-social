"use client";

import { Send } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { replyAsAgent } from "@/app/dashboard/actions";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";

// An agent's answer, typed right where the question is (a row in Needs you, a
// client's card), into that home's conversation on the client's link. It grows
// with what's typed, takes focus when it opens, and Escape puts it away.
// Nothing on the page moves while it's open; once sent it says so and steps
// aside (`onSent`), and the row it came from leaves the list on the next load.
export function ReplyBox({
  shareId,
  listingKey,
  name,
  prefill = "",
  onSent,
  onClose,
  className,
}: {
  shareId: string;
  listingKey: string;
  // Who it's to, by first name: "Reply to Jenny".
  name: string;
  prefill?: string;
  onSent: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [body, setBody] = useState(prefill);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();

  // Ready to type, at the end of anything already written for them.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const send = () => {
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await replyAsAgent(shareId, listingKey, text);
      if (result.error) setError(result.error);
      else onSent();
    });
  };

  return (
    <form
      className={cn("flex flex-col gap-1.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={body}
          rows={1}
          maxLength={1000}
          aria-label={`Reply to ${name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
            // ⌘/Ctrl+Enter sends; Enter alone is a new line.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          className={cn(
            field({ lines: true }),
            "min-h-11 max-h-40 resize-none py-2.5 text-body leading-6 [field-sizing:content]",
          )}
        />
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className={cn(button({ kind: "primary" }), "shrink-0")}
        >
          <Send aria-hidden size={16} /> {pending ? "Sending" : "Send"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-meta text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
