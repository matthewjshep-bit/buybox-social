"use client";

import { Bookmark, Check, Home, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { findHomesToPost, postAboutHome, saveHome, type HomeToPost } from "@/app/homes/actions";
import { Avatar, HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import { button, card } from "@/lib/ui";

// At the top of your own page, as Facebook has "What's on your mind?": post
// about a home, or just save it. Find it by its address or MLS number (one
// that isn't here yet is brought in). Say what you think ("Drove by this one
// today. That porch!") and post: it goes on your page, in your followers'
// feeds and in the home's own conversation. Or save it, with nothing said:
// it goes under Saved, for you alone. It opens in place, so nothing else on
// the page moves away.
export function PostComposer({ me }: { me: { name: string; photo: string | null; agent: boolean } }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The homes found, and what was typed to find them.
  const [results, setResults] = useState<{ query: string; homes: HomeToPost[] } | null>(null);
  const [home, setHome] = useState<HomeToPost | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  // What was just done, said under the box: "Posted", "Saved".
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchBox = useRef<HTMLInputElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const errorId = useId();

  // Homes as they type, a moment after they stop.
  useEffect(() => {
    if (home) return;
    const text = query.trim();
    if (text.length < 2) return;
    let live = true;
    const wait = setTimeout(async () => {
      const homes = await findHomesToPost(text);
      if (live) setResults({ query: text, homes });
    }, 250);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [query, home]);

  const start = () => {
    setOpen(true);
    setDone(null);
    requestAnimationFrame(() => searchBox.current?.focus());
  };
  const reset = () => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setHome(null);
    setBody("");
    setError(null);
  };
  const pick = (picked: HomeToPost) => {
    setHome(picked);
    requestAnimationFrame(() => textBox.current?.focus());
  };
  // Only what's found for what's in the box now.
  const found = results && results.query === query.trim() ? results.homes : null;
  const post = () => {
    if (!home || !body.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await postAboutHome(home.key, body);
      if (!result.ok) setError(result.error);
      else {
        reset();
        setDone("Posted");
      }
    });
  };
  const save = () => {
    if (!home || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await saveHome(home.key, true);
      if (!result.ok) setError(result.error);
      else {
        reset();
        setDone("Saved");
      }
    });
  };

  if (!open) {
    return (
      <div className={cn(card, "mb-4 p-3")}>
        <div className="flex items-center gap-3">
          <Avatar name={me.name} tone={me.agent ? "agent" : "person"} photo={me.photo} size={10} />
          <button
            type="button"
            onClick={start}
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-stone-100 px-4 text-left text-body text-stone-600 hover:bg-stone-200"
          >
            <Home aria-hidden size={18} className="shrink-0 text-stone-500" />
            <span className="truncate">Post or save a home…</span>
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

  return (
    <form
      aria-labelledby={titleId}
      className={cn(card, "mb-4 flex flex-col gap-3 p-4")}
      onSubmit={(event) => {
        event.preventDefault();
        post();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          reset();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={me.name} tone={me.agent ? "agent" : "person"} photo={me.photo} size={10} />
        <h2 id={titleId} className="flex-1 text-lg font-semibold">
          Post or save a home
        </h2>
        <button
          type="button"
          onClick={reset}
          aria-label="Cancel"
          className="grid size-11 place-items-center rounded-full text-stone-600 hover:bg-stone-100"
        >
          <X aria-hidden size={20} />
        </button>
      </div>

      {home ? (
        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 p-2 ring-1 ring-stone-200">
          <HomeThumb src={home.photo ?? undefined} sizes="96px" className="h-16 w-20 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold">{home.address}</p>
            <p className="truncate text-meta text-muted">
              {formatPrice(home.price)} · {home.beds} bd · {home.baths} ba · {home.city}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setHome(null);
              requestAnimationFrame(() => searchBox.current?.focus());
            }}
            className={cn(button({ kind: "secondary" }), "shrink-0")}
          >
            Change
          </button>
        </div>
      ) : (
        <div>
          <label className="relative block">
            <span className="sr-only">Which home? Address, city, ZIP or MLS number</span>
            <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={searchBox}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Address, city, ZIP or MLS #"
              autoComplete="off"
              className="h-12 w-full rounded-full bg-stone-100 pl-11 pr-4 text-body text-ink placeholder:text-stone-500 focus:bg-white focus:outline-2 focus:outline-brand"
            />
          </label>
          {found && (
            <ul aria-label="Homes" className="mt-2 flex flex-col">
              {found.map((option) => (
                <li key={option.key}>
                  <button
                    type="button"
                    onClick={() => pick(option)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-stone-50"
                  >
                    <HomeThumb src={option.photo ?? undefined} sizes="80px" className="h-12 w-16 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold">{option.address}</span>
                      <span className="block truncate text-meta text-muted">
                        {formatPrice(option.price)} · {option.city}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {found.length === 0 && <li className="px-2 py-3 text-body text-muted">No homes for sale match that.</li>}
            </ul>
          )}
        </div>
      )}

      {home && (
        <>
          <textarea
            ref={textBox}
            value={body}
            rows={3}
            maxLength={1000}
            placeholder="What do you think of it?"
            aria-label="What do you think of it?"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-24 w-full resize-none rounded-2xl bg-stone-100 px-4 py-3 text-body leading-6 text-ink [field-sizing:content] placeholder:text-stone-500 focus:bg-white focus:outline-2 focus:outline-brand"
          />
          {error && (
            <p id={errorId} role="alert" className="text-meta text-red-700">
              {error}
            </p>
          )}
          {/* Save keeps it for you alone, with nothing said; Post shares what you wrote. */}
          <div className="flex items-center justify-end gap-2">
            <button type="button" disabled={pending} onClick={save} className={button({ kind: "secondary", size: "lg" })}>
              <Bookmark aria-hidden size={18} /> Save
            </button>
            <button type="submit" disabled={pending || !body.trim()} className={button({ kind: "primary", size: "lg" })}>
              {pending ? "Posting" : "Post"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
