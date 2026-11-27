"use client";

import { useId, useState, useTransition } from "react";
import { showLinkActivity } from "@/app/people/[id]/actions";
import { Switch } from "@/components/ui";

// One switch: whether what you like and say about the homes someone sends you
// is public, by name, on the home and your profile (and your passes there, on
// your profile). On to start with. Switched off, what was public from your
// links comes down; switched back on, it's public from then on.
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
          <p className="text-body font-semibold text-ink">Share my likes and comments on homes I&apos;m sent</p>
          <p id={hint} className="text-meta text-muted">
            They show on the home and your profile, with your first name. Off, they stay between you and your agent.
          </p>
        </div>
        <Switch on={on} onChange={toggle} label="Share my likes and comments on homes I'm sent" describedBy={hint} />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-meta font-semibold text-amber-800">
          {error}
        </p>
      )}
    </>
  );
}
