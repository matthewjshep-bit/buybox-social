"use client";

import { ArrowLeft, ArrowRight, Check, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { PeoplePicker, typed, type Chosen } from "@/components/people-picker";
import { HomeThumb } from "@/components/ui";
import { cn, formatPrice, placeWords } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { addressFromLink, looksLikeLink } from "@/lib/listing-link";
import { peopleTitle } from "@/lib/people-picker";
import { backLink, button, card as cardClass, field, groupLabel, pageTitle } from "@/lib/ui";
import { SEND_HOMES_MOST } from "@/lib/send-limits";
import { addHomesToShare, createShare, suggestHomes } from "../actions";

// (As many as they like: the guard is only against a tool gone wrong.)
const MAX_LISTINGS = SEND_HOMES_MOST;
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
  groups = [],
  peer = false,
  addTo,
  start,
  aside,
}: {
  heading: string;
  intro: string;
  results: Listing[];
  // With nothing typed: not every home there is, just theirs (their listings,
  // and the homes they've liked, commented on or sent before), under a title each.
  groups?: { title: string; homes: Listing[] }[];
  // Anyone who isn't an agent, sending homes to a friend: the same steps.
  peer?: boolean;
  // Adding to an existing client's link rather than starting a new one.
  addTo?: { shareId: string; clientName: string };
  // A home already picked (sent from the home itself): just who it's for, and
  // a note, until they ask for another home.
  start?: Listing;
  // Something quiet at the top of the first step, where Back is on the next:
  // the way to the homes they've sent before.
  aside?: ReactNode;
}) {
  const [query, setQuery] = useState("");
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


  // The homes that match what's being typed, in a list right under the box:
  // a tap (or the arrow keys and Enter) picks one. Asked for a moment after
  // each letter; only the newest answer counts.
  const [suggested, setSuggested] = useState<{ query: string; homes: Listing[] } | null>(null);
  const [activeOption, setActiveOption] = useState(0);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suggestAsked = useRef(0);
  useEffect(() => () => clearTimeout(suggestTimer.current), []);
  const suggest = (text: string) => {
    clearTimeout(suggestTimer.current);
    const n = ++suggestAsked.current;
    setActiveOption(0);
    if (text.trim().length < 2) return setSuggested(null);
    suggestTimer.current = setTimeout(async () => {
      const homes = await suggestHomes(text.trim(), addTo?.shareId).catch((): Listing[] => []);
      if (n === suggestAsked.current) setSuggested({ query: text.trim(), homes });
    }, 120);
  };
  // What the list offers: not what's picked already.
  const options = (suggested?.homes ?? []).filter((home) => !picked.some((l) => l.ListingKey === home.ListingKey));
  // While something's typed, the matches take the place of the homes below.
  const typing_ = query.trim().length >= 2;
  const listOpen = typing_ && suggested !== null;
  const full = picked.length >= MAX_LISTINGS;
  const choose = (listing: Listing) => {
    if (full) return;
    setPicked((current) => (current.some((l) => l.ListingKey === listing.ListingKey) ? current : [...current, listing]));
    // On to the next one: the box empties, and the homes below are all of them again.
    onSearch("");
    setSuggested(null);
  };

  const onSearch = (value: string) => {
    setQuery(value);
    // A link to the home on another site is searched by the street in it.
    const street = looksLikeLink(value) ? addressFromLink(value) : null;
    setFromLink(looksLikeLink(value) ? (street ?? "none") : null);
    const asked = looksLikeLink(value) ? (street ?? "") : value;
    suggest(asked);
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
        peer={peer}
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
              className={backLink}
            >
              <ArrowLeft aria-hidden size={18} /> Back
            </button>
          ) : (
            aside || <span className="min-h-11" />
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
      <h1 ref={heading_} tabIndex={-1} className={cn(pageTitle, "outline-none")}>
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
                <Search aria-hidden size={18} className="absolute left-4 top-6 -translate-y-1/2 text-muted" />
                <input
                  id="search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={listOpen}
                  aria-controls="home-suggestions"
                  aria-activedescendant={listOpen && options[activeOption] ? `home-option-${activeOption}` : undefined}
                  autoComplete="off"
                  value={query}
                  // Asked for from "Add another home", so the cursor goes straight there.
                  autoFocus={Boolean(start)}
                  onChange={(event) => onSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (!listOpen) return;
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const step = event.key === "ArrowDown" ? 1 : -1;
                      setActiveOption((now) => (options.length ? (now + step + options.length) % options.length : 0));
                    } else if (event.key === "Enter" && options[activeOption]) {
                      event.preventDefault();
                      choose(options[activeOption]);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setSuggested(null);
                    }
                  }}
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
              {/* The homes that match, right under the box, in the page (so
                  nothing else is ever under a tap meant for one of them). */}
              {listOpen && (
                <ul
                  id="home-suggestions"
                  role="listbox"
                  aria-label="Homes that match"
                  className={cn(cardClass, "mt-2 overflow-hidden py-1")}
                >
                  {options.map((home, i) => (
                    <li
                      key={home.ListingKey}
                      id={`home-option-${i}`}
                      role="option"
                      aria-selected={i === activeOption}
                      aria-disabled={full || undefined}
                      // (The cursor stays in the box, ready for the next home.)
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => choose(home)}
                      onPointerEnter={() => setActiveOption(i)}
                      className={cn(
                        "flex min-h-14 cursor-pointer items-center gap-3 px-3 py-1.5",
                        i === activeOption && "bg-stone-100",
                        full && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <HomeThumb src={home.Media[0]?.MediaURL} sizes="48px" className="size-11 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold">
                          <Matched text={home.UnparsedAddress} part={suggested?.query ?? ""} />
                        </span>
                        <span className="block truncate text-meta text-muted">
                          {home.City} · {formatPrice(home.ListPrice)}
                        </span>
                      </span>
                    </li>
                  ))}
                  {options.length === 0 && (
                    <li role="option" aria-selected={false} aria-disabled className="px-4 py-3 text-body text-muted">
                      No homes match that.
                    </li>
                  )}
                </ul>
              )}
              {/* With nothing typed: homes to pick from. */}
              {!typing_ && shown.length > 0 && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{shown.map(card)}</ul>}
              {!typing_ &&
                shown.length === 0 &&
                groups.map((group) => (
                  <section key={group.title} aria-label={group.title} className="mt-6">
                    <h2 className={groupLabel}>{group.title}</h2>
                    <ul className="mt-2 grid gap-3 sm:grid-cols-2">{group.homes.map(card)}</ul>
                  </section>
                ))}
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
                {picked.length} picked
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

// An address with the part that was typed in ink, the rest a shade lighter,
// so the eye lands on why it matched. Several words typed ("lakeview mercer",
// or the street with its city after a comma): as many of them from the start
// as the address has together, or else the first of them it has at all.
function Matched({ text, part }: { text: string; part: string }) {
  const address = text.toLowerCase();
  const words = placeWords(part.toLowerCase());
  // ("5902 lakeview terrace se mercer island", then one word fewer each time.)
  const runs = words.map((_, i) => words.slice(0, words.length - i).join(" "));
  const marked = [...runs, ...words].find((word) => address.includes(word)) ?? "";
  const at = marked ? address.indexOf(marked) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      <span className="font-normal text-stone-600">{text.slice(0, at)}</span>
      {text.slice(at, at + marked.length)}
      <span className="font-normal text-stone-600">{text.slice(at + marked.length)}</span>
    </>
  );
}
