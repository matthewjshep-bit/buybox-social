"use client";

import { Check, Plus, Search, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { addHomesToShare, createShare } from "../actions";

const MAX_LISTINGS = 3;
const MAX_PEOPLE = 6;

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function ShareBuilder({
  results,
  initialQuery,
  addTo,
  start,
}: {
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
            "flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 text-left ring-1 transition disabled:opacity-50",
            selected ? "ring-2 ring-brand" : "ring-stone-200 hover:ring-stone-400",
          )}
        >
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-stone-200">
            <Image src={listing.Media[0]?.MediaURL} alt="" fill sizes="80px" className="object-cover" />
            {selected && (
              <span className="absolute inset-0 flex items-center justify-center bg-brand/70 text-white">
                <Check aria-hidden size={28} />
              </span>
            )}
          </div>
          <span className="min-w-0">
            <span className="block font-semibold">{formatPrice(listing.ListPrice)}</span>
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
    <div className="mt-5 pb-4">
      {searching ? (
        <>
          <label htmlFor="search" className="sr-only">
            Search by address, city, ZIP or MLS number
          </label>
          <div className="relative">
            <Search aria-hidden size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-600" />
            <input
              id="search"
              type="search"
              value={query}
              // Asked for from "Add another home", so the cursor goes straight there.
              autoFocus={Boolean(start)}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Address, city, ZIP or MLS number"
              className={cn(inputClass, "pl-11")}
            />
          </div>

          {results.length === 0 ? (
            <p className="mt-6 text-center text-stone-700">No homes match that search.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">{results.map(card)}</ul>
          )}
        </>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">{start && card(start)}</ul>
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand"
          >
            <Plus aria-hidden size={16} /> Add another home
          </button>
        </>
      )}

      <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        {!addTo && (
          <>
            <fieldset>
              <legend className="text-sm font-medium">Who&apos;s it for?</legend>
              <p className="text-sm text-stone-600">
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
                      className={inputClass}
                    />
                    {people.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove person ${i + 1}`}
                        onClick={() => setPeople((current) => current.filter((_, j) => j !== i))}
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100"
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
                  className="mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand"
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
                className={cn(inputClass, "mt-1 resize-y")}
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
          className="min-h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-50"
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
  );
}
