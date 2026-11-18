"use client";

import { ArrowLeft, ArrowRight, Check, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PeoplePicker, typed, type Chosen } from "@/components/people-picker";
import { HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { addressFromLink, looksLikeLink } from "@/lib/listing-link";
import { peopleTitle } from "@/lib/people-picker";
import { button, card as cardClass, field } from "@/lib/ui";
import { addHomesToShare, createShare } from "../actions";

const MAX_LISTINGS = 3;
const MAX_PEOPLE = 6;

// Sending homes, one thing at a time: which home (found by its address or
// MLS number as it's typed, or read out of a link to it on another site),
// then who it's for (or nobody: a link anyone can use). That makes the link,
// and the third step is on the link itself: the agent goes through the homes
// liking and saying what they think, for their client to read (or skips it).
// Each step has one thing to do and one way on; Back goes back. The link to
// copy is on the page after.
type Step = "home" | "who";
// (The third, their thoughts, is on the link: app/s/[token].)
const STEPS = 3;

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
  const [step, setStep] = useState<Step>("home");
  const heading_ = useRef<HTMLHeadingElement>(null);
  // What a pasted link was read as: its street, or "none" when it had none.
  const [fromLink, setFromLink] = useState<string | null>(null);
  // Kept here rather than in the URL, so picks survive a new search.
  const [picked, setPicked] = useState<Listing[]>(start ? [start] : []);
  const [searching, setSearching] = useState(!start);
  // Everyone the homes are for. Each gets their own link. Whatever's typed
  // in and not yet added counts too, so nobody is lost to a missed Enter.
  const [people, setPeople] = useState<Chosen[]>([]);
  const [typing, setTyping] = useState("");
  const everyone = typing.trim() && !typing.includes("@") ? [...people, typed(typing)] : people;
  const title = peopleTitle(everyone.map((person) => person.name));
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
    // A link to the home on another site is searched by the street in it.
    const street = looksLikeLink(value) ? addressFromLink(value) : null;
    setFromLink(looksLikeLink(value) ? (street ?? "none") : null);
    const asked = looksLikeLink(value) ? (street ?? "") : value;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (addTo) params.set("share", addTo.shareId);
      if (start) params.set("home", start.ListingKey);
      if (asked.trim()) params.set("q", asked.trim());
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
            // (What they think goes on the homes themselves, next; a welcome note can be added on the link's page.)
            note: "",
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
        hint="Each person gets their own link."
        chosen={people}
        onChange={setPeople}
        onTextChange={setTyping}
        max={MAX_PEOPLE}
        autoFocus
        notify
      />
      <p className="mt-2 text-sm text-stone-700" aria-live="polite">
        {title ? (
          <>
            This link will be called <b className="font-semibold text-ink">{title}</b>.
          </>
        ) : (
          "Leave it empty for a link anyone can use."
        )}
      </p>
    </div>
  );

  // The homes picked so far, small, each able to come off again.
  const tray = picked.length > 0 && (
    <ul
      aria-label="Picked homes"
      className="relative -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
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
  );

  // Adding to a link there already: just the homes, and one button.
  const steps: Step[] = addTo ? ["home"] : ["home", "who"];
  const at = steps.indexOf(step);
  const go = (to: Step) => {
    setError(null);
    setStep(to);
    // Who it's for puts the cursor in its own field. Back at the homes, the
    // keyboard goes to the heading, so it isn't left on a button that's gone.
    if (to === "home") requestAnimationFrame(() => heading_.current?.focus());
  };
  const titles: Record<Step, string> = {
    home: start ? (picked.length > 1 ? "Send these homes" : "Send this home") : heading,
    who: "Who's it for?",
  };

  return (
    <>
      {/* Where they are: one thing at a time, and the way back. */}
      {steps.length > 1 && (
        <div className="mb-3 flex items-center gap-3">
          {at > 0 ? (
            <button
              type="button"
              onClick={() => go(steps[at - 1])}
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium hover:bg-black/5"
            >
              <ArrowLeft aria-hidden size={16} /> Back
            </button>
          ) : (
            <span className="min-h-11" />
          )}
          <p className="ml-auto text-sm font-semibold text-stone-600">
            Step {at + 1} of {STEPS}
          </p>
          <ol aria-hidden className="flex gap-1.5">
            {Array.from({ length: STEPS }, (_, i) => (
              <li key={i} className={cn("h-1.5 w-8 rounded-full", i <= at ? "bg-brand" : "bg-stone-300")} />
            ))}
          </ol>
        </div>
      )}
      <h1 ref={heading_} tabIndex={-1} className="font-display text-3xl outline-none">
        {titles[step]}
      </h1>

      {step === "home" && (
        <div className="mt-4 pb-4">
          {intro && <p className="-mt-2 mb-3 text-stone-700">{intro}</p>}
          {searching ? (
            <>
              <label htmlFor="search" className="sr-only">
                Address, MLS number, or a link to the home
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
                  placeholder="Address, MLS #, or paste a link"
                  className={cn(field(), "pl-11")}
                />
              </div>
              {/* A link from another site: what was read out of it. */}
              {fromLink && (
                <p role="status" className="mt-2 text-sm text-stone-700">
                  {fromLink === "none" ? (
                    "We couldn't read an address from that link. Type the address instead."
                  ) : (
                    <>
                      From your link: <b className="font-semibold text-ink">{fromLink}</b>
                    </>
                  )}
                </p>
              )}
              {tray && <div className="mt-3">{tray}</div>}
              {shown.length > 0 && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{shown.map(card)}</ul>}
              {results.length === 0 && <p className="mt-6 text-center text-stone-700">No homes match that.</p>}
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

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}
          {/* The way on: at the foot of the screen, so it's always in reach
              however long the list of homes is. */}
          <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t border-stone-200 bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-700">
                {picked.length} of {MAX_LISTINGS} picked
              </p>
              <button
                type="button"
                data-make-link
                onClick={addTo ? submit : () => go("who")}
                disabled={picked.length === 0 || pending}
                className={button({ kind: "primary", size: "lg" })}
              >
                {picked.length === 0
                  ? "Pick a home"
                  : addTo
                    ? pending
                      ? "Adding…"
                      : `Add ${picked.length} ${picked.length === 1 ? "home" : "homes"} to ${addTo.clientName ? `${addTo.clientName}'s` : "the"} link`
                    : "Next"}
                {picked.length > 0 && !addTo && <ArrowRight aria-hidden size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "who" && (
        <div className={cn(cardClass, "mt-4 flex flex-col gap-4 p-4")}>
          {who}
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
            {pending ? "Creating…" : "Next"}
            {!pending && <ArrowRight aria-hidden size={18} />}
          </button>
        </div>
      )}
    </>
  );
}
