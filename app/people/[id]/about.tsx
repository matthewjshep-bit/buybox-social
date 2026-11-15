"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import type { ProfileLink } from "@/lib/profile";
import { button, field } from "@/lib/ui";
import { saveAbout } from "./actions";

const BIO_MOST = 300;
const LINKS_MOST = 5;

// On your own page: what you say about yourself, and (an agent) your links,
// edited right where they show. Closed, it's one button: Edit, or Add a few
// words when there's nothing yet.
export function EditAbout({ bio, links, agent }: { bio: string; links: ProfileLink[]; agent: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(bio);
  const [rows, setRows] = useState<ProfileLink[]>(links);
  const [error, setError] = useState<string | null>(null);
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
        {empty ? (agent ? "Add a description and links" : "Add a few words about yourself") : "Edit"}
      </button>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveAbout(text, rows);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  const setRow = (i: number, next: Partial<ProfileLink>) =>
    setRows((now) => now.map((row, j) => (j === i ? { ...row, ...next } : row)));

  return (
    <form
      aria-label="Edit about you"
      className="mt-3 flex flex-col gap-3 rounded-2xl bg-stone-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div>
        <label htmlFor={`${id}-bio`} className="text-sm font-semibold">
          About you
        </label>
        <textarea
          id={`${id}-bio`}
          value={text}
          maxLength={BIO_MOST}
          rows={3}
          autoFocus
          onChange={(event) => setText(event.target.value)}
          placeholder={
            agent
              ? "What you do and where: “Helping first-time buyers on the Eastside since 2015.”"
              : "What you're looking for: “Hunting for a craftsman near a park, with room for a dog.”"
          }
          className={cn(field({ lines: true }), "mt-1")}
        />
        <p className="mt-1 text-right text-[12px] text-muted tabular-nums">
          {text.length}/{BIO_MOST}
        </p>
      </div>
      {agent && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Links</legend>
          <p className="-mt-1 text-meta text-muted">Your brokerage, your listings, anywhere else clients should find you.</p>
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
                  placeholder="harborandpine.com"
                  onChange={(event) => setRow(i, { url: event.target.value })}
                  className={field()}
                />
              </span>
              <button
                type="button"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => setRows((now) => now.filter((_, j) => j !== i))}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-black/5 hover:text-ink"
              >
                <X aria-hidden size={16} />
              </button>
            </div>
          ))}
          {rows.length < LINKS_MOST && (
            <button
              type="button"
              onClick={() => setRows((now) => [...now, { label: "", url: "" }])}
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
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={button({ kind: "ghost" })}>
          Cancel
        </button>
        <button type="submit" aria-disabled={pending} className={cn(button({ kind: "primary" }), pending && "opacity-60")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
