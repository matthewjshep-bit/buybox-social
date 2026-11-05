"use client";

import { Home, Map as MapIcon, Search, ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { ThreadActions } from "@/components/listing-thread";
import type { MapHome } from "@/components/listing-map";
import { ReelFeed } from "@/components/reel";
import type { FeedPost } from "@/lib/feed";
import { cn, formatPrice } from "@/lib/format";
import { filtersQuery, HOME_TYPES, SORTS, type SearchFilters } from "@/lib/search-options";

// The map draws with WebGL in the browser, so it never renders on the server.
const ListingMap = dynamic(() => import("@/components/listing-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-stone-200" />,
});

const MIN_PRICES = [400_000, 600_000, 800_000, 1_000_000, 1_500_000, 2_000_000];
const MAX_PRICES = [600_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];

const pill =
  "h-11 shrink-0 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand";

// The map on the left; on the right, a look at one home at a time. Picking a
// pin brings that home up; scrolling the homes moves the map along with them;
// tapping one opens it full screen, with the rest of the search after it. On
// phones, the map and the homes are a tap apart.
export function SearchView({
  filters,
  count: total,
  posts,
  startKey,
  actions,
  myName,
  prompt,
}: {
  filters: SearchFilters;
  count: number;
  posts: FeedPost[];
  // Opened from a home's address: start on it.
  startKey: string | null;
  actions: ThreadActions;
  myName: string | null;
  prompt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The controls show a change at once, while the new results load.
  const [shown, setShown] = useOptimistic(filters);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(startKey ?? posts[0]?.listing.ListingKey ?? null);
  const [focus, setFocus] = useState(startKey ? { key: startKey, n: 0 } : null);
  const [mobileMap, setMobileMap] = useState(false);
  // Filters as of the last change, which may still be loading. Building on these
  // rather than the rendered ones means two quick changes don't undo each other.
  const latest = useRef(filters);
  useEffect(() => {
    latest.current = filters;
  }, [filters]);

  const update = (patch: Partial<Record<keyof SearchFilters, string | number | boolean | null>>) => {
    const next = { ...latest.current, ...patch } as Record<string, string | number | boolean | null>;
    latest.current = next as unknown as SearchFilters;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "" || value === false) continue;
      if (key === "sort" && value === "reactions") continue;
      params.set(key, value === true ? "1" : String(value));
    }
    const query = params.toString();
    startTransition(() => {
      setShown(next as unknown as SearchFilters);
      router.replace(query ? `/search?${query}` : "/search", { scroll: false });
    });
  };

  const homes = useMemo<MapHome[]>(
    () =>
      posts
        .filter((post) => post.listing.Latitude != null && post.listing.Longitude != null)
        .map(({ listing }) => ({
          key: listing.ListingKey,
          latitude: listing.Latitude!,
          longitude: listing.Longitude!,
          price: listing.ListPrice,
          address: listing.UnparsedAddress,
        })),
    [posts],
  );

  const pick = (key: string) => {
    setFocus((current) => ({ key, n: (current?.n ?? 0) + 1 }));
    setMobileMap(false);
  };

  const count = `${total} ${total === 1 ? "home" : "homes"}`;

  return (
    <div className="flex h-[calc(100dvh-3.5rem-1px)] flex-col">
      <form
        role="search"
        aria-label="Filter homes"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() });
        }}
        className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-3"
      >
        <div className="relative w-full sm:w-72">
          <label htmlFor="search-q" className="sr-only">
            City, ZIP or address
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="City, ZIP or address"
            className="h-11 w-full rounded-full border border-stone-300 bg-white pl-4 pr-11 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-stone-700"
          >
            <Search aria-hidden size={18} />
          </button>
        </div>
        {/* One swipeable row on phones; wraps on wider screens. */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
          <select
            aria-label="Minimum price"
            value={shown.minPrice ?? ""}
            onChange={(event) => update({ minPrice: event.target.value || null })}
            className={pill}
          >
            <option value="">No min</option>
            {MIN_PRICES.map((p) => (
              <option key={p} value={p}>
                {formatPrice(p)}+
              </option>
            ))}
          </select>
          <select
            aria-label="Maximum price"
            value={shown.maxPrice ?? ""}
            onChange={(event) => update({ maxPrice: event.target.value || null })}
            className={pill}
          >
            <option value="">No max</option>
            {MAX_PRICES.map((p) => (
              <option key={p} value={p}>
                Up to {formatPrice(p)}
              </option>
            ))}
          </select>
          <select
            aria-label="Bedrooms"
            value={shown.beds ?? ""}
            onChange={(event) => update({ beds: event.target.value || null })}
            className={pill}
          >
            <option value="">Any beds</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+ beds
              </option>
            ))}
          </select>
          <select
            aria-label="Bathrooms"
            value={shown.baths ?? ""}
            onChange={(event) => update({ baths: event.target.value || null })}
            className={pill}
          >
            <option value="">Any baths</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}+ baths
              </option>
            ))}
          </select>
          <select
            aria-label="Home type"
            value={shown.type ?? ""}
            onChange={(event) => update({ type: event.target.value || null })}
            className={pill}
          >
            <option value="">All home types</option>
            {Object.entries(HOME_TYPES).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className={cn(pill, "flex cursor-pointer items-center gap-2 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50")}>
            <input
              type="checkbox"
              checked={shown.liked}
              onChange={(event) => update({ liked: event.target.checked })}
              className="size-4 accent-emerald-700"
            />
            <ThumbsUp aria-hidden size={15} className="text-emerald-700" />
            Liked by buyers
          </label>
        </div>
        <div className="flex w-full items-center justify-between gap-3 lg:ml-auto lg:w-auto">
          <div className="flex items-baseline gap-2">
            <h1 id="results-title" className="text-sm font-semibold">
              {filters.q ? `Homes matching “${filters.q}”` : "Washington homes for sale"}
            </h1>
            <p className="text-sm text-stone-600" aria-live="polite">
              {count}
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-stone-700">Sort:</span>
            <select
              value={shown.sort}
              onChange={(event) => update({ sort: event.target.value })}
              className="min-h-11 rounded-lg bg-transparent font-semibold text-brand outline-none"
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <div className="flex min-h-0 flex-1">
        <div className={cn("relative min-h-0 flex-1", mobileMap ? "block" : "hidden lg:block")}>
          <ListingMap
            homes={homes}
            activeKey={activeKey}
            hoveredKey={hoveredKey}
            onHover={setHoveredKey}
            onSelect={pick}
          />
        </div>

        <section
          aria-label="Homes"
          aria-busy={pending}
          className={cn(
            "min-h-0 bg-stone-950 transition-opacity lg:block lg:w-[min(46rem,50%)] lg:flex-none",
            mobileMap ? "hidden" : "block flex-1",
            pending && "opacity-60",
          )}
        >
          {posts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center bg-surface p-8 text-center">
              <p className="font-semibold">No homes match those filters.</p>
              <Link href="/search" className="mt-2 inline-block font-semibold text-brand underline">
                Clear all filters
              </Link>
            </div>
          ) : (
            <ReelFeed
              // A new search is a new set of homes.
              key={posts.map((post) => post.listing.ListingKey).join()}
              initial={posts}
              mode="public"
              embedded
              actions={actions}
              myName={myName}
              prompt={prompt}
              focus={focus}
              onActiveChange={setActiveKey}
              // Just a look here: a tap opens it full screen, with the rest of
              // this search to scroll through.
              onOpen={(key) => {
                const query = filtersQuery(latest.current);
                router.push(`/homes?${query ? `${query}&` : ""}home=${encodeURIComponent(key)}`);
              }}
              end={
                <div className="max-w-sm">
                  <h2 className="font-display text-2xl">That&apos;s every home in this search</h2>
                  <p className="mt-2 text-white/80">Zoom out on the map or change the filters to see more.</p>
                </div>
              }
            />
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={() => setMobileMap((v) => !v)}
        className="fixed bottom-5 left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 font-semibold text-stone-900 shadow-lg ring-1 ring-stone-200 lg:hidden"
      >
        {mobileMap ? <Home aria-hidden size={18} /> : <MapIcon aria-hidden size={18} />}
        {mobileMap ? "Homes" : "Map"}
      </button>
    </div>
  );
}
