"use client";

import { useState, useTransition } from "react";
import { setFollowing } from "@/app/people/[id]/actions";
import { cn } from "@/lib/format";

// Follow, as words rather than a filled button: the home keeps one filled
// button, and a few suggested people beside the feed shouldn't shout. It stays
// where it is once tapped (the page isn't reloaded under it), so a mistaken
// tap can be undone right there.
export function FollowText({ personId, name, className }: { personId: string; name: string; className?: string }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        aria-disabled={pending}
        onClick={() => {
          if (pending) return;
          const next = !on;
          setOn(next);
          setError(null);
          startTransition(async () => {
            const result = await setFollowing(personId, next, true);
            if (!result.ok) {
              setOn(!next);
              setError(result.error);
            }
          });
        }}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-meta font-semibold hover:underline",
          on ? "text-muted" : "text-brand",
          className,
        )}
      >
        {on ? "Following" : "Follow"}
        <span className="sr-only"> {name}</span>
      </button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}
