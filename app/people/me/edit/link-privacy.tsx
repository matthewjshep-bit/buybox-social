"use client";

import { useId, useState, useTransition } from "react";
import { showLinkActivity } from "@/app/people/[id]/actions";
import { Switch } from "@/components/ui";

// One switch: whether what you like, pass on and say about the homes someone
// sends you shows on your profile. On to start with. Switched off, none of it
// shows; switched back on, it shows from then on.
export function LinkPrivacy({ shown }: { shown: boolean }) {
  const [on, setOn] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const hint = useId();
  const toggle = () => {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      const result = await showLinkActivity(next);
      if (!result.ok) {
        setOn(!next);
        setError("Couldn't save that. Try again.");
      }
    });
  };
  return (
    <>
      <div className="mt-2 flex min-h-14 items-center justify-between gap-3">
        <div className="min-w-0 py-2">
          <p className="text-body font-semibold text-ink">Show what I do on homes I&apos;m sent</p>
          <p id={hint} className="text-meta text-muted">
            Your likes, passes and comments on homes an agent sends you show on your profile.
          </p>
        </div>
        <Switch on={on} onChange={toggle} label="Show what I do on homes I'm sent" describedBy={hint} />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-meta font-semibold text-amber-800">
          {error}
        </p>
      )}
    </>
  );
}
