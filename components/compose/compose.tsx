"use client";

import { Bookmark, Check, ChevronDown, Globe, HousePlus, Lock, Plus, Search, Send, X } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { saveHome } from "@/app/homes/actions";
import { findHomes, offerHomes, publish, type HomeGroup } from "@/app/send/actions";
import { PeoplePicker, typed, type Chosen } from "@/components/people-picker";
import { Avatar, HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { HomeLite } from "@/lib/home-lite";
import { addressFromLink, looksLikeLink } from "@/lib/listing-link";
import { button, card, closeButton, field, focusOnDark, glass, groupLabel, menuRow, pageTitle, popover } from "@/lib/ui";

// The one box for sharing homes and saying something, written the way a post
// is on Facebook or LinkedIn: who you are and who sees it at the top (Public
// or Private, under your name), your words, and the homes attached under
// them as a photo would be, each a card with its photo that comes off with
// its X. Public: a post on your page, in your followers' feeds, and on each
// home's conversation. Private: a "To" line appears, and each person gets
// their own link, the homes landing in your conversation with them in
// Messages. The button says which: Post or Send. Neither the words nor a home
// is required on its own; to send to someone there must be a home. At the top
// of Home and of your own page it opens in place; from Messages it's a page.

// Who a conversation is with, when the box opens from one: fixed, and the
// link they already have (more homes go on it) if the viewer sent them one.
export type ComposeTo = { key: string; name: string; shareId: string | null; nameless?: boolean };

type Audience = "everyone" | "someone";

const AUDIENCES = [
  { value: "everyone", Icon: Globe, label: "Public", about: "Your page, your followers' feeds, and each home's page" },
  { value: "someone", Icon: Lock, label: "Private", about: "Only the people you pick. Each gets their own link." },
] as const;

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
  const who = useRef<HTMLInputElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const listId = `${id}-homes`;
  const errorId = `${id}-error`;
  const whyId = `${id}-why`;

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
  const stopAdding = () => {
    setAdding(false);
    setQuery("");
    setLinkNote(null);
    requestAnimationFrame(() => addButton.current?.focus());
  };

  const begin = (withHomes = false) => {
    setOpen(true);
    setDone(null);
    if (withHomes) startAdding();
    else requestAnimationFrame(() => words.current?.focus());
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
  // Nothing written, picked or named yet (beyond what it opened with).
  const clean = !body.trim() && homes.length === start.length && people.length === 0 && !typing.trim();
  const cancel = () => {
    // In place, X only closes it: what's written, picked and named is kept
    // for when they open it again (posting or saving clears it).
    if (mode === "inline") {
      if (clean) reset();
      setOpen(false);
    } else {
      reset();
      router.back();
    }
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
  // Why it can't go yet, read out with the button (on screen, the box says
  // it: the To line waiting, Add a home beside the button).
  const why = toSomeone && homes.length === 0 ? "Add a home to send." : toSomeone && !to && everyone.length === 0 ? "Say who it's for." : null;

  // What the words are for: a note to the people it's sent to, or, in public,
  // what's good about the homes attached.
  const prompt = toSomeone
    ? to && !to.nameless
      ? `Add a note for ${to.name}…`
      : "Add a note…"
    : homes.length === 0
      ? "Share a home, or say something…"
      : homes.length === 1
        ? "What do you love about this home?"
        : "What do you love about these homes?";

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
    // As on Facebook: your face, the box to start a post in, and the thing
    // to attach (a home) a tap away beside it.
    return (
      <div className={cn(card, "flex flex-col p-3")}>
        <div className="flex items-center gap-2">
          <Avatar name={me.name} tone={me.agent ? "agent" : "person"} photo={me.photo} size={10} className="mr-1" />
          <button
            type="button"
            onClick={() => begin()}
            className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-stone-100 px-4 text-left text-body text-stone-600 hover:bg-stone-200/70"
          >
            {/* On a phone, the first half alone, whole, rather than cut mid-word. */}
            <span className="truncate">
              Share homes<span className="max-sm:hidden">, or say something</span>…
            </span>
          </button>
          <button
            type="button"
            onClick={() => begin(true)}
            aria-label="Add a home"
            className={cn(button({ kind: "ghost", icon: true }), "shrink-0 text-brand")}
          >
            <HousePlus aria-hidden size={22} />
          </button>
        </div>
        {done ? (
          <p role="status" className="mt-2 flex items-center gap-1 px-1 text-meta font-semibold text-emerald-700">
            <Check aria-hidden size={14} /> {done}
          </p>
        ) : (
          !clean && <p className="mt-2 px-1 text-meta text-muted">Your draft is kept.</p>
        )}
      </div>
    );
  }

  const title = to ? (to.nameless ? "Add homes to the link" : `Share homes with ${to.name}`) : "Share homes";
  return (
    <>
      {mode === "page" && (
        <h1 id={titleId} className={cn(pageTitle, "mb-4")}>
          {title}
        </h1>
      )}
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
          if (event.key === "Escape" && mode === "inline" && clean && !event.defaultPrevented) {
            event.preventDefault();
            cancel();
          }
        }}
      >
        {mode === "inline" && (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        {/* Who's posting, and who sees it, under their name. */}
        <div className="flex items-center gap-3">
          <Avatar name={me.name} tone={me.agent ? "agent" : "person"} photo={me.photo} size={10} />
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <p className="max-w-full truncate text-body font-semibold leading-tight">{me.name}</p>
            {to ? (
              <p className="mt-0.5 flex min-w-0 max-w-full items-center gap-1 text-meta text-muted">
                <Send aria-hidden size={13} className="shrink-0" />
                <span className="truncate">
                  To <span className="font-semibold text-ink">{to.nameless ? `the ${to.name.replace(/^Link/, "link")}` : to.name}</span>
                </span>
              </p>
            ) : (
              <AudienceMenu
                value={aud}
                onChange={(next) => {
                  setAud(next);
                  // Private: on to who it's for.
                  if (next === "someone") requestAnimationFrame(() => who.current?.focus());
                }}
              />
            )}
          </div>
          {mode === "inline" && (
            <button type="button" onClick={cancel} aria-label="Cancel" className={cn(closeButton, "-mr-2 shrink-0 self-start")}>
              <X aria-hidden size={20} />
            </button>
          )}
        </div>

        {/* Private: who it's for, as a message's To line. */}
        {toSomeone && !to && (
          <PeoplePicker
            label="Who's it for?"
            inline="To"
            inputRef={who}
            chosen={people}
            onChange={setPeople}
            onTextChange={setTyping}
            max={6}
            notify
            peer={peer}
          />
        )}

        <textarea
          ref={words}
          value={body}
          rows={2}
          maxLength={toSomeone ? 500 : 1000}
          placeholder={prompt}
          aria-label="Say something"
          onChange={(event) => setBody(event.target.value)}
          className="min-h-12 w-full resize-none bg-transparent py-1 text-lead leading-7 text-ink outline-hidden! [field-sizing:content] placeholder:text-stone-500"
        />

        {/* The homes, attached as photos are to a post. */}
        {homes.length > 0 && <Attached homes={homes} onRemove={unpick} />}

        {adding && (
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
                      event.preventDefault();
                      event.stopPropagation();
                      if (query) setQuery("");
                      else stopAdding();
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
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery("");
                  }
                }}
                // (Grey and edgeless until typed in, ringed then as every text box is.)
                className={cn(field({ pill: true, quiet: true }), "w-full pl-11")}
              />
            </div>
            {linkNote && (
              <p role="status" className="text-meta text-stone-700">
                {linkNote}
              </p>
            )}
            {listOpen && matches && matches.length > 0 && (
              <ul id={listId} role="listbox" aria-label="Homes that match" className="flex flex-col gap-0.5">
                {/* (Each option is the row itself, not a button in it: the
                    keyboard stays in the search, which moves through them.) */}
                {matches.map((home, i) => (
                  <li
                    key={home.key}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onClick={() => pick(home)}
                    onMouseDown={(event) => event.preventDefault()}
                    className={cn(rowClass, "cursor-pointer", i === active ? "bg-stone-100" : "hover:bg-stone-50")}
                  >
                    <HomeRowBody home={home} />
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
                  <p role="status" className="text-meta text-muted">
                    Finding homes…
                  </p>
                )}
                {offer?.map((group) => {
                  const rows = group.homes.filter((home) => !picked(home));
                  if (rows.length === 0) return null;
                  const all = shownAll[group.title];
                  return (
                    <section key={group.title} aria-label={group.title} className="flex flex-col gap-1">
                      <h3 className={cn(groupLabel, "px-1.5 pt-1")}>{group.title}</h3>
                      <ul className="flex flex-col gap-0.5">
                        {(all ? rows : rows.slice(0, OFFERED_FIRST)).map((home) => (
                          <li key={home.key}>
                            <button type="button" onClick={() => pick(home)} className={cn(rowClass, "hover:bg-stone-50")}>
                              <HomeRowBody home={home} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!all && rows.length > OFFERED_FIRST && (
                        <button
                          type="button"
                          onClick={() => setShownAll({ ...shownAll, [group.title]: true })}
                          className="flex min-h-11 items-center self-start px-1.5 text-body font-semibold text-brand hover:underline"
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
        )}

        {error && (
          <p id={errorId} role="alert" className="text-body text-red-700">
            {error}
          </p>
        )}
        {/* The bar: what to attach on the left, Post or Send on the right. On a
            phone it holds to the foot of the screen while the box runs past
            it (a long list of homes to pick from), so the button is always in
            reach; wider, it's the box's last line. */}
        <div className="-mx-4 -mb-4 flex items-center gap-2 rounded-b-2xl border-t border-stone-200 px-4 py-2.5 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:bg-white/95 max-md:pb-[max(0.625rem,env(safe-area-inset-bottom))] max-md:backdrop-blur">
          <button
            ref={addButton}
            type="button"
            aria-expanded={adding}
            onClick={() => (adding ? stopAdding() : startAdding())}
            className={cn(button({ kind: "ghost", flush: true }), "text-body", adding && "bg-black/5")}
          >
            <HousePlus aria-hidden size={20} className="text-brand" /> Add a home
          </button>
          {why && (
            <span id={whyId} className="sr-only">
              {why}
            </span>
          )}
          <span className="ml-auto" />
          {/* Homes attached and nothing said: they can be kept for you alone instead. */}
          {!toSomeone && homes.length > 0 && !body.trim() && (
            <button type="button" disabled={pending} onClick={save} className={button({ kind: "ghost" })}>
              <Bookmark aria-hidden size={16} /> Save
            </button>
          )}
          <button
            type="submit"
            disabled={pending || !canSend}
            aria-describedby={why ? whyId : undefined}
            className={cn(button({ kind: "primary" }), "min-w-20")}
          >
            {toSomeone ? (pending ? "Sending" : "Send") : pending ? "Posting" : "Post"}
          </button>
        </div>
      </form>
    </>
  );
}

// Who sees it, under the poster's name, as Facebook has it: a small grey
// chip ("Public", "Private") that opens the two choices, each with a line
// on where it goes. A tap anywhere else, or Escape, closes it.
function AudienceMenu({ value, onChange }: { value: Audience; onChange: (next: Audience) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const id = useId();
  const on = AUDIENCES.find((a) => a.value === value) ?? AUDIENCES[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    // (The choice that's on takes the keyboard.)
    wrap.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    chip.current?.focus();
  };
  const choose = (next: Audience) => {
    onChange(next);
    setOpen(false);
    if (next !== "someone") chip.current?.focus();
  };

  return (
    <div
      ref={wrap}
      className="relative mt-1"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={chip}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen(!open)}
        // A small chip, with a fingertip's room to tap round it.
        className="relative inline-flex h-7 items-center gap-1 rounded-md bg-stone-100 px-2 text-meta font-semibold text-stone-800 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:bg-stone-200"
      >
        <span className="sr-only">Who sees this: </span>
        <on.Icon aria-hidden size={13} />
        {on.label}
        <ChevronDown aria-hidden size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          role="radiogroup"
          aria-label="Who sees this"
          // (Lined up under the face, so on a phone it fits between the edges.)
          className={cn(popover, "absolute -left-[3.25rem] top-full z-40 mt-2 w-[min(21rem,calc(100vw-4rem))]")}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
              event.preventDefault();
              const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
              const at = radios.indexOf(document.activeElement as HTMLElement);
              radios[(at + 1) % radios.length]?.focus();
            }
          }}
        >
          {AUDIENCES.map(({ value: option, Icon, label, about }) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === value}
              aria-describedby={`${id}-${option}`}
              onClick={() => choose(option)}
              className={cn(menuRow(), "min-h-14 py-2")}
            >
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-ink">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                <span id={`${id}-${option}`} className="block text-meta font-normal leading-snug text-muted">
                  {about}
                </span>
              </span>
              <Check aria-hidden size={18} className={cn("shrink-0 text-brand", option !== value && "invisible")} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The homes attached: one, as a wide card with its photo, the way a single
// photo sits in a post; several, as a row of smaller cards to scroll through
// sideways. Each comes off with the X on its photo.
function Attached({ homes, onRemove }: { homes: HomeLite[]; onRemove: (key: string) => void }) {
  const one = homes.length === 1;
  return (
    <ul
      aria-label="Picked homes"
      // (Several: a row to swipe through on a phone, three across wider.)
      className={cn(
        one
          ? "flex flex-col"
          : "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0",
      )}
    >
      {homes.map((home) => (
        <li
          key={home.key}
          className={cn("relative overflow-hidden rounded-xl bg-white ring-1 ring-stone-200", !one && "w-44 shrink-0 snap-start sm:w-auto")}
        >
          <span className={cn("relative block w-full bg-stone-200", one ? "aspect-[2/1]" : "aspect-[4/3]")}>
            {home.photo && <Image src={home.photo} alt="" fill sizes={one ? "(min-width: 640px) 600px, 100vw" : "(min-width: 640px) 200px, 176px"} className="object-cover" />}
          </span>
          <div className={cn("min-w-0", one ? "px-3 py-2.5" : "px-2.5 py-2")}>
            {/* (The price, then the street: read out, and found, as one.) */}
            <p className={cn("font-semibold", one ? "text-body" : "text-sm")}>
              <PriceStreet home={home} clamp={one ? 2 : 1} />
            </p>
            <p className="truncate text-meta text-muted">
              {[home.beds != null && `${home.beds} bd`, home.baths != null && `${home.baths} ba`, home.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(home.key)}
            aria-label={`Remove ${home.address}`}
            // (A fingertip's room to tap, round a smaller glass circle.)
            className={cn("group absolute right-0 top-0 grid size-11 place-items-center rounded-full", focusOnDark)}
          >
            <span aria-hidden className={cn(glass, "grid size-8 place-items-center rounded-full group-hover:bg-black/75")}>
              <X size={18} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// The price on a line of its own, the whole street under it (wrapping to a
// second line rather than cut short, and never split from its house
// number by the price). Read out, and found, as one: "$839,000 · 96
// Fernhollow Ln". `clamp`: one line for the street on a small card.
function PriceStreet({ home, clamp = 2 }: { home: HomeLite; clamp?: 1 | 2 }) {
  return (
    <>
      <span className="block font-display font-semibold">{formatPrice(home.price)}</span>
      <span className="sr-only"> · </span>
      <span className={cn("break-words", clamp === 1 ? "block truncate" : "line-clamp-2")}>{home.address}</span>
    </>
  );
}

const rowClass = "flex min-h-11 w-full items-center gap-3 rounded-xl p-1.5 text-left";

// One home to pick: its photo, price and address, then the city, and a +.
function HomeRowBody({ home }: { home: HomeLite }) {
  return (
    <>
      <HomeThumb src={home.photo} sizes="64px" className="h-12 w-16 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block text-body">
          <PriceStreet home={home} />
        </span>
        <span className="block truncate text-meta text-muted">{home.city}</span>
      </span>
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-700">
        <Plus size={16} />
      </span>
    </>
  );
}
