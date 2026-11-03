"use client";

import { Check, Copy, ExternalLink, MessageSquare, Pencil } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { renameClient, replyAsAgent, type FormState } from "../../actions";

// The client's name as the page title, editable in place.
export function ClientNameEditor({ shareId, name }: { shareId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      const result = await renameClient(shareId, previous, form);
      if (!result.error) setEditing(false);
      return result;
    },
    {},
  );

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl">{name || "Unnamed client"}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-200/60"
        >
          <Pencil aria-hidden size={15} />
          {name ? "Rename" : "Add their name"}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-1 flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <label htmlFor="clientName" className="sr-only">
          Client&apos;s name
        </label>
        <input
          id="clientName"
          name="clientName"
          defaultValue={name}
          required
          maxLength={60}
          autoFocus
          autoComplete="off"
          placeholder="Client's name"
          aria-describedby={state.error ? "clientName-error" : undefined}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 font-display text-2xl outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {state.error && (
          <p id="clientName-error" role="alert" className="mt-1 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="min-h-12 rounded-xl px-4 font-medium">
        Cancel
      </button>
    </form>
  );
}

export function SendLink({
  url,
  clientName,
  count,
}: {
  url: string;
  clientName: string;
  count: number;
}) {
  const [copied, setCopied] = useState(false);
  const greeting = clientName ? `Hi ${clientName}, ` : "";
  const message = `${greeting}I picked ${count === 1 ? "a home" : `${count} homes`} for you. Tell me what you think: ${url}`;

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <label htmlFor="share-url" className="text-sm font-semibold">
        Your link is ready
      </label>
      <input
        id="share-url"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        className="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2.5 text-sm"
      />
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand text-white"
        >
          <MessageSquare aria-hidden size={16} /> Text
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-stone-300"
        >
          {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-stone-300"
        >
          <ExternalLink aria-hidden size={16} /> Preview
        </a>
      </div>
    </div>
  );
}

export function ReplyForm({ shareId, listingKey }: { shareId: string; listingKey: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `reply-${listingKey}`;

  return (
    <form
      className="mt-3 flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        setError(null);
        startTransition(async () => {
          const result = await replyAsAgent(shareId, listingKey, body);
          if (result.error) setError(result.error);
          else setBody("");
        });
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          Reply to your client
        </label>
        <input
          id={inputId}
          value={body}
          maxLength={1000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Reply…"
          className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50"
      >
        Reply
      </button>
    </form>
  );
}
