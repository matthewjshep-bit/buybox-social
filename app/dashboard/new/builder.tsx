"use client";

import { ArrowDown, Check, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PeoplePicker, typed, type Chosen } from "@/components/people-picker";
import { HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { peopleTitle } from "@/lib/people-picker";
import { button, card as cardClass, field } from "@/lib/ui";
import { addHomesToShare, createShare } from "../actions";

const MAX_LISTINGS = 3;
const MAX_PEOPLE = 6;

export function ShareBuilder({
  heading,
  intro,
  results,
  initialQuery,
  addTo,
  start,
  whoFirst = false,
}: {
  heading: string;
  intro: string;
  results: Listing[];
  initialQuery: string;
  // Adding to an existing client's link rather than starting a new one.
  addTo?: { shareId: string; clientName: string };
  // A home already picked (sent from the home itself): just who it's for, and
  // a note, until they ask for another home.
  start?: Listing;
  // Who it's for comes first, ready to type ("Send homes to…").
  whoFirst?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  // Kept here rather than in the URL, so picks survive a new search.
  const [picked, setPicked] = useState<Listing[]>(start ? [start] : []);
  const [searching, setSearching] = useState(!start);
  // Everyone the homes are for. Each gets their own link. Whatever's typed
  // in and not yet added counts too, so nobody is lost to a missed Enter.
  const [people, setPeople] = useState<Chosen[]>([]);
  const [typing, setTyping] = useState("");
  const everyone = typing.trim() && !typing.includes("@") ? [...people, typed(typing)] : people;
  const title = peopleTitle(everyone.map((person) => person.name));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Sent from a home: what's picked so far leads each set of results, so the
  // home it started with stays in view. Fixed per search, so a card doesn't
  // jump away from the finger that picked it.
  const [order, setOrder] = useState({ results, first: picked });
  if (order.results !== results) setOrder({ results, first: picked });
  const shown = start
    ? [
        ...order.first,
        ...results.filter((listing) => !order.first.some((first) => first.ListingKey === listing.ListingKey)),
      ]
    : results;

  useEffect(() => () => clearTimeout(debounce.current), []);

  // Who it's for and the button that makes the link: on a phone, often far
  // below the homes, so a bar at the foot of the screen leads there until
  // it's in view.
  const details = useRef<HTMLDivElement>(null);
  const [detailsInView, setDetailsInView] = useState(false);
  useEffect(() => {
    const el = details.current;
    if (!el) return;
    const watch = new IntersectionObserver(([entry]) => setDetailsInView(entry.isIntersecting));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const toDetails = () => {
    const el = details.current;
    if (!el) return;
    // The first thing to fill in, or the button itself when adding homes.
    el.querySelector<HTMLElement>("[role=combobox], textarea, button[data-make-link]")?.focus({ preventScroll: true });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  };

  const onSearch = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (addTo) params.set("share", addTo.shareId);
      if (start) params.set("home", start.ListingKey);
      if (whoFirst) params.set("focus", "to");
      if (value.trim()) params.set("q", value.trim());
      const search = params.toString();
      router.replace(`/dashboard/new${search ? `?${search}` : ""}`, { scroll: false });
    }, 250);
  };

  const toggle = (listing: Listing) => {
    setPicked((current) =>
      current.some((l) => l.ListingKey === listing.ListingKey)
        ? current.filter((l) => l.ListingKey !== listing.ListingKey)
        : current.length < MAX_LISTINGS
          ? [...current, listing]
          : current,
    );
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const listingKeys = picked.map((l) => l.ListingKey);
      const result = addTo
        ? await addHomesToShare(addTo.shareId, listingKeys)
        : await createShare({
            listingKeys,
            people: [...people, ...(typing.trim() ? [typed(typing)] : [])].map((person) => person.pick),
            note,
          });
      if (result?.error) setError(result.error);
    });
  };

  const card = (listing: Listing) => {
    const selected = picked.some((l) => l.ListingKey === listing.ListingKey);
    const disabled = !selected && picked.length >= MAX_LISTINGS;
    return (
      <li key={listing.ListingKey}>
        <button
          type="button"
          aria-pressed={selected}
          disabled={disabled}
          onClick={() => toggle(listing)}
          className={cn(
            cardClass,
            "flex w-full items-center gap-3 p-2.5 text-left transition disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-brand hover:not-aria-pressed:ring-stone-400",
          )}
        >
          <HomeThumb src={listing.Media[0]?.MediaURL} sizes="80px" className="size-20">
            {selected && (
              <span className="absolute inset-0 flex items-center justify-center bg-brand/70 text-white">
                <Check aria-hidden size={28} />
              </span>
            )}
          </HomeThumb>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-snug">{formatPrice(listing.ListPrice)}</span>
            <span className="block truncate text-sm">{listing.UnparsedAddress}</span>
            <span className="block truncate text-sm text-stone-700">
              {listing.City} · {listing.BedroomsTotal} bd · {listing.BathroomsTotalInteger} ba
            </span>
          </span>
        </button>
      </li>
    );
  };

  // Who it's for, and what the link will be called: their names, as they're added.
  const who = (
    <div>
      <PeoplePicker
        label="Who's it for?"
        hint="Each person gets their own link, so you can see what each of them likes."
        chosen={people}
        onChange={setPeople}
        onTextChange={setTyping}
        max={MAX_PEOPLE}
        autoFocus={whoFirst}
        notify
      />
      <p className="mt-2 text-sm text-stone-700" aria-live="polite">
        {title ? (
          <>
            This link will be called <b className="font-semibold text-ink">{title}</b>.
          </>
        ) : (
          "Nobody added: anyone with the link can join, and it's named for whoever joins first."
        )}
      </p>
    </div>
  );

  return (
    <>
      <h1 className="font-display text-3xl">
        {start ? (picked.length > 1 ? "Send these homes" : "Send this home") : heading}
      </h1>
      <p className="mt-1 text-stone-700">{intro}</p>
      {whoFirst && !addTo && <div className={cn(cardClass, "mt-5 p-4")}>{who}</div>}
      <div className="mt-5 pb-4">
        {searching ? (
          <>
            <label htmlFor="search" className="sr-only">
              Search by address, city, ZIP or MLS number
            </label>
            <div className="relative">
              <Search aria-hidden size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                id="search"
                type="search"
                value={query}
                // Asked for from "Add another home", so the cursor goes straight there.
                autoFocus={Boolean(start)}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Address, city, ZIP or MLS number"
                className={cn(field(), "pl-11")}
              />
            </div>

            {/* What's picked so far, whatever the search shows, each one able
                to come off again without clearing the search. One row on a
                phone, sliding sideways, so the homes stay near the top (and
                what's said only to screen readers slides with it, rather
                than widening the page). */}
            {picked.length > 0 && (
              <ul
                aria-label="Picked homes"
                className="relative -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
              >
                {picked.map((listing) => (
                  <li
                    key={listing.ListingKey}
                    className="flex min-w-0 max-w-64 shrink-0 items-center gap-2 rounded-xl bg-white pl-1.5 ring-2 ring-brand"
                  >
                    <HomeThumb src={listing.Media[0]?.MediaURL} sizes="32px" className="size-8" />
                    <span className="min-w-0 truncate text-sm font-medium">{listing.UnparsedAddress}</span>
                    <button
                      type="button"
                      onClick={() => toggle(listing)}
                      className={cn(button({ kind: "ghost", icon: true }), "shrink-0 text-stone-600")}
                    >
                      <X aria-hidden size={16} />
                      <span className="sr-only">Remove {listing.UnparsedAddress}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {shown.length > 0 && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{shown.map(card)}</ul>}
            {results.length === 0 && <p className="mt-6 text-center text-stone-700">No homes match that search.</p>}

            {/* Phones: how many are picked, and the way on, at the foot of the
                screen until who it's for is in view. */}
            {picked.length > 0 && !detailsInView && (
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgb(0_0_0/0.06)] sm:hidden">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {picked.length} of {MAX_LISTINGS} picked
                  </p>
                  <button type="button" onClick={toDetails} className={button({ kind: "primary" })}>
                    Next <ArrowDown aria-hidden size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">{start && card(start)}</ul>
            <button
              type="button"
              onClick={() => setSearching(true)}
              className={cn(button({ kind: "ghost", flush: true }), "mt-2 text-brand")}
            >
              <Plus aria-hidden size={16} /> Add another home
            </button>
          </>
        )}

        <div ref={details} className={cn(cardClass, "mt-6 flex scroll-mt-4 flex-col gap-4 p-4")}>
          {!addTo && (
            <>
              {!whoFirst && who}
              <div>
                <label htmlFor="note" className="text-sm font-medium">
                  Personal note (optional)
                </label>
                <textarea
                  id="note"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="This one has the yard you mentioned."
                  className={cn(field({ lines: true }), "mt-1")}
                />
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            data-make-link
            onClick={submit}
            disabled={picked.length === 0 || pending}
            className={button({ kind: "primary", size: "lg", block: true })}
          >
            {pending
              ? "Creating…"
              : picked.length === 0
                ? "Pick at least 1 home"
                : addTo
                  ? `Add ${picked.length} ${picked.length === 1 ? "home" : "homes"} to ${addTo.clientName ? `${addTo.clientName}'s` : "the"} link`
                  : `Create link for ${picked.length} ${picked.length === 1 ? "home" : "homes"}`}
          </button>
          {!addTo && (
            <p className="-mt-1 text-center text-sm text-muted">
              Next, add your take: tap anything on {picked.length > 1 ? "each home" : "the home"} to like it or leave a note.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
