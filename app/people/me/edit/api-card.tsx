"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import type { ApiKeySummary } from "@/lib/api/keys";
import type { WebhookEvent, WebhookSummary } from "@/lib/api/webhooks";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";
import { addWebhook, makeApiKey, removeWebhook, revokeKey, testWebhook, turnWebhookOn } from "./api-actions";
import { agoWords, dayWords, RemoveButton, ShownOnce } from "./api-parts";

// Connect your tools, on an agent's Edit profile: their API keys (one for
// each tool that works as them: a CRM, Zapier, Make) and their webhooks
// (addresses those tools gave them, told the moment a client does
// something). The lists are the page's, drawn again after every change; all
// this keeps is what's being typed, and a new key or secret for the one time
// it's shown.
export function ApiCard({ keys, webhooks }: { keys: ApiKeySummary[]; webhooks: WebhookSummary[] }) {
  return (
    <>
      <ApiKeys keys={keys} />
      <Webhooks webhooks={webhooks} />
    </>
  );
}

function ApiKeys({ keys }: { keys: ApiKeySummary[] }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The key just made, for the one time it can be shown.
  const [made, setMade] = useState<{ name: string; key: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-5 border-t border-stone-200 pt-5">
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-body font-semibold text-ink outline-none">
        API keys
      </h3>
      <p className="mt-1 text-meta text-muted">A key lets one tool work as you. Make one for each tool.</p>

      <form
        aria-labelledby={`${id}-title`}
        noValidate
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            setError(null);
            const result = await makeApiKey(name).catch(() => ({
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
            placeholder="GoHighLevel"
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
          The tool it&apos;s for, so you know which is which.
        </p>
      </form>

      {made && (
        <ShownOnce title={`Your key for ${made.name}`} value={made.key} onDone={() => setMade(null)}>
          Paste it into {made.name} where it asks for an API key.
        </ShownOnce>
      )}

      {keys.length === 0 ? (
        <p className="mt-4 text-body text-muted">No keys yet.</p>
      ) : (
        <ul aria-label="Your API keys" className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-x-3 py-3">
              <div className="min-w-0">
                <p className="break-words text-body font-semibold text-ink">{key.name}</p>
                <p className="font-mono text-meta text-muted">{key.prefix}…</p>
                <p className="text-meta text-muted" suppressHydrationWarning>
                  Made {dayWords(key.created_at)} ·{" "}
                  {key.last_used_at ? `Last used ${agoWords(key.last_used_at)}` : "Never used"}
                </p>
              </div>
              <RemoveButton
                label="Revoke"
                what={`the key for ${key.name}`}
                question={`Revoke the key for ${key.name}?`}
                detail="Anything using it stops working at once. This can't be undone."
                confirm="Revoke key"
                busy="Revoking…"
                keep="Keep it"
                run={() => revokeKey(key.id)}
                onGone={() => heading.current?.focus()}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// What a webhook can be told, as the agent reads it, in the order the boxes
// are ticked. (A Record, so a new event can't be left without words.)
const EVENT_WORDS: Record<WebhookEvent, string> = {
  "link.opened": "Opened a link",
  "home.liked": "Liked a home",
  "home.passed": "Passed on a home",
  "comment.created": "Commented",
  "showing.requested": "Asked to see a home",
};
const ALL_EVENTS = Object.keys(EVENT_WORDS) as WebhookEvent[];

function Webhooks({ webhooks }: { webhooks: WebhookSummary[] }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(ALL_EVENTS);
  const [error, setError] = useState<{ text: string; field?: "url" | "events" } | null>(null);
  // The new webhook's signing secret, for the one time it can be shown.
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const urlWrong = error?.field === "url";
  const eventsWrong = error?.field === "events";
  // Anything not about one of the two (too many webhooks already, say).
  const otherWrong = error && !error.field;
  return (
    <div className="mt-6 border-t border-stone-200 pt-5">
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-body font-semibold text-ink outline-none">
        Webhooks
      </h3>
      <p className="mt-1 text-meta text-muted">Porchcard tells your tool the moment a client does something.</p>

      <form
        aria-labelledby={`${id}-title`}
        noValidate
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            setError(null);
            const result = await addWebhook(url, events).catch(() => ({
              ok: false as const,
              error: "That didn't work. Please try again.",
              field: undefined,
            }));
            if (!result.ok) return setError({ text: result.error, field: result.field });
            setSecret(result.secret);
            setUrl("");
            setEvents(ALL_EVENTS);
          });
        }}
      >
        <div>
          <label htmlFor={`${id}-url`} className="text-sm font-medium">
            Address to send to
          </label>
          <input
            id={`${id}-url`}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={urlWrong || undefined}
            aria-describedby={urlWrong ? `${id}-error ${id}-url-hint` : `${id}-url-hint`}
            className={cn(field(), "mt-1")}
          />
          {urlWrong && (
            <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">
              {error.text}
            </p>
          )}
          <p id={`${id}-url-hint`} className="mt-1 text-sm text-muted">
            Your tool gives you this. It starts with https://
          </p>
        </div>
        <fieldset aria-describedby={eventsWrong ? `${id}-events-error` : undefined}>
          <legend className="text-sm font-medium">Tell it when a client has</legend>
          <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
            {ALL_EVENTS.map((event) => (
              <label key={event} className="flex min-h-11 cursor-pointer items-center gap-3 text-body">
                <input
                  type="checkbox"
                  name="events"
                  value={event}
                  checked={events.includes(event)}
                  onChange={(change) =>
                    setEvents((now) =>
                      change.target.checked
                        ? ALL_EVENTS.filter((one) => one === event || now.includes(one))
                        : now.filter((one) => one !== event),
                    )
                  }
                  className="size-5 accent-brand"
                />
                {EVENT_WORDS[event]}
              </label>
            ))}
          </div>
          {eventsWrong && (
            <p id={`${id}-events-error`} role="alert" className="mt-1 text-sm text-red-700">
              {error.text}
            </p>
          )}
        </fieldset>
        {otherWrong && (
          <p role="alert" className="text-sm text-red-700">
            {error.text}
          </p>
        )}
        <div>
          <button type="submit" disabled={pending} className={button({ kind: "primary", size: "lg" })}>
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {secret && (
        <ShownOnce title="Your webhook's signing secret" value={secret} onDone={() => setSecret(null)}>
          Your tool uses it to check that what it&apos;s sent came from Porchcard.
        </ShownOnce>
      )}

      {webhooks.length === 0 ? (
        <p className="mt-4 text-body text-muted">No webhooks yet.</p>
      ) : (
        <ul aria-label="Your webhooks" className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
          {webhooks.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} onGone={() => heading.current?.focus()} />
          ))}
        </ul>
      )}
    </div>
  );
}

// How its last send went: "Delivered 2 min ago", or that it failed and why.
// A test says it was one.
function lastWords(last: NonNullable<WebhookSummary["last_delivery"]>) {
  const test = last.event === "ping";
  const when = agoWords(last.at);
  if (last.ok) return `${test ? "Test delivered" : "Delivered"} ${when}`;
  const why = last.error ?? (last.status ? `It answered ${last.status}.` : "No answer.");
  return `${test ? "Test failed" : "Failed"} ${when}: ${why}`;
}

function WebhookRow({ webhook, onGone }: { webhook: WebhookSummary; onGone: () => void }) {
  const paused = webhook.disabled_at !== null;
  // How the test just sent went, said right here until the next one.
  const [tested, setTested] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [turning, startTurn] = useTransition();
  const all = ALL_EVENTS.every((event) => webhook.events.includes(event));
  return (
    <li className="py-3">
      <p className="break-all text-body font-semibold text-ink">{webhook.url}</p>
      <p className="mt-0.5 text-meta text-muted">
        {all ? "Everything a client does" : webhook.events.map((event) => EVENT_WORDS[event]).join(", ")}
      </p>
      {paused && <p className="mt-1 text-meta font-semibold text-amber-900">Paused after failures</p>}
      <p
        className={cn(
          "mt-0.5 text-meta",
          webhook.last_delivery && !webhook.last_delivery.ok ? "text-red-700" : "text-muted",
        )}
        suppressHydrationWarning
      >
        {webhook.last_delivery ? lastWords(webhook.last_delivery) : "Nothing sent yet"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {paused && (
          <button
            type="button"
            disabled={turning}
            onClick={() =>
              startTurn(async () => {
                setError(null);
                const result = await turnWebhookOn(webhook.id).catch(() => ({
                  ok: false as const,
                  error: "That didn't work. Please try again.",
                }));
                if (!result.ok) setError(result.error);
              })
            }
            className={button({ kind: "primary" })}
          >
            {turning ? "Turning on…" : "Turn back on"}
          </button>
        )}
        <button
          type="button"
          disabled={testing}
          onClick={() =>
            startTest(async () => {
              setError(null);
              setTested(null);
              const result = await testWebhook(webhook.id).catch(() => ({
                ok: false as const,
                error: "That didn't work. Please try again.",
              }));
              if (!result.ok) return setError(result.error);
              const { delivery } = result;
              setTested(
                delivery.ok
                  ? { ok: true, text: "The test got there." }
                  : {
                      ok: false,
                      text: `The test didn't get there. ${delivery.error ?? (delivery.status ? `It answered ${delivery.status}.` : "")}`.trim(),
                    },
              );
            })
          }
          className={button({ kind: "secondary" })}
        >
          {testing ? "Sending…" : "Send test"}
        </button>
        <RemoveButton
          label="Remove"
          what={`the webhook for ${webhook.url}`}
          question="Remove this webhook?"
          detail="Your tool won't be told about anything from now on."
          confirm="Remove webhook"
          busy="Removing…"
          keep="Keep it"
          icon={<Trash2 aria-hidden size={15} />}
          run={() => removeWebhook(webhook.id)}
          onGone={onGone}
        />
      </div>
      <div aria-live="polite">
        {tested && (
          <p className={cn("mt-1 text-sm font-semibold", tested.ok ? "text-emerald-700" : "text-red-700")}>
            {tested.text}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
