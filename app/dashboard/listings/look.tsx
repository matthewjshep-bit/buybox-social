"use client";

import { Check, Grid2x2, Grid3x3, LayoutPanelTop, List, Star } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/format";
import type { ListingLayout } from "@/lib/own-listings";
import { featureListing, setListingsLayout } from "./actions";

const LAYOUTS: { key: ListingLayout; label: string; icon: typeof List }[] = [
  { key: "featured", label: "Featured", icon: LayoutPanelTop },
  { key: "grid2", label: "2 across", icon: Grid2x2 },
  { key: "grid3", label: "3 across", icon: Grid3x3 },
  { key: "list", label: "List", icon: List },
];

// How their listings are laid out on their profile: one featured with the
// rest under it, two or three across, or a plain list. One tap saves it.
export function LayoutPicker({ layout }: { layout: ListingLayout }) {
  const [now, setNow] = useState(layout);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const choose = (next: ListingLayout) => {
    if (next === now) return;
    const before = now;
    setNow(next);
    setSaved(false);
    startTransition(async () => {
      const result = await setListingsLayout(next);
      if (result.error) setNow(before);
      else setSaved(true);
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="radiogroup" aria-label="Layout on your profile" className="flex flex-wrap gap-1.5">
        {LAYOUTS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={now === key}
            disabled={pending}
            onClick={() => choose(key)}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
              now === key ? "border-brand bg-brand text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500",
            )}
          >
            <Icon aria-hidden size={16} /> {label}
          </button>
        ))}
      </div>
      {saved && !pending && (
        <p role="status" className="flex items-center gap-1 text-meta font-semibold text-emerald-700">
          <Check aria-hidden size={14} /> Saved
        </p>
      )}
    </div>
  );
}

// The listing that leads their profile: a star, on the one that does. Tapping
// another moves it there; tapping the one that has it gives it up.
export function FeatureButton({ listingKey, address, featured }: { listingKey: string; address: string; featured: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={featured}
      aria-label={featured ? `${address} is featured` : `Feature ${address}`}
      title={featured ? "Featured: first on your profile" : "Feature: put it first on your profile"}
      onClick={() => startTransition(async () => void (await featureListing(featured ? null : listingKey)))}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full hover:bg-black/5",
        featured ? "text-amber-500" : "text-stone-400 hover:text-stone-700",
      )}
    >
      <Star aria-hidden size={20} className={featured ? "fill-current" : undefined} />
    </button>
  );
}
