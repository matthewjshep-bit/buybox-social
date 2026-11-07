"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
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
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  // Kept here rather than in the URL, so picks survive a new search.
  const [picked, setPicked] = useState<Listing[]>(start ? [start] : []);
  const [searching, setSearching] = useState(!start);
  // Everyone the homes are for. Each gets their own link.
  const [people, setPeople] = useState([""]);
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

  const onSearch = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (addTo) params.set("share", addTo.shareId);
      if (start) params.set("home", start.ListingKey);
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
        : await createShare({ listingKeys, people, note });
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

  return (
    <>
      <h1 className="font-display text-3xl">
        {start ? (picked.length > 1 ? "Send these homes" : "Send this home") : heading}
      </h1>
      <p className="mt-1 text-stone-700">{intro}</p>
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

            {shown.length > 0 && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{shown.map(card)}</ul>}
            {results.length === 0 && <p className="mt-6 text-center text-stone-700">No homes match that search.</p>}
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

        <div className={cn(cardClass, "mt-6 flex flex-col gap-4 p-4")}>
          {!addTo && (
            <>
              <fieldset>
                <legend className="text-sm font-medium">Who&apos;s it for?</legend>
                <p className="text-sm text-muted">
                  Each person gets their own link, so you can see what each of them likes.
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {people.map((person, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        aria-label={`Person ${i + 1}'s first name`}
                        maxLength={40}
                        value={person}
                        autoComplete="off"
                        placeholder={i === 0 ? "First name" : "Another person's first name"}
                        onChange={(event) =>
                          setPeople((current) => current.map((p, j) => (j === i ? event.target.value : p)))
                        }
                        className={field()}
                      />
                      {people.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove person ${i + 1}`}
                          onClick={() => setPeople((current) => current.filter((_, j) => j !== i))}
                          className={cn(button({ kind: "ghost", icon: true }), "shrink-0 text-muted")}
                        >
                          <X aria-hidden size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {people.length < MAX_PEOPLE && (
                  <button
                    type="button"
                    onClick={() => setPeople((current) => [...current, ""])}
                    className={cn(button({ kind: "ghost", flush: true }), "mt-2 text-brand")}
                  >
                    <Plus aria-hidden size={16} /> Add another person
                  </button>
                )}
              </fieldset>
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
            onClick={submit}
            disabled={picked.length === 0 || pending}
            className={button({ kind: "primary", size: "lg", block: true })}
          >
            {pending
              ? "Creating…"
              : picked.length === 0
                ? "Pick at least 1 home"
                : addTo
                  ? `Add ${picked.length} ${picked.length === 1 ? "home" : "homes"} to ${addTo.clientName ? `${addTo.clientName}'s` : "their"} link`
                  : `Create link for ${picked.length} ${picked.length === 1 ? "home" : "homes"}`}
          </button>
        </div>
      </div>
    </>
  );
}
