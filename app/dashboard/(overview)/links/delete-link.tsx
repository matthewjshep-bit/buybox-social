"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";
import { deleteShare } from "../../actions";

// Deletes a link nobody has opened and nobody is named on (one sent by
// mistake, or to try it out), from its details page. Quiet, and in two
// steps: "Delete", then "Yes, delete" or "Keep"; gone, Messages is back
// without it. `what`: the link's homes, for a screen reader.
export function DeleteLink({ shareId, what }: { shareId: string; what: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const question = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) question.current?.focus();
  }, [asking]);
  if (!asking) {
    return (
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setError(null);
          setAsking(true);
        }}
        className={cn(button({ kind: "ghost", size: "lg" }), "text-stone-700")}
      >
        <Trash2 aria-hidden size={18} /> Delete<span className="sr-only"> the link for {what}</span>
      </button>
    );
  }
  return (
    <div
      ref={question}
      role="group"
      aria-label={`Delete the link for ${what}?`}
      tabIndex={-1}
      className="flex flex-wrap items-center gap-2 outline-none"
    >
      <button
        type="button"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return;
          startTransition(async () => {
            const result = await deleteShare(shareId);
            if (result.error) setError(result.error);
            // Gone: back to the conversations, without it.
            else router.push("/messages");
          });
        }}
        className={button({ kind: "danger", size: "lg" })}
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          requestAnimationFrame(() => opener.current?.focus());
        }}
        className={button({ kind: "secondary", size: "lg" })}
      >
        Keep
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
