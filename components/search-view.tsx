"use client";

import { Eye, Flame, List, Map as MapIcon, MessageCircle, Search, ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { LikeButton } from "@/components/listing-thread";
import type { MapHome } from "@/components/listing-map";
import { activeLabel, cn, formatPrice } from "@/lib/format";
import { aspectLabel, topAspects } from "@/lib/reactions";
import { isSampleListing } from "@/lib/listings/types";
import type { SearchResult } from "@/lib/search";
import { HOME_TYPES, SORTS, type SearchFilters } from "@/lib/search-options";

// The map draws with WebGL in the browser, so it never renders on the server.
const ListingMap = dynamic(() => import("@/components/listing-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-stone-200" />,
});

const MIN_PRICES = [400_000, 600_000, 800_000, 1_000_000, 1_500_000, 2_000_000];
const MAX_PRICES = [600_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];

const pill =
  "h-11 shrink-0 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function SearchView({ filters, results }: { filters: SearchFilters; results: SearchResult[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The controls show a change at once, while the new results load.
  const [shown, setShown] = useOptimistic(filters);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileMap, setMobileMap] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
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
      if (key === "sort" && value === "talked") continue;
      params.set(key, value === true ? "1" : String(value));
    }
    const query = params.toString();
    setSelectedKey(null);
    startTransition(() => {
      setShown(next as unknown as SearchFilters);
      router.replace(query ? `/search?${query}` : "/search", { scroll: false });
    });
  };

  const homes = useMemo<MapHome[]>(
    () =>
      results
        .filter((r) => r.listing.Latitude != null && r.listing.Longitude != null)
        .map((r) => ({
          key: r.listing.ListingKey,
          latitude: r.listing.Latitude!,
          longitude: r.listing.Longitude!,
          price: r.listing.ListPrice,
          address: r.listing.UnparsedAddress,
          city: r.listing.City,
          photo: r.listing.Media[0]?.MediaURL,
          beds: r.listing.BedroomsTotal,
          baths: r.listing.BathroomsTotalInteger,
        })),
    [results],
  );

  // Picking a pin on the map brings its card into view.
  useEffect(() => {
    if (!selectedKey) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cardRefs.current.get(selectedKey)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [selectedKey]);

  const count = `${results.length} ${results.length === 1 ? "home" : "homes"}`;

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
      </form>

      <div className="flex min-h-0 flex-1">
        <div className={cn("relative min-h-0 flex-1", mobileMap ? "block" : "hidden lg:block")}>
          <ListingMap
            homes={homes}
            activeKey={hoveredKey}
            selectedKey={selectedKey}
            onHover={setHoveredKey}
            onSelect={setSelectedKey}
          />
        </div>

        <section
          aria-labelledby="results-title"
          aria-busy={pending}
          className={cn(
            "min-h-0 overflow-y-auto bg-surface px-4 pb-24 pt-4 transition-opacity lg:block lg:w-[min(46rem,52%)] lg:flex-none lg:pb-6",
            mobileMap ? "hidden" : "block flex-1",
            pending && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 id="results-title" className="font-display text-2xl">
                {filters.q ? `Homes matching “${filters.q}”` : "Washington homes for sale"}
              </h1>
              <p className="text-sm font-semibold" aria-live="polite">
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

          {results.length === 0 ? (
            <div className="mt-8 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
              <p className="font-semibold">No homes match those filters.</p>
              <Link href="/search" className="mt-2 inline-block font-semibold text-brand underline">
                Clear all filters
              </Link>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {results.map((result, index) => (
                <SearchCard
                  key={result.listing.ListingKey}
                  result={result}
                  priority={index < 2}
                  highlighted={
                    result.listing.ListingKey === hoveredKey || result.listing.ListingKey === selectedKey
                  }
                  onHover={setHoveredKey}
                  cardRef={(el) => {
                    if (el) cardRefs.current.set(result.listing.ListingKey, el);
                    else cardRefs.current.delete(result.listing.ListingKey);
                  }}
                />
              ))}
            </ul>
          )}
          <p className="mt-6 text-center text-xs text-stone-600">
            Sample listings for demonstration. These homes are fictional and not for sale.
          </p>
        </section>
      </div>

      <button
        type="button"
        onClick={() => setMobileMap((v) => !v)}
        className="fixed bottom-5 left-1/2 z-20 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900 px-5 font-semibold text-white shadow-lg lg:hidden"
      >
        {mobileMap ? <List aria-hidden size={18} /> : <MapIcon aria-hidden size={18} />}
        {mobileMap ? "List" : "Map"}
      </button>
    </div>
  );
}

function SearchCard({
  result,
  priority,
  highlighted,
  onHover,
  cardRef,
}: {
  result: SearchResult;
  priority: boolean;
  highlighted: boolean;
  onHover: (key: string | null) => void;
  cardRef: (el: HTMLLIElement | null) => void;
}) {
  const { listing, publicTotals, privateTotals, buzz } = result;
  const likes = publicTotals.likes + privateTotals.likes;
  const likedFor = topAspects(result.aspects.liked, 3);
  const comments = publicTotals.comments + privateTotals.comments;
  const active = activeLabel(buzz.lastActivityAt);
  return (
    <li
      ref={cardRef}
      onMouseEnter={() => onHover(listing.ListingKey)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white ring-1 transition-shadow",
        highlighted ? "shadow-lg ring-2 ring-brand" : "ring-stone-200 hover:shadow-md",
      )}
    >
      <Link href={`/homes/${encodeURIComponent(listing.ListingKey)}`} scroll={false} className="block">
        <div className="relative aspect-[4/3] bg-stone-200">
          {listing.Media[0] && (
            <Image
              src={listing.Media[0].MediaURL}
              alt=""
              fill
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
              className="object-cover"
            />
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {isSampleListing(listing) && (
              <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">Sample</span>
            )}
            {active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-stone-900 shadow">
                <Flame aria-hidden size={13} className="text-orange-700" />
                {active}
              </span>
            )}
          </div>
        </div>
        <div className="p-4">
          <p className="font-display text-2xl font-semibold tabular-nums">{formatPrice(listing.ListPrice)}</p>
          <p className="text-sm text-stone-800">
            <b>{listing.BedroomsTotal}</b> bd · <b>{listing.BathroomsTotalInteger}</b> ba ·{" "}
            <b>{listing.LivingArea.toLocaleString("en-US")}</b> sq ft
            {listing.PropertySubType === "Townhouse" && " · Townhouse"}
          </p>
          <p className="truncate text-sm text-stone-700">
            {listing.UnparsedAddress}, {listing.City}, {listing.StateOrProvince} {listing.PostalCode}
          </p>
          <p className="mt-1 truncate text-xs text-stone-600">
            {listing.ListOfficeName ?? ""}
          </p>
          {likedFor.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-xs font-semibold text-emerald-900">
              <span className="sr-only">People like the</span>
              {likedFor.map(([aspect]) => (
                <span key={aspect} className="rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200">
                  {aspectLabel(aspect)}
                </span>
              ))}
            </p>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-200 pt-3 text-sm text-stone-700 [&>span]:whitespace-nowrap">
            {likes + comments + buzz.views === 0 ? (
              <span>Be the first to react</span>
            ) : (
              <>
                {likes > 0 && (
                  <span className="flex items-center gap-1.5">
                    <ThumbsUp aria-hidden size={14} className="text-emerald-700" />
                    {likes} {likes === 1 ? "like" : "likes"}
                  </span>
                )}
                {comments > 0 && (
                  <span className="flex items-center gap-1.5">
                    <MessageCircle aria-hidden size={14} />
                    {comments} {comments === 1 ? "comment" : "comments"}
                  </span>
                )}
                {buzz.views > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Eye aria-hidden size={14} />
                    {buzz.views} {buzz.views === 1 ? "view" : "views"}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
      </Link>
      <LikeButton
        listingKey={listing.ListingKey}
        mine={result.mine}
        label={listing.UnparsedAddress}
        className="absolute right-3 top-3"
      />
    </li>
  );
}
