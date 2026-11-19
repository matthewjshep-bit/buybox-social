"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { setMyName } from "@/app/people/[id]/actions";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";

// Right after signing in with only an email: their first name, the one thing
// asked, then on to where they were going (`next`). Skip goes there without
// one (a like or a comment asks again, the first time). Saved the way a
// name is changed on Edit profile, by the same action.
export function NameStep({ next }: { next: string }) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Your name"
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault();
        const firstName = String(new FormData(event.currentTarget).get("firstName") ?? "");
        start(async () => {
          const result = await setMyName(firstName).catch(() => ({
            ok: false as const,
            error: "That didn't save. Please try again.",
          }));
          if (!result.ok) return setError(result.error);
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <label htmlFor={`${id}-name`} className="text-sm font-medium">
        First name
      </label>
      <input
        id={`${id}-name`}
        name="firstName"
        required
        maxLength={40}
        autoComplete="given-name"
        autoFocus
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(field(), "mt-1")}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn(button({ kind: "primary", size: "lg", block: true }), "mt-4")}
      >
        {pending ? "Saving…" : "Continue"}
      </button>
      <Link href={next} replace className={cn(button({ kind: "ghost", block: true }), "mt-2 text-stone-700")}>
        Skip
      </Link>
    </form>
  );
}
