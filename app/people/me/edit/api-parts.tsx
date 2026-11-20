"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { cn, whenWords } from "@/lib/format";
import { button, field } from "@/lib/ui";

// The pieces Connect your tools (api-card.tsx) is made of more than once: a
// secret shown the one time it can be, a Remove that asks first, and when
// something happened, in words.

// When, in words: "just now", "5 min ago", "3 hours ago", then "yesterday",
// "4 days ago", "Nov 7" (as lib/format says the days). Said in the browser,
// so it can be a minute out from the page as it was drawn: a page using it
// lets that pass (suppressHydrationWarning).
export function agoWords(at: Date | string, now = Date.now()) {
  const date = new Date(at);
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return whenWords(date, now);
}

// A day: "Nov 7", or "Nov 7, 2025" from another year. (Pacific, as the
// homes' days are everywhere else.)
export function dayWords(at: Date | string) {
  const date = new Date(at);
  const zone = "America/Los_Angeles";
  const year = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", timeZone: zone });
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: year(date) === year(new Date()) ? undefined : "numeric",
    timeZone: zone,
  });
}

// A key, or a webhook's signing secret, the one time it's shown: in a box to
// select, with Copy, and said plainly that it won't be shown again. Done
// puts it away. It takes focus as it appears, so whoever just made it (with
// a screen reader too) lands on it rather than having to find it.
export function ShownOnce({ title, value, children, onDone }: { title: string; value: string; children?: ReactNode; onDone: () => void }) {
  const id = useId();
  const heading = useRef<HTMLParagraphElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    heading.current?.focus();
  }, [value]);
  return (
    <div role="group" aria-labelledby={`${id}-title`} className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <p id={`${id}-title`} ref={heading} tabIndex={-1} className="text-body font-semibold text-ink outline-none">
        {title}
      </p>
      {children && <p className="mt-1 text-meta text-stone-700">{children}</p>}
      <input
        ref={box}
        readOnly
        value={value}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-once`}
        spellCheck={false}
        autoComplete="off"
        onFocus={(event) => event.currentTarget.select()}
        className={cn(field(), "mt-3 font-mono text-sm")}
      />
      <p id={`${id}-once`} className="mt-2 text-body font-semibold text-amber-900">
        Copy it now. You won&apos;t see it again.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setFailed(false);
              setCopied(true);
            } catch {
              // Some browsers won't let a page copy: it's selected instead,
              // ready for their own Copy.
              setFailed(true);
              box.current?.focus();
            }
          }}
          className={button({ kind: "primary", size: "lg" })}
        >
          {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
        <button type="button" onClick={onDone} className={button({ kind: "secondary", size: "lg" })}>
          Done
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          We couldn&apos;t copy it. It&apos;s selected in the box: copy it from there.
        </p>
      )}
    </div>
  );
}

// Revoke a key, Remove a webhook: a quiet button that asks once more, right
// there, before anything goes, in the same red box the link page uses to
// take someone off a link. `onGone`: once it has gone, where focus goes
// (the row it was in is about to disappear).
export function RemoveButton({
  label,
  what,
  question,
  detail,
  confirm,
  busy,
  keep,
  icon,
  run,
  onGone,
}: {
  label: string;
  // Which one, for a screen reader: the button's word alone doesn't say.
  what: string;
  question: string;
  detail: string;
  confirm: string;
  // Said on the button while it goes: "Revoking…".
  busy: string;
  keep: string;
  icon?: ReactNode;
  run: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onGone: () => void;
}) {
  const id = useId();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ask = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) ask.current?.focus();
  }, [asking]);
  if (!asking) {
    return (
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setError(null);
          setAsking(true);
        }}
        className={cn(button({ kind: "ghost" }), "shrink-0 text-stone-700")}
      >
        {icon}
        {label}
        <span className="sr-only"> {what}</span>
      </button>
    );
  }
  return (
    <div role="group" aria-labelledby={`${id}-ask`} className="mt-2 w-full rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
      <p id={`${id}-ask`} ref={ask} tabIndex={-1} className="text-sm outline-none">
        <span className="font-semibold">{question}</span> {detail}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-disabled={pending}
          onClick={() => {
            if (pending) return;
            startTransition(async () => {
              const result = await run().catch(() => ({ ok: false as const, error: "That didn't work. Try again." }));
              if (!result.ok) return setError(result.error);
              onGone();
            });
          }}
          className={button({ kind: "danger" })}
        >
          {pending ? busy : confirm}
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            requestAnimationFrame(() => opener.current?.focus());
          }}
          className={button({ kind: "secondary" })}
        >
          {keep}
        </button>
      </div>
    </div>
  );
}
