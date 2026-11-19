"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { setMyName } from "@/app/people/[id]/actions";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";

// A buyer's own name, on Edit profile: one field, and it says what everyone
// else sees of it (the first name, never the rest). Saving stays on the page
// and says "Saved", like the other cards here. (An agent's name is among
// their details.)
export function NameForm({ name }: { name: string }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  // Said beside the button once it's saved, until the name's changed again.
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Your name"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError(null);
          setSaved(false);
          const result = await setMyName(value).catch(() => ({
            ok: false as const,
            error: "That didn't save. Please try again.",
          }));
          if (!result.ok) return setError(result.error);
          setSaved(true);
          // Their initial in the bar and on this page, by the new name.
          router.refresh();
        });
      }}
    >
      <div>
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          maxLength={60}
          autoComplete="name"
          value={value}
          onChange={(event) => {
            setSaved(false);
            setValue(event.target.value);
          }}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
          className={cn(field(), "mt-1")}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          People see your first name only.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button({ kind: "primary", size: "lg" })}>
          {pending ? "Saving…" : "Save name"}
        </button>
        {saved && !pending && (
          <p role="status" className="flex items-center gap-1 text-meta font-semibold text-emerald-700">
            <Check aria-hidden size={14} /> Saved
          </p>
        )}
      </div>
    </form>
  );
}
