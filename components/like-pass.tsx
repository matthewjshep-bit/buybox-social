"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useThread } from "@/components/listing-thread";
import { cn } from "@/lib/format";
import {
  ASPECTS,
  CHIPS,
  toggleAspect,
  toggleOverall,
  type Aspect,
  type ReactionState,
  type Sentiment,
} from "@/lib/reactions";

// Your reaction to a home: a like (the heart), or "not for me", plus any
// specifics. Each change saves as it happens.

export const QUESTIONS: Record<Sentiment, string> = {
  like: "What else do you like?",
  dislike: "What made you pass?",
};

const same = (a: ReactionState | undefined, b: ReactionState | undefined) => JSON.stringify(a) === JSON.stringify(b);

// Your own reactions, one per home, kept here so taps show instantly and pages
// that save quietly (without reloading) stay right. When the server's copy
// changes (say you reacted in another tab), that home takes the server's copy,
// unless you're still saving a change to it.
export function useReactions(server: Record<string, ReactionState>) {
  const { actions, ensureName } = useThread();
  const [states, setStates] = useState(server);
  const [base, setBase] = useState(server);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // When you last changed your reaction to each home here.
  const [changedAt, setChangedAt] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, number>>({});

  const changed = Object.keys(server).filter((key) => !same(server[key], base[key]));
  if (changed.length > 0) {
    setBase(server);
    const settled = changed.filter((key) => !saving[key]);
    setStates((current) => ({ ...current, ...Object.fromEntries(settled.map((key) => [key, server[key]])) }));
  }

  const save = async (key: string, next: ReactionState) => {
    if (!(await ensureName())) return false;
    setStates((current) => ({ ...current, [key]: next }));
    setChangedAt((current) => ({ ...current, [key]: new Date().toISOString() }));
    setErrors((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
    const count = (by: number) => setSaving((current) => ({ ...current, [key]: (current[key] ?? 0) + by }));
    count(1);
    // Done as far as you're concerned (true: it's showing) while it saves.
    actions
      .react(key, next)
      .finally(() => count(-1))
      .then((result) => {
        if (!result.ok) setErrors((current) => ({ ...current, [key]: result.error }));
      });
    return true;
  };

  return {
    states,
    errors,
    base,
    changedAt,
    // Like or "not for me": on, or off again.
    choose: (key: string, sentiment: Sentiment) => save(key, toggleOverall(states[key], sentiment)),
    // Like, and leave it liked: a double-tap never un-likes.
    like: (key: string) =>
      states[key]?.reaction === "like" ? Promise.resolve(true) : save(key, toggleOverall(states[key], "like")),
    toggle: (key: string, aspect: Aspect) => {
      const state = states[key];
      if (state?.reaction) save(key, toggleAspect(state, state.reaction, aspect));
    },
  };
}

// The specifics for a like or a pass: after a like, the things photos can't
// show; after a pass, everything.
export function AspectChips({ state, onToggle }: { state: ReactionState; onToggle: (aspect: Aspect) => void }) {
  const sentiment = state.reaction;
  if (!sentiment) return null;
  const picked = sentiment === "like" ? state.liked : state.disliked;
  return (
    <div>
      <p className="text-sm font-semibold">
        {QUESTIONS[sentiment]} <span className="font-normal text-stone-600">Optional.</span>
      </p>
      <div role="group" aria-label={QUESTIONS[sentiment]} className="mt-2 flex flex-wrap gap-2">
        {ASPECTS.filter(({ id }) => CHIPS[sentiment].includes(id) || picked.includes(id)).map(({ id, label }) => {
          const on = picked.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(id)}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
                on
                  ? sentiment === "like"
                    ? "border-rose-600 bg-rose-50 text-rose-900"
                    : "border-amber-800 bg-amber-50 text-amber-900"
                  : "border-stone-300 bg-white text-stone-800 hover:border-stone-500",
              )}
            >
              {on && <Check aria-hidden size={14} />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
