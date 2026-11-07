"use client";

import { Check, Copy, ExternalLink, MessageSquare, MoreHorizontal, Pencil, Share, UserPlus } from "lucide-react";
import Image from "next/image";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { cn } from "@/lib/format";
import { addPerson, markShareSeen, removeComment, renameClient, replyAsAgent, type FormState } from "../../actions";
import { HOME_MESSAGE_TITLE, homeMessage } from "../../message";

// Looking at this page counts as seeing what's on it, so the dashboard stops
// marking the link as new; something that arrives while it's open counts too.
export function MarkSeen({ shareId, latest }: { shareId: string; latest: string | null }) {
  useEffect(() => {
    if (latest) markShareSeen(shareId, latest).catch(() => {});
  }, [shareId, latest]);
  return null;
}

// Coming from "What's new", the comment or home it was about is marked for a
// few seconds, with the home's name above it in view when there's room.
export function ShowTarget() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      const home = target.parentElement?.closest("section");
      if (home && target.getBoundingClientRect().bottom - home.getBoundingClientRect().top < window.innerHeight * 0.9) {
        home.scrollIntoView({ block: "start" });
      }
      target.dataset.target = "";
      clearTimeout(timer);
      timer = setTimeout(() => delete target.dataset.target, 3000);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => {
      window.removeEventListener("hashchange", show);
      clearTimeout(timer);
    };
  }, []);
  return null;
}

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
          className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-stone-700 hover:bg-stone-200/60"
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
        className="min-h-12 rounded-full bg-brand px-5 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="min-h-12 rounded-full px-4 font-medium hover:bg-stone-200/60"
      >
        Cancel
      </button>
    </form>
  );
}

// Whether this browser can hand a link to the phone's own share sheet. Only
// known in the browser, so the page first renders without it.
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const never = () => () => {};

export function SendLink({
  url,
  clientName,
  count,
  home,
  label = "Your link is ready",
  status,
}: {
  url: string;
  clientName: string;
  count: number;
  // The home, when the link has just one: the message names it, in the same
  // words as sending a home from its page.
  home?: { address: string; price: number };
  label?: string;
  // Whether it's been opened, and when.
  status?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const share = useSyncExternalStore(never, canShare, () => false);
  const greeting = clientName ? `Hi ${clientName}, ` : "";
  const one = count === 1 && home;
  const words = `${greeting}${
    one ? homeMessage(home) : `I picked ${count === 1 ? "a home" : `${count} homes`} for you. Tell me what you think.`
  }`;
  const message = `${words} ${url}`;
  const button = "flex min-h-11 items-center justify-center gap-1.5 rounded-full";

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {status && <p className="mt-0.5 text-sm text-stone-600">{status}</p>}
      <input
        ref={field}
        id={id}
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        className="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2.5 text-sm"
      />
      <div className={cn("mt-3 grid gap-2 text-sm font-semibold", share ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        <a href={`sms:?&body=${encodeURIComponent(message)}`} className={cn(button, "bg-brand text-white")}>
          <MessageSquare aria-hidden size={16} /> Text
        </a>
        {/* The phone's share sheet, straight from this tap: WhatsApp, Mail, AirDrop. */}
        {share && (
          <button
            type="button"
            onClick={() => {
              navigator.share({ ...(one && { title: HOME_MESSAGE_TITLE }), text: words, url }).catch(() => {});
            }}
            className={cn(button, "border border-stone-300 hover:bg-stone-50")}
          >
            <Share aria-hidden size={16} /> Share…
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Copying isn't allowed here: the link is selected, ready to copy by hand.
              field.current?.focus();
            }
          }}
          className={cn(button, "border border-stone-300 hover:bg-stone-50")}
        >
          {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className={cn(button, "border border-stone-300 hover:bg-stone-50")}>
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
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
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
        className="min-h-11 rounded-full bg-brand px-5 font-semibold text-white disabled:opacity-50"
      >
        Reply
      </button>
    </form>
  );
}

// Someone else to send the package to, with a link of their own.
export function AddPersonForm({ shareId }: { shareId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPerson.bind(null, shareId), {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <label htmlFor="new-person" className="sr-only">
          Their first name
        </label>
        <input
          id="new-person"
          name="firstName"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="Their first name"
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {state.error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold hover:bg-stone-50 disabled:opacity-60"
      >
        <UserPlus aria-hidden size={16} />
        {pending ? "Adding…" : "Add a person"}
      </button>
    </form>
  );
}

// The spot a comment is about: the photo, small, with a dot where the client
// tapped. Tapped, it opens up so the agent can see exactly where.
export function SpotChip({
  label,
  photo,
  at,
  photoNumber,
  photoCount,
  description,
}: {
  // "Covered porch", or "A spot in photo 2".
  label: string;
  photo: string;
  // Where in the photo, as fractions; none for the photo's subject ("Kitchen").
  at: { x: number; y: number } | null;
  photoNumber: number;
  photoCount: number;
  // What the photo shows, from the listing.
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // The photo is cropped around the spot, which puts the spot at the same
  // place in the crop as in the whole photo.
  const dot = at ? { left: `${at.x * 100}%`, top: `${at.y * 100}%` } : undefined;
  const crop = at ? { objectPosition: `${at.x * 100}% ${at.y * 100}%` } : undefined;
  return (
    <div className="mt-1">
      <button
        type="button"
        data-spot-chip
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-stone-100 p-0.5 pr-3.5 text-left text-[13px] font-semibold text-stone-700 hover:bg-stone-200"
      >
        {/* Square, so a spot near a corner isn't cut off. */}
        <span data-spot-thumb className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-stone-200">
          <Image src={photo} alt="" fill sizes="40px" style={crop} className="object-cover" />
          {dot && (
            <span
              aria-hidden
              data-spot-dot
              style={dot}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
            />
          )}
        </span>
        <span className="min-w-0 truncate">
          <span className="sr-only">About </span>
          {label}
          <span className="sr-only">{open ? ": hide the photo" : ": show it in the photo"}</span>
        </span>
      </button>
      {open && (
        <figure id={id} className="mt-2 w-full max-w-80">
          <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-stone-200">
            <Image
              src={photo}
              alt={description || `Photo ${photoNumber} of ${photoCount}`}
              fill
              sizes="320px"
              style={crop}
              className="object-cover"
            />
            {dot && (
              <span
                aria-hidden
                style={dot}
                className="absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgb(0_0_0/0.25),0_4px_12px_rgb(0_0_0/0.35)]"
              />
            )}
          </div>
          <figcaption className="mt-1 text-xs text-stone-600">
            Photo {photoNumber} of {photoCount}
            {at ? ", where they tapped" : ""}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

// Where focus goes once a comment is gone: the next comment's "…", else the
// one before, else the reply box (or the home itself, once it's removed).
function focusAfter(trigger: HTMLElement | null) {
  const item = trigger?.closest("li");
  const home = item?.closest("section");
  const near = [item?.nextElementSibling, item?.previousElementSibling]
    .map((li) => li?.querySelector<HTMLElement>("[data-comment-menu]"))
    .find(Boolean);
  return near ?? home?.querySelector<HTMLElement>("input[id^='reply-']") ?? home?.querySelector<HTMLElement>("h3") ?? null;
}

// "…" on a comment: removing it, asked once more first.
export function CommentMenu({ commentId, name }: { commentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    setError(false);
    if (refocus) trigger.current?.focus();
  };

  // A tap anywhere else, or Escape, puts it away.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
      setError(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setError(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className="relative -mr-2 -mt-2 shrink-0 self-start"
      // Tabbing out of it puts it away too, so it never covers what has focus.
      onBlur={(event) => {
        if (!open || pending || event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOpen(false);
        setError(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        data-comment-menu
        aria-label={`More for ${name}'s comment`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink aria-expanded:bg-stone-100 aria-expanded:text-ink"
      >
        <MoreHorizontal aria-hidden size={18} />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-labelledby={`${id}-ask`}
          // A tap on its words keeps focus inside it, so it stays open.
          tabIndex={-1}
          className="absolute right-0 top-full z-20 mt-1 w-64 rounded-2xl bg-white p-3 text-sm shadow-lg outline-none ring-1 ring-stone-200"
        >
          <p id={`${id}-ask`}>
            <span className="font-semibold">Remove this comment?</span> Your client won&apos;t see it.
          </p>
          {error && (
            <p role="alert" className="mt-1 text-red-700">
              That didn&apos;t work. Try again.
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              disabled={pending}
              onClick={() => close(true)}
              className="min-h-11 rounded-full px-4 font-semibold text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const next = focusAfter(trigger.current);
                startTransition(async () => {
                  try {
                    await removeComment(commentId);
                  } catch {
                    setError(true);
                    return;
                  }
                  // The comment is going; keep the agent's place in the thread.
                  next?.focus();
                });
              }}
              className="min-h-11 rounded-full bg-red-700 px-4 font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Removing…" : "Remove"}
              <span className="sr-only"> comment from {name}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
