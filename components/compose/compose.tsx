"use client";

import { Bookmark, Check, Globe, Plus, Search, Send, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { saveHome } from "@/app/homes/actions";
import { findHomes, offerHomes, publish, type HomeGroup } from "@/app/send/actions";
import { PeoplePicker, typed, type Chosen } from "@/components/people-picker";
import { Avatar, HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { HomeLite } from "@/lib/home-lite";
import { addressFromLink, looksLikeLink } from "@/lib/listing-link";
import { button, card, field, groupLabel } from "@/lib/ui";

// The one box for saying something and sending homes, as a post is written
// on LinkedIn or Facebook: your words, the homes it's about (found by their
// address, or picked from the ones offered: your listings, homes you've had
// to do with, popular ones), and who it's for. Everyone: a post on your page
// and in your followers' feeds, and on each home's conversation. Someone:
// each person gets their own link, and the homes land in your conversation
// with them in Messages. Neither the words nor a home is required on its
// own; to send to someone there must be a home. At the top of Home and of
// your own page it opens in place; from Messages it's a page of its own.

// Who a conversation is with, when the box opens from one: fixed, and the
// link they already have (more homes go on it) if the viewer sent them one.
export type ComposeTo = { key: string; name: string; shareId: string | null; nameless?: boolean };

type Audience = "everyone" | "someone";

// How many of each offered group show before "Show more".
const OFFERED_FIRST = 4;

export function Compose({
  me,
  mode,
  start = [],
  to = null,
  audience = "everyone",
  peer = false,
}: {
  me: { name: string; photo: string | null; agent: boolean };
  // In place on a page (closed until tapped), or the page itself (open).
  mode: "inline" | "page";
  // Homes already picked (Send on a home).
  start?: HomeLite[];
  to?: ComposeTo | null;
  // Where it starts out going, when nobody's fixed.
  audience?: Audience;
  // Someone who isn't an agent: the picker's words.
  peer?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(mode === "page");
  const [body, setBody] = useState("");
  const [homes, setHomes] = useState<HomeLite[]>(start);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; homes: HomeLite[] } | null>(null);
  const [offer, setOffer] = useState<HomeGroup[] | null>(null);
  const [shownAll, setShownAll] = useState<Record<string, boolean>>({});
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [aud, setAud] = useState<Audience>(to ? "someone" : audience);
  const [people, setPeople] = useState<Chosen[]>([]);
  const [typing, setTyping] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const words = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const listId = `${id}-homes`;
  const errorId = `${id}-error`;

  // Homes as they type, a moment after they stop.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let live = true;
    const wait = setTimeout(async () => {
      const result = await findHomes(text).catch((): HomeLite[] => []);
      if (live) setFound({ query: text, homes: result });
    }, 200);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [query]);

  // What's offered with nothing typed: read once the search is open.
  const startAdding = () => {
    setAdding(true);
    if (!offer) offerHomes().then(setOffer, () => setOffer([]));
    requestAnimationFrame(() => search.current?.focus());
  };

  const begin = () => {
    setOpen(true);
    setDone(null);
    requestAnimationFrame(() => words.current?.focus());
  };
  const reset = () => {
    setBody("");
    setHomes(start);
    setAdding(false);
    setQuery("");
    setFound(null);
    setLinkNote(null);
    setPeople([]);
    setTyping("");
    setError(null);
  };
  const cancel = () => {
    reset();
    if (mode === "inline") setOpen(false);
    else router.back();
  };

  const picked = (home: HomeLite) => homes.some((h) => h.key === home.key);
  const pick = (home: HomeLite) => {
    setHomes((current) => (current.some((h) => h.key === home.key) ? current : [...current, home]));
    setQuery("");
    setFound(null);
    setLinkNote(null);
    setActive(0);
    // (The keyboard stays in the search, for the next one: unless it has
    // already moved on to something else, like the people picker.)
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active.closest("[data-homes]")) search.current?.focus();
    });
  };
  const unpick = (key: string) => {
    setHomes((current) => current.filter((h) => h.key !== key));
    requestAnimationFrame(() => (search.current ?? addButton.current ?? words.current)?.focus());
  };

  const onSearch = (value: string) => {
    setActive(0);
    if (looksLikeLink(value)) {
      const street = addressFromLink(value);
      if (street) {
        setQuery(street);
        setLinkNote(`From your link: ${street}`);
      } else {
        setQuery("");
        setLinkNote("We couldn't read an address from that link. Type the address instead.");
      }
      return;
    }
    setLinkNote(null);
    setQuery(value);
  };
  // Only what's found for what's in the box now, less what's picked.
  const matches = found && found.query === query.trim() ? found.homes.filter((h) => !picked(h)) : null;
  const listOpen = query.trim().length >= 2 && matches !== null;

  // Whoever's named, and whatever's typed but not yet added.
  const everyone = typing.trim() && !typing.includes("@") ? [...people, typed(typing)] : people;
  const toSomeone = aud === "someone";
  const canSend = toSomeone ? homes.length > 0 && (Boolean(to) || everyone.length > 0) : Boolean(body.trim()) || homes.length > 0;
  // Why Send can't go yet, in a few words.
  const why = toSomeone && homes.length === 0 ? "Add a home to send." : toSomeone && !to && everyone.length === 0 ? "Say who it's for." : null;

  const submit = () => {
    if (!canSend || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await publish({
        body,
        homes: homes.map((h) => h.key),
        to: to ? { kind: "thread", key: to.key, shareId: to.shareId } : toSomeone ? { kind: "people", people: everyone.map((p) => p.pick) } : { kind: "everyone" },
      }).catch((): Awaited<ReturnType<typeof publish>> => ({ ok: false, error: "That didn't send. Try again." }));
      if (!result.ok) return setError(result.error);
      if (result.href === pathname) {
        reset();
        if (mode === "inline") setOpen(false);
        setDone(result.said);
        router.refresh();
      } else {
        router.push(result.href);
      }
    });
  };
  // Keeps the homes for you alone, with nothing said.
  const save = () => {
    if (homes.length === 0 || pending) return;
    setError(null);
    startTransition(async () => {
      for (const home of homes) {
        const result = await saveHome(home.key, true);
        if (!result.ok) return setError(result.error);
      }
      reset();
      if (mode === "inline") setOpen(false);
      setDone(homes.length === 1 ? "Saved" : `Saved ${homes.length} homes`);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className={cn(card, "flex flex-col p-3")}>
        <div className="flex items-center gap-3">
          <Avatar name={me.name} tone={me.agent ? "agent" : "person"} photo={me.photo} size={10} />
          <button
            type="button"
            onClick={begin}
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-stone-300 px-4 text-left text-body text-stone-600 hover:border-stone-400 hover:bg-stone-50"
          >
            <Send aria-hidden size={18} className="shrink-0 text-stone-500" />
            <span className="truncate">{me.agent ? "Send homes to a client" : "Send homes to someone"}, or say something…</span>
          </button>
        </div>
        {done && (
          <p role="status" className="mt-2 flex items-center gap-1 px-1 text-meta font-semibold text-emerald-700">
            <Check aria-hidden size={14} /> {done}
          </p>
        )}
      </div>
    );
  }

  const Title = mode === "page" ? "h1" : "h2";
  return (
    <form
      aria-labelledby={titleId}
      data-compose
      className={cn(card, "flex flex-col gap-3 p-4")}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        // (Escape closes an untouched box; with something in it, it stays.)
        const clean = !body.trim() && homes.length === start.length && people.length === 0 && !typing.trim();
        if (event.key === "Escape" && mode === "inline" && clean) {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={me.name} tone={me.agent ? "agent" : "person"} photo={me.photo} size={10} />
        <Title id={titleId} className={cn("min-w-0 flex-1 font-semibold", mode === "page" ? "font-display text-3xl leading-tight" : "text-lg")}>
          {to ? (to.nameless ? "Add homes to the link" : `Send ${to.name} homes`) : toSomeone ? "Send homes" : "Post or send homes"}
        </Title>
        {mode === "inline" && (
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel"
            className="grid size-11 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-stone-100"
          >
            <X aria-hidden size={20} />
          </button>
        )}
      </div>

      <textarea
        ref={words}
        value={body}
        rows={2}
        maxLength={toSomeone ? 500 : 1000}
        placeholder="Say something…"
        aria-label="Say something"
        onChange={(event) => setBody(event.target.value)}
        className="min-h-20 w-full resize-none rounded-2xl bg-stone-100 px-4 py-3 text-body leading-6 text-ink [field-sizing:content] placeholder:text-stone-500 focus:bg-white focus:outline-2 focus:outline-brand"
      />

      {homes.length > 0 && (
        <ul aria-label="Picked homes" className="flex flex-col gap-2">
          {homes.map((home) => (
            <li key={home.key} className="flex items-center gap-3 rounded-2xl bg-stone-50 p-2 ring-1 ring-stone-200">
              <HomeThumb src={home.photo} sizes="80px" className="h-14 w-[4.5rem] shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                {/* (The price and the whole street, wrapping rather than cut short.) */}
                <p className="line-clamp-2 break-words text-body font-semibold">
                  <span className="font-display">{formatPrice(home.price)}</span> · {home.address}
                </p>
                <p className="truncate text-meta text-muted">
                  {[home.beds != null && `${home.beds} bd`, home.baths != null && `${home.baths} ba`, home.city].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unpick(home.key)}
                aria-label={`Remove ${home.address}`}
                className="grid size-11 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-stone-200"
              >
                <X aria-hidden size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div data-homes className="flex flex-col gap-2">
          <label htmlFor={`${id}-search`} className="sr-only">
            Address, MLS number, or a link to the home
          </label>
          <div className="relative">
            <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={search}
              id={`${id}-search`}
              type="text"
              role="combobox"
              aria-expanded={listOpen && (matches?.length ?? 0) > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={listOpen && matches && matches[active] ? `${listId}-${active}` : undefined}
              value={query}
              autoComplete="off"
              placeholder="Address, MLS #, or paste a link"
              onChange={(event) => onSearch(event.target.value)}
              onKeyDown={(event) => {
                // (Enter picks, never sends; Escape clears, then closes the search.)
                if (event.key === "Enter") event.preventDefault();
                if (!listOpen || !matches || matches.length === 0) {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    if (query) setQuery("");
                    else {
                      setAdding(false);
                      requestAnimationFrame(() => addButton.current?.focus());
                    }
                  }
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => (i + 1) % matches.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => (i - 1 + matches.length) % matches.length);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  pick(matches[active]);
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              className={cn(field({ pill: true }), "h-12 w-full pl-11")}
            />
          </div>
          {linkNote && (
            <p role="status" className="px-1 text-meta text-stone-700">
              {linkNote}
            </p>
          )}
          {listOpen && matches && matches.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Homes that match" className="flex flex-col gap-0.5">
              {matches.map((home, i) => (
                <li key={home.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <HomeRow home={home} onClick={() => pick(home)} picked={false} active={i === active} />
                </li>
              ))}
            </ul>
          )}
          {listOpen && matches && matches.length === 0 && (
            <p role="status" className="px-2 py-3 text-body text-muted">
              No homes match that.
            </p>
          )}
          {!listOpen && query.trim().length < 2 && (
            <>
              {offer === null && (
                <p role="status" className="px-1 text-meta text-muted">
                  Finding homes to send…
                </p>
              )}
              {offer?.map((group) => {
                const rows = group.homes.filter((home) => !picked(home));
                if (rows.length === 0) return null;
                const all = shownAll[group.title];
                return (
                  <section key={group.title} aria-label={group.title} className="flex flex-col gap-1">
                    <h3 className={groupLabel}>{group.title}</h3>
                    <ul className="flex flex-col gap-0.5">
                      {(all ? rows : rows.slice(0, OFFERED_FIRST)).map((home) => (
                        <li key={home.key}>
                          <HomeRow home={home} onClick={() => pick(home)} picked={false} />
                        </li>
                      ))}
                    </ul>
                    {!all && rows.length > OFFERED_FIRST && (
                      <button
                        type="button"
                        onClick={() => setShownAll({ ...shownAll, [group.title]: true })}
                        className="flex min-h-11 items-center px-2 text-body font-semibold text-brand hover:underline"
                      >
                        Show {rows.length - OFFERED_FIRST} more
                      </button>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <button
          ref={addButton}
          type="button"
          onClick={startAdding}
          className={cn(button({ kind: "secondary" }), "self-start")}
        >
          <Plus aria-hidden size={18} /> {homes.length > 0 ? "Add another home" : "Add a home"}
        </button>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className={cn(groupLabel, "mb-1")}>Who it&apos;s for</legend>
        {to ? (
          <p className="flex min-h-11 items-center gap-2 text-body">
            <Send aria-hidden size={16} className="text-stone-500" />
            To <span className="font-semibold">{to.nameless ? `the ${to.name.replace(/^Link/, "link")}` : to.name}</span>
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="Who it's for"
            className="flex flex-wrap gap-2"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = aud === "everyone" ? "someone" : "everyone";
                setAud(next);
                (event.currentTarget.querySelector<HTMLElement>(`[data-choice="${next}"]`))?.focus();
              }
            }}
          >
            {(
              [
                ["everyone", Globe, "Everyone"],
                ["someone", Send, "Someone"],
              ] as const
            ).map(([value, Icon, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                data-choice={value}
                aria-checked={aud === value}
                tabIndex={aud === value ? 0 : -1}
                onClick={() => setAud(value)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-body font-semibold transition-colors",
                  aud === value ? "border-ink bg-ink text-white" : "border-stone-300 bg-white text-ink hover:bg-stone-50",
                )}
              >
                <Icon aria-hidden size={16} /> {text}
              </button>
            ))}
          </div>
        )}
        {toSomeone && !to && (
          <PeoplePicker
            label="Who's it for?"
            hint="Each person gets their own link."
            chosen={people}
            onChange={setPeople}
            onTextChange={setTyping}
            max={6}
            notify
            peer={peer}
          />
        )}
        {!toSomeone && <p className="px-1 text-meta text-muted">On your page, in your followers&apos; feeds, and on each home.</p>}
      </fieldset>

      {error && (
        <p id={errorId} role="alert" className="text-body text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {why && !error && <p className="mr-auto text-meta text-muted">{why}</p>}
        {/* Homes picked and nothing said: they can be kept for you alone instead. */}
        {!toSomeone && homes.length > 0 && !body.trim() && (
          <button type="button" disabled={pending} onClick={save} className={button({ kind: "secondary", size: "lg" })}>
            <Bookmark aria-hidden size={18} /> Save
          </button>
        )}
        <button type="submit" disabled={pending || !canSend} className={button({ kind: "primary", size: "lg" })}>
          {toSomeone ? (pending ? "Sending" : "Send") : pending ? "Posting" : "Post"}
        </button>
      </div>
    </form>
  );
}

// One home to pick: its photo, price and address, then the city.
function HomeRow({ home, picked, active = false, onClick }: { home: HomeLite; picked: boolean; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={picked}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-stone-50",
        active && "bg-stone-100",
      )}
    >
      <HomeThumb src={home.photo} sizes="64px" className="h-12 w-16 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-body">
          <span className="font-display font-semibold">{formatPrice(home.price)}</span> · {home.address}
        </span>
        <span className="block truncate text-meta text-muted">{home.city}</span>
      </span>
      <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-meta font-semibold text-stone-700">{picked ? "Picked" : "Pick"}</span>
    </button>
  );
}
