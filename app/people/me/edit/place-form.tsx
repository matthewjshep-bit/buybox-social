"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { savePlace } from "@/app/welcome/actions";
import { PlaceField } from "@/components/place-field";
import { button } from "@/lib/ui";

// Where they are, on Edit profile: shown by their name, and what their feed
// leans toward. Saved with its own button; empty takes it off.
export function PlaceForm({ place, places }: { place: string; places: string[] }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(place);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Your location"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await savePlace(value).catch(() => ({ ok: false as const, error: "That didn't save." }));
          if (!result.ok) return setState({ error: result.error });
          setState({ saved: true });
          router.refresh();
        });
      }}
    >
      <PlaceField
        value={value}
        onChange={(next) => {
          setValue(next);
          setState({});
        }}
        places={places}
        invalid={Boolean(state.error)}
        describedBy={state.error ? `${id}-error` : undefined}
      />
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending} className={button({ kind: "secondary" })}>
          {pending ? "Saving…" : "Save location"}
        </button>
        {state.saved && (
          <p role="status" className="text-sm font-semibold text-emerald-700">
            Saved
          </p>
        )}
      </div>
      {state.error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
