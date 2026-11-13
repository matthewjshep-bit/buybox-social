"use client";

import { UserCheck, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { setFollowing } from "@/app/people/[id]/actions";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// On a new follower's line: follow them too, in one tap. It stays on the line
// as Following once tapped, so a mistaken tap can be undone right there. It
// sits above the line's own link (to their page).
export function FollowBack({ personId, name }: { personId: string; name: string }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="relative z-20 flex shrink-0 flex-col items-end">
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
        className={button({ kind: on ? "secondary" : "primary" })}
      >
        {on ? <UserCheck aria-hidden size={16} /> : <UserPlus aria-hidden size={16} />}
        {on ? "Following" : "Follow back"}
        <span className="sr-only"> {name}</span>
      </button>
      <span role="status" className={cn("text-meta text-red-700", !error && "sr-only")}>
        {error}
      </span>
    </span>
  );
}
