"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/format";

// Two ways to look at the feed (Clients or Following for an agent, Following
// or For you for anyone else), as pills over it. The one picked is kept in
// the address (`?lens=`), so a link or a reload opens on it, and on this
// device, so the home opens on it next time. Both are on the page already:
// switching is instant and never reloads anything.

const STORAGE = "pc:home-lens";
const EVENT = "pc:home-lens";

function readStored() {
  try {
    return localStorage.getItem(STORAGE);
  } catch {
    return null;
  }
}

const subscribe = (changed: () => void) => {
  window.addEventListener(EVENT, changed);
  return () => window.removeEventListener(EVENT, changed);
};

export function Lenses<K extends string>({
  lenses,
  initial,
  fromUrl,
  label,
  panels,
}: {
  lenses: { key: K; label: string }[];
  // The address's lens, else the home's own default.
  initial: K;
  // Whether `initial` came from the address: then it wins over this device's.
  fromUrl: boolean;
  label: string;
  panels: Record<K, ReactNode>;
}) {
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const [picked, setPicked] = useState<K | null>(null);
  const valid = (key: string | null): key is K => lenses.some((lens) => lens.key === key);
  const lens: K = picked ?? (!fromUrl && valid(stored) ? stored : initial);

  const pick = (key: K) => {
    setPicked(key);
    try {
      localStorage.setItem(STORAGE, key);
    } catch {
      // Storage can be off (a private window): the address still keeps it.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("lens", key);
    // With the router's own state kept: handed a new state, Next takes the
    // new address as a navigation of its own, and the next link tapped (a
    // home, opening over the page) loads the whole page instead.
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <div>
      <div role="group" aria-label={label} className="flex gap-1.5 px-0.5">
        {lenses.map(({ key, label: name }) => (
          <button
            key={key}
            type="button"
            aria-pressed={lens === key}
            onClick={() => pick(key)}
            className={cn(
              // (A 44px touch area around a 36px pill.)
              "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors hit-44",
              lens === key ? "bg-ink text-white" : "text-ink hover:bg-black/5",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      {lenses.map(({ key }) => (
        <div key={key} hidden={lens !== key} className="mt-3">
          {panels[key]}
        </div>
      ))}
    </div>
  );
}
