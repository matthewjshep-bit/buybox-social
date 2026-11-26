"use client";

import { Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { SavedNote } from "@/components/ui";
import { cn } from "@/lib/format";
import { linkUrl } from "@/lib/link-url";
import type { ProfileLink } from "@/lib/profile";
import { button, field, fieldLabel } from "@/lib/ui";
import { saveAbout } from "./actions";

const BIO_MOST = 300;
const LINKS_MOST = 5;

// What you say about yourself, and (an agent) your links. On a page of its
// own (`done`: where Save and Cancel go back to), it's open from the start;
// elsewhere, closed, it's one button: Edit, or Add a few words. On Edit
// profile, one card among several that each save themselves (`stay`): saving
// stays on the page and says "Saved", as the cards above it do, the button
// says what it saves, and there's no Cancel (the page has its own way back).
export function EditAbout({
  bio,
  links,
  agent,
  done,
  stay = false,
}: {
  bio: string;
  links: ProfileLink[];
  agent: boolean;
  done?: string;
  stay?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(done));
  const [text, setText] = useState(bio);
  const [rows, setRows] = useState<ProfileLink[]>(links.length ? links : done && agent ? [{ label: "", url: "" }] : links);
  const [error, setError] = useState<string | null>(null);
  // Said beside the button once it's saved (`stay`), until something's changed again.
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const id = useId();

  if (!open) {
    const empty = !bio && links.length === 0;
    return (
      <button
        type="button"
        onClick={() => {
          setText(bio);
          setRows(links.length ? links : agent ? [{ label: "", url: "" }] : []);
          setError(null);
          setOpen(true);
        }}
        className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-body font-semibold text-brand hover:bg-black/5"
      >
        <Pencil aria-hidden size={15} />
        {empty ? (agent ? "Add a bio and links" : "Add a bio") : "Edit"}
      </button>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await saveAbout(text, rows);
      if (!result.ok) return setError(result.error);
      if (stay) setSaved(true);
      else if (done) router.push(done);
      else setOpen(false);
    });
  // Any change to the links: no longer what was saved.
  const changeRows = (change: (now: ProfileLink[]) => ProfileLink[]) => {
    setSaved(false);
    setRows(change);
  };
  const setRow = (i: number, next: Partial<ProfileLink>) =>
    changeRows((now) => now.map((row, j) => (j === i ? { ...row, ...next } : row)));
  // Anything here that isn't what's on their profile, as saving would keep it:
  // rows with an address, each address as the server writes it ("site.com" is
  // "https://site.com/"). A row with no address is nothing.
  const kept = (list: ProfileLink[]) =>
    list
      .filter((row) => row.url.trim())
      .map(({ label, url }) => [label.trim(), linkUrl(url.trim()) ?? url.trim()]);
  const changed = text.trim() !== bio.trim() || JSON.stringify(kept(rows)) !== JSON.stringify(kept(links));

  return (
    <form
      aria-label="Edit about you"
      className={cn("flex flex-col gap-3", done ? "" : "mt-3 rounded-2xl bg-stone-50 p-3")}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div>
        {/* (On Edit profile a buyer's card is called "About you" already; an agent's label
            tells their words from their links.) */}
        <label htmlFor={`${id}-bio`} className={cn(fieldLabel, stay && !agent && "sr-only")}>
          About you
        </label>
        <textarea
          id={`${id}-bio`}
          value={text}
          maxLength={BIO_MOST}
          rows={3}
          autoFocus={!done}
          onChange={(event) => {
            setSaved(false);
            setText(event.target.value);
          }}
          placeholder={
            agent
              ? "Helping first-time buyers on the Eastside since 2015."
              : "Looking for a craftsman near a park."
          }
          className={cn(field({ lines: true }), "mt-1")}
        />
        <p className="mt-1 flex justify-between gap-3 text-[12px] text-muted">
          <span>{stay ? "Shows on your profile." : ""}</span>
          <span className="tabular-nums">
            {text.length}/{BIO_MOST}
          </span>
        </p>
      </div>
      {agent && (
        <fieldset className="flex flex-col gap-2">
          <legend className={fieldLabel}>Links</legend>

          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 shrink-0 sm:w-36">
                <input
                  aria-label={`Link ${i + 1} name`}
                  value={row.label}
                  maxLength={40}
                  placeholder="Name"
                  onChange={(event) => setRow(i, { label: event.target.value })}
                  className={field()}
                />
              </span>
              <span className="min-w-0 flex-1">
                <input
                  aria-label={`Link ${i + 1} address`}
                  value={row.url}
                  maxLength={300}
                  inputMode="url"
                  placeholder="yoursite.com"
                  onChange={(event) => setRow(i, { url: event.target.value })}
                  className={field()}
                />
              </span>
              <button
                type="button"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => changeRows((now) => now.filter((_, j) => j !== i))}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-black/5 hover:text-ink"
              >
                <X aria-hidden size={16} />
              </button>
            </div>
          ))}
          {rows.length < LINKS_MOST && (
            <button
              type="button"
              onClick={() => changeRows((now) => [...now, { label: "", url: "" }])}
              className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-brand hover:bg-black/5"
            >
              <Plus aria-hidden size={15} /> Add a link
            </button>
          )}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {stay ? (
        // As every card's Save on Edit profile: the button (blue once there's something
        // to save), then that it's saved.
        <div className="flex items-center gap-3">
          <button
            type="submit"
            aria-disabled={pending}
            className={cn(button({ kind: changed && !saved ? "primary" : "secondary" }), pending && "opacity-60")}
          >
            {pending ? "Saving…" : "Save about"}
          </button>
          {saved && !pending && <SavedNote />}
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          {done ? (
            <Link href={done} className={button({ kind: "ghost", size: "lg" })}>
              Cancel
            </Link>
          ) : (
            <button type="button" onClick={() => setOpen(false)} className={button({ kind: "ghost" })}>
              Cancel
            </button>
          )}
          <button
            type="submit"
            aria-disabled={pending}
            className={cn(button({ kind: "primary", size: done ? "lg" : "md" }), pending && "opacity-60")}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </form>
  );
}
