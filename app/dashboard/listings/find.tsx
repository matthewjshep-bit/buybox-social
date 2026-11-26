"use client";

import { Check, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { findHomesToPost, type HomeToPost } from "@/app/homes/actions";
import { HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import { button } from "@/lib/ui";
import { pinListing, unpinListing } from "./actions";

// The quick way to add a listing: find it by its address or MLS number and
// tap Add. Its facts and photos come with it; nothing to type. Homes already
// on their Listings say so.
export function FindListing({ have }: { have: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; homes: HomeToPost[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Homes as they type, a moment after they stop.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let live = true;
    const wait = setTimeout(async () => {
      const homes = await findHomesToPost(text);
      if (live) setResults({ query: text, homes });
    }, 250);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [query]);
  const text = query.trim();
  // What the last search found, kept (faded) while the next one is on its
  // way, so the list doesn't blink out at every letter.
  const found = text.length >= 2 && results ? results.homes : null;
  const searching = text.length >= 2 && results?.query !== text;

  const add = (key: string) => {
    setAdding(key);
    setError(null);
    startTransition(async () => {
      const result = await pinListing(key);
      if (result.error) {
        setError(result.error);
        setAdding(null);
      } else router.push("/dashboard/listings");
    });
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Find it by address, city, ZIP or MLS number</span>
        <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Address, city, ZIP or MLS #"
          autoComplete="off"
          // The text box's pill (field({ pill: true })), a fingertip and a bit
          // tall, with room for the glass; 16px, so a phone doesn't zoom in on
          // it; no browser-drawn clear X.
          className="h-12 w-full rounded-full border border-stone-300 bg-white pl-11 pr-4 text-base text-ink outline-hidden! placeholder:text-stone-500 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>
      {/* How the search is going, read out as it changes. On screen only where
          there's no list to show instead (the list fades while it looks). */}
      <p
        role="status"
        className={cn(found?.length || !(searching || found) ? "sr-only" : "px-2 pt-3 text-body text-muted")}
      >
        {searching
          ? "Searching…"
          : found?.length === 0
            ? "Not found. Enter it yourself below."
            : found
              ? `${found.length} ${found.length === 1 ? "home" : "homes"} found`
              : ""}
      </p>
      {found && found.length > 0 && (
        <ul
          aria-label="Homes found"
          aria-busy={searching}
          className={cn("mt-1 flex flex-col transition-opacity motion-reduce:transition-none", searching && "opacity-50")}
        >
          {found.map((home) => {
            const mine = have.includes(home.key);
            return (
              <li key={home.key} className="flex items-center gap-3 rounded-xl p-2">
                <HomeThumb src={home.photo ?? undefined} sizes="80px" className="h-12 w-16 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{home.address}</span>
                  <span className="block truncate text-meta text-muted">
                    <span className="font-display">{formatPrice(home.price)}</span> · {home.city}
                  </span>
                </span>
                {mine ? (
                  <span className="flex shrink-0 items-center gap-1 text-meta font-semibold text-emerald-700">
                    <Check aria-hidden size={14} /> Added
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={adding !== null}
                    aria-label={`Add ${home.address}`}
                    onClick={() => add(home.key)}
                    className={cn(button({ kind: "primary" }), "shrink-0")}
                  >
                    {adding === home.key ? "Adding…" : "Add"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// Taking a found home off their Listings (the home itself is untouched).
// Just the word, as Edit is on the other rows: with Send and the star beside
// it, an icon too wouldn't fit a small phone.
export function RemoveFound({ listingKey, address }: { listingKey: string; address: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${address}`}
      onClick={() => startTransition(async () => void (await unpinListing(listingKey)))}
      className={cn(button({ kind: "secondary" }), "shrink-0")}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
