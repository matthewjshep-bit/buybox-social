"use client";

import { Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import type { ProfileLink } from "@/lib/profile";
import { button, field } from "@/lib/ui";
import { saveAbout } from "./actions";

const BIO_MOST = 300;
const LINKS_MOST = 5;

// What you say about yourself, and (an agent) your links. On a page of its
// own (`done`: where Save and Cancel go back to), it's open from the start;
// elsewhere, closed, it's one button: Edit, or Add a few words.
export function EditAbout({
  bio,
  links,
  agent,
  done,
}: {
  bio: string;
  links: ProfileLink[];
  agent: boolean;
  done?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(done));
  const [text, setText] = useState(bio);
  const [rows, setRows] = useState<ProfileLink[]>(links.length ? links : done && agent ? [{ label: "", url: "" }] : links);
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
        {empty ? (agent ? "Add a bio and links" : "Add a bio") : "Edit"}
      </button>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveAbout(text, rows);
      if (!result.ok) return setError(result.error);
      if (done) router.push(done);
      else setOpen(false);
    });
  const setRow = (i: number, next: Partial<ProfileLink>) =>
    setRows((now) => now.map((row, j) => (j === i ? { ...row, ...next } : row)));

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
        <label htmlFor={`${id}-bio`} className="text-sm font-semibold">
          About you
        </label>
        <textarea
          id={`${id}-bio`}
          value={text}
          maxLength={BIO_MOST}
          rows={3}
          autoFocus={!done}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            agent
              ? "Helping first-time buyers on the Eastside since 2015."
              : "Looking for a craftsman near a park."
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
    </form>
  );
}
