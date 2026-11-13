"use client";

import { Heart } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { reactInStream } from "@/app/homes/actions";
import { cn } from "@/lib/format";
import { NO_REACTION, toggleOverall, type ReactionState } from "@/lib/reactions";

// A home's heart, in a feed card: a public like, as the heart in the reel is,
// saved behind the tap without reloading the page (the card stays put). Only
// the like changes; whatever else they said about the home stays.
export function FeedHeart({ listingKey, address, initial }: { listingKey: string; address: string; initial: ReactionState | null }) {
  const [saved, setSaved] = useState<ReactionState>(initial ?? NO_REACTION);
  const [shown, show] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const on = shown.reaction === "like";

  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        aria-label={`Like ${address}`}
        onClick={() => {
          const next = toggleOverall(shown, "like");
          setError(null);
          startTransition(async () => {
            show(next);
            const result = await reactInStream(listingKey, next);
            if (result.ok) setSaved(next);
            else setError(result.error);
          });
        }}
        className={cn(
          "relative z-20 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
          on ? "text-rose-600 hover:bg-rose-50" : "text-ink hover:bg-stone-100",
        )}
      >
        <Heart aria-hidden size={24} className={cn(on && "fill-current")} />
      </button>
      {error && (
        <p role="alert" className="relative z-20 basis-full text-meta text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
