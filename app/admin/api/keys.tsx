"use client";

import { KeyRound } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { agoWords, dayWords, RemoveButton, ShownOnce } from "@/app/people/me/edit/api-parts";
import type { ApiKeySummary } from "@/lib/api/keys";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";
import { makeAdminKey, revokeAdminKeyAction } from "./actions";

// The owner's admin keys: make one (shown once, to copy), and the list of
// those that work, each with Revoke. Built from the same pieces as an
// agent's Connect your tools card. The list is the page's, drawn again after
// every change; all this keeps is what's being typed, and a new key for the
// one time it's shown.
export function AdminKeys({ keys }: { keys: ApiKeySummary[] }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ name: string; key: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="font-semibold outline-none">
        Admin keys
      </h2>
      <p className="mt-1 text-sm text-muted">A key can read and change every account. Keep it secret.</p>

      <form
        aria-labelledby={`${id}-title`}
        noValidate
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            setError(null);
            const result = await makeAdminKey(name).catch(() => ({
              ok: false as const,
              error: "That didn't work. Please try again.",
            }));
            if (!result.ok) return setError(result.error);
            setMade({ name: name.trim(), key: result.key });
            setName("");
          });
        }}
      >
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id={`${id}-name`}
            name="name"
            maxLength={60}
            autoComplete="off"
            placeholder="My script"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
            className={cn(field(), "min-w-0 flex-1 basis-48")}
          />
          <button type="submit" disabled={pending} className={button({ kind: "primary", size: "lg" })}>
            <KeyRound aria-hidden size={18} /> {pending ? "Making…" : "Make a key"}
          </button>
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          What it&apos;s for, so you know which is which.
        </p>
      </form>

      {made && <ShownOnce title={`Your admin key for ${made.name}`} value={made.key} onDone={() => setMade(null)} />}

      {keys.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No admin keys yet.</p>
      ) : (
        <ul aria-label="Your admin keys" className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-x-3 py-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{key.name}</p>
                <p className="font-mono text-sm text-muted">{key.prefix}…</p>
                <p className="text-sm text-muted" suppressHydrationWarning>
                  Made {dayWords(key.created_at)} ·{" "}
                  {key.last_used_at ? `Last used ${agoWords(key.last_used_at)}` : "Never used"}
                </p>
              </div>
              <RemoveButton
                label="Revoke"
                what={`the admin key for ${key.name}`}
                question={`Revoke the admin key for ${key.name}?`}
                detail="Anything using it stops working at once. This can't be undone."
                confirm="Revoke key"
                busy="Revoking…"
                keep="Keep it"
                run={() => revokeAdminKeyAction(key.id)}
                onGone={() => heading.current?.focus()}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
