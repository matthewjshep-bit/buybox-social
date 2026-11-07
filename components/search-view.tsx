"use client";

import { Heart, Home, Map as MapIcon, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import type { ThreadActions } from "@/components/listing-thread";
import type { MapHome } from "@/components/listing-map";
import { SendPill, sendHomeFrom, useQuickSend } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { HomeThumb } from "@/components/ui";
import type { FeedPost } from "@/lib/feed";
import { cn, formatPrice } from "@/lib/format";
import { filtersQuery, HOME_TYPES, SORTS, type SearchFilters } from "@/lib/search-options";
import { field } from "@/lib/ui";

// The map draws with WebGL in the browser, so it never renders on the server.
const ListingMap = dynamic(() => import("@/components/listing-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-stone-200" />,
});

const MIN_PRICES = [400_000, 600_000, 800_000, 1_000_000, 1_500_000, 2_000_000];
const MAX_PRICES = [600_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];

// The filters: choices in a row of round-ended boxes, beside the search.
const pill = cn(field({ pill: true, small: true }), "shrink-0 font-medium");

// "3 bd · 2 ba · 2,120 sq ft"
const factsOf = (listing: FeedPost["listing"]) =>
  [
    Number.isFinite(listing.BedroomsTotal) && `${listing.BedroomsTotal} bd`,
    Number.isFinite(listing.BathroomsTotalInteger) && `${listing.BathroomsTotalInteger} ba`,
    listing.LivingArea > 0 && `${listing.LivingArea.toLocaleString("en-US")} sq ft`,
  ]
    .filter(Boolean)
    .join(" · ");

// A row of filters that scrolls sideways on a phone fades out at whichever
// edge has more past it, so it's clear there's more to see.
function FilterRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((was) => (was.start === start && was.end === end ? was : { start, end }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      resized.disconnect();
    };
  }, []);
  const fade = `linear-gradient(to right, ${more.start ? "transparent, black 2.5rem" : "black"}, ${more.end ? "black calc(100% - 2.5rem), transparent" : "black"})`;
  const faded = more.start || more.end;
  return (
    <div
      ref={row}
      // A filter reached with the keyboard slides fully into view, clear of the fade.
      onFocus={(event) => {
        const el = row.current;
        if (!el || el.scrollWidth <= el.clientWidth) return;
        const box = el.getBoundingClientRect();
        const at = event.target.getBoundingClientRect();
        const clear = 44;
        if (at.left < box.left + clear) el.scrollBy({ left: at.left - box.left - clear });
        else if (at.right > box.right - clear) el.scrollBy({ left: at.right - box.right + clear });
      }}
      data-filter-row
      data-fade={[more.start && "start", more.end && "end"].filter(Boolean).join(" ") || undefined}
      style={faded ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
      // Room above and below, so a focused filter's ring isn't cut off.
      className="-mx-4 -my-1 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:my-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0"
    >
      {children}
    </div>
  );
}

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
  sender,
}: {
  filters: SearchFilters;
  count: number;
  posts: FeedPost[];
  // Opened from a home's address: start on it.
  startKey: string | null;
  actions: ThreadActions;
  myName: string | null;
  prompt: string;
  // A signed-in agent, who can send the home showing to a client.
  sender: { profileComplete: boolean } | null;
}) {
  const router = useRouter();
  const pane = useRef<HTMLElement>(null);
  // An agent can send the home showing to a client. Its sheets rise over the pane.
  const quick = useQuickSend({ profileComplete: Boolean(sender?.profileComplete), anchor: pane });
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

  // The list keeps the home showing in view as the homes scroll by.
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const item = activeKey ? list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`) : null;
    if (!item || !list.current?.offsetParent) return;
    const box = list.current.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    if (at.top < box.top || at.bottom > box.bottom) list.current.scrollBy({ top: at.top - box.top - box.height / 3 });
  }, [activeKey]);

  const count = `${total} ${total === 1 ? "home" : "homes"}`;
  // Only a home that's still for sale.
  const sendable = sender
    ? posts.find((post) => post.listing.ListingKey === activeKey && post.listing.StandardStatus === "Active")
    : undefined;
  const sending = sendable ? sendHomeFrom(sendable.listing) : null;

  return (
    // Phones: the filters, what was found, then the homes or the map. Wide
    // screens: the filters across the top; what was found over the map, one
    // home beside it. Wider still, a list of the homes between the two.
    <div className="flex h-[calc(100dvh-3.5rem-1px)] flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_min(46rem,50%)] lg:grid-rows-[auto_auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_18rem_min(44rem,44%)] xl:grid-rows-[auto_minmax(0,1fr)]">
      <form
        role="search"
        aria-label="Filter homes"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() });
        }}
        className="flex flex-wrap items-center gap-2 bg-white px-4 pb-1 pt-3 lg:col-span-2 lg:border-b lg:border-stone-200 lg:pb-3 xl:col-span-3"
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
            className={cn(field({ pill: true }), "w-full pr-11")}
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-stone-700"
          >
            <Search aria-hidden size={18} />
          </button>
        </div>
        {/* One swipeable row on phones; wraps on wider screens. */}
        <FilterRow>
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
          <label className={cn(pill, "flex cursor-pointer items-center gap-2 has-[:checked]:border-rose-600 has-[:checked]:bg-rose-50")}>
            <input
              type="checkbox"
              checked={shown.liked}
              onChange={(event) => update({ liked: event.target.checked })}
              className="size-4 accent-rose-600"
            />
            <Heart aria-hidden size={15} className="text-rose-600" />
            Liked by buyers
          </label>
        </FilterRow>
      </form>

      {/* What was found, on one line on a phone and over the map. Wider
          screens: a list of the homes beside the map, each bringing its home
          up and lighting its pin. */}
      <div className="flex flex-col border-b border-stone-200 bg-white lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:min-h-0 xl:border-b-0 xl:border-l">
        <div className="flex items-center justify-between gap-x-3 px-4 lg:justify-start xl:flex-wrap xl:justify-between xl:pt-2">
          <h1 className="text-sm font-semibold max-lg:sr-only lg:min-w-0 lg:truncate xl:w-full xl:pt-1">
            {filters.q ? `Homes matching “${filters.q}”` : "Washington homes for sale"}
          </h1>
          <p className="shrink-0 text-sm font-semibold text-ink lg:font-normal lg:text-muted" aria-live="polite">
            {count}
          </p>
          <label className={cn("flex min-w-0 items-center gap-1.5 text-sm lg:ml-auto xl:ml-0", posts.length === 0 && "invisible")}>
            <span className="shrink-0 text-stone-700">Sort:</span>
            <select
              value={shown.sort}
              onChange={(event) => update({ sort: event.target.value })}
              className="min-h-11 min-w-0 rounded-full bg-transparent px-1 font-semibold text-brand"
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {posts.length > 0 ? (
          <ol
            ref={list}
            aria-label="Homes found"
            className="hidden min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-stone-200 xl:block"
          >
            {posts.map(({ listing }) => {
              const key = listing.ListingKey;
              const query = filtersQuery(filters);
              // The whole card is the link, but only the address is its
              // words, so it's called what it says: "Show 96 Fernhollow Ln".
              return (
                <li
                  key={key}
                  data-key={key}
                  className="relative flex items-center gap-3 border-b border-stone-100 px-4 py-2.5 hover:bg-stone-50 has-[a:focus-visible]:bg-stone-50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-brand has-[a[aria-current=true]]:bg-stone-100 has-[a[aria-current=true]]:shadow-[inset_3px_0_0_var(--brand)]"
                >
                  <HomeThumb src={listing.Media[0]?.MediaURL} sizes="72px" className="h-14 w-18" />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span id={`result-${key}`} className="block">
                      <span className="block font-display text-lg text-ink">{formatPrice(listing.ListPrice)}</span>
                      <span className="block truncate text-meta text-stone-700">{factsOf(listing)}</span>
                    </span>
                    <span className="block truncate text-meta text-muted">
                      <a
                        href={`/search?${query ? `${query}&` : ""}home=${encodeURIComponent(key)}`}
                        aria-label={`Show ${listing.UnparsedAddress}`}
                        aria-describedby={`result-${key} result-${key}-city`}
                        aria-current={key === activeKey ? "true" : undefined}
                        onClick={(event) => {
                          // A new tab still opens the link; here, it brings the home up.
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                          event.preventDefault();
                          pick(key);
                        }}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        // The card shows focus around itself, not around these words.
                        className="outline-none! after:absolute after:inset-0"
                      >
                        {listing.UnparsedAddress}
                      </a>
                      <span id={`result-${key}-city`}>, {listing.City}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          // Beside the map, the way out is right under the count.
          <div className="hidden border-t border-stone-200 px-4 py-6 xl:block">
            <p className="font-semibold">No homes match those filters.</p>
            <Link href="/search" className="mt-2 inline-block font-semibold text-brand underline">
              Clear all filters
            </Link>
          </div>
        )}
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1 lg:col-start-1 lg:row-start-3 xl:row-start-2",
          mobileMap ? "block" : "hidden lg:block",
        )}
      >
        <ListingMap
          homes={homes}
          activeKey={activeKey}
          hoveredKey={hoveredKey}
          onHover={setHoveredKey}
          onSelect={pick}
        />
      </div>

      <section
        ref={pane}
        aria-label="Homes"
        aria-busy={pending}
        className={cn(
          "relative min-h-0 bg-stone-950 transition-opacity lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:block xl:col-start-3 xl:row-span-1",
          mobileMap ? "hidden" : "block flex-1",
          pending && "opacity-60",
        )}
      >
        {/* Wide screens: over the top of the photo, clear of the words at the bottom. */}
        {sending && (
          <SendPill home={sending} quick={quick} className="absolute left-3 top-3 z-30 hidden lg:flex" />
        )}
        {posts.length === 0 ? (
          // Said once: beside the map on the widest screens, here otherwise.
          <div className="flex h-full flex-col items-center justify-center bg-surface p-8 text-center">
            <div className="xl:hidden">
              <p className="font-semibold">No homes match those filters.</p>
              <Link href="/search" className="mt-2 inline-block font-semibold text-brand underline">
                Clear all filters
              </Link>
            </div>
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

      {/* Phones: along the bottom, in the space the home's words leave for
          these buttons, so they never cover the words on a short screen. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center gap-2 px-4 lg:hidden">
        {sending && !mobileMap && <SendPill home={sending} quick={quick} className="pointer-events-auto" />}
        <button
          type="button"
          onClick={() => setMobileMap((v) => !v)}
          className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-white px-5 font-semibold text-stone-900 shadow-lg ring-1 ring-stone-200"
        >
          {mobileMap ? <Home aria-hidden size={18} /> : <MapIcon aria-hidden size={18} />}
          {mobileMap ? "Homes" : "Map"}
        </button>
      </div>
      {sender && quick.ui}
    </div>
  );
}
