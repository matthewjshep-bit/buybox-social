"use client";

import { Check, ChevronDown, ChevronRight, Copy, MessageSquare, PenLine, Plus, Share2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  listRecentShares,
  moveQuickShare,
  nameQuickShare,
  newestLinkFor,
  releaseQuickShare,
  reserveSendToken,
  type RecentShare,
} from "@/app/dashboard/actions";
import { HOME_MESSAGE_TITLE, homeMessage } from "@/app/dashboard/message";
import { PeoplePicker, typed, type Chosen } from "@/components/people-picker";
import type { SendHome } from "@/components/reel";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { linkTitle, peopleTitle } from "@/lib/people-picker";
import { button, field } from "@/lib/ui";
import { claim, FAILED, type Sent } from "./quick-send";

// What follows a Send: who it was for, a change of mind, or the slower way.
// Only an agent's page ever loads this, once it has a link to hand out
// (quick-send.tsx), so nobody else downloads it.

const messageFor = (home: SendHome) => homeMessage(home);

// For whatever replaced the button that was just pressed, so the cursor stays in the sheet.
const focusOnMount = (element: HTMLElement | null) => {
  element?.focus();
};

// The sheets' buttons, one above the other, as wide as the sheet.
const primary = button({ kind: "primary", size: "lg", block: true });
const secondary = button({ kind: "secondary", size: "lg", block: true });
// A button that's working on it dims until it's done (it keeps the keyboard).
const busy = (pending: boolean) => pending && "opacity-60";

// The most people one link from Send can be named for.
const MAX_PEOPLE = 6;

// Everyone picked, and whatever's typed but not yet added (a missed Enter
// shouldn't lose a name).
const withTyped = (people: Chosen[], typing: string) =>
  typing.trim() && !people.some((person) => person.key === typed(typing).key) ? [...people, typed(typing)] : people;

// Who a link is for, and a note: both optional, both the agent's to change later.
function WhoFields({
  people,
  onPeople,
  onTyping,
  onPicked,
  note,
  onNote,
}: {
  people: Chosen[];
  onPeople: (people: Chosen[]) => void;
  onTyping: (text: string) => void;
  // Someone was just added to it.
  onPicked?: (person: Chosen) => void;
  note: string;
  onNote: (note: string) => void;
}) {
  const id = useId();
  const [noting, setNoting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <PeoplePicker
        label="Who's it for? (optional)"
        hint="The link is named for them, and greets them by name."
        chosen={people}
        onChange={onPeople}
        onTextChange={onTyping}
        onCommit={onPicked}
        max={MAX_PEOPLE}
      />
      {noting ? (
        <div>
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            Add a note (optional)
          </label>
          <textarea
            id={`${id}-note`}
            // It opened from a tap on "Add a note", which is gone now.
            autoFocus
            rows={3}
            maxLength={500}
            value={note}
            aria-describedby={`${id}-note-hint`}
            onChange={(event) => onNote(event.target.value)}
            className={cn(field({ lines: true }), "mt-1")}
          />
          <p id={`${id}-note-hint`} className="mt-1 text-meta text-muted">
            It shows under the photo on their link.
          </p>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setNoting(true)}
          className={cn(button({ kind: "ghost", flush: true }), "self-start text-brand")}
        >
          <Plus aria-hidden size={16} /> Add a note (optional)
        </button>
      )}
    </div>
  );
}

// "96 Fernhollow Ln and 2 more · Sent 2d ago": which of their links this is.
function linkLine(share: RecentShare) {
  const where = share.firstAddress
    ? `${share.firstAddress}${share.homes > 1 ? ` and ${share.homes - 1} more` : ""}`
    : "No homes on it right now";
  const ago = timeAgo(share.sentAt);
  return `${where} · Sent ${ago === "just now" || !/\d[mhd]$/.test(ago) ? ago : `${ago} ago`}`;
}

// After the share sheet: who it went to, a note, or a change of mind.
export function SentBody({
  sent,
  copiedId,
  onDone,
}: {
  sent: Sent;
  // What the sheet is described by, once the link is copied.
  copiedId: string;
  onDone: (message?: string) => void;
}) {
  const [people, setPeople] = useState<Chosen[]>([]);
  const [typing, setTyping] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A client picked who already has a link from the agent: this home might
  // belong on that one instead.
  const [theirs, setTheirs] = useState<{ person: Chosen; link: RecentShare } | null>(null);
  const [others, setOthers] = useState<RecentShare[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [undo, setUndo] = useState<"ask" | "opened" | "late" | null>(null);
  const router = useRouter();
  // "Keep it" was pressed, so the cursor goes back to "Undo send".
  const [kept, setKept] = useState(false);

  const result = sent.result;
  const failed = Boolean(result && "error" in result);
  const shareId = result && "shareId" in result ? result.shareId : null;

  // The link, once it's made: it may still be on its way when this opens.
  const made = async () => {
    const done = await sent.claim;
    return "shareId" in done ? done.shareId : null;
  };

  if (failed) {
    return (
      <div className="pb-2 text-center">
        <p role="alert" className="text-body font-semibold leading-relaxed text-red-700">
          {sent.copied
            ? "The link you just copied won't open. Tap Send again and use the new one."
            : "The link you just sent won't open. Tap Send again and send the new one."}
        </p>
        <button type="button" onClick={() => onDone()} className={cn(secondary, "mt-4")}>
          Close
        </button>
      </div>
    );
  }

  // Saves who it's for and the note, if any. Then, with `notes`, on to the
  // link as they'll see it, for the agent's take on the home.
  const save = (notes = false) => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      const id = await made();
      if (!id) return;
      const named = withTyped(people, typing);
      let title = "";
      if (named.length > 0 || note.trim()) {
        const saved = await nameQuickShare(id, { people: named.map((person) => person.pick), note }).catch(
          (): { error?: string; names?: string[] } => ({ error: "That didn't save. Try again." }),
        );
        if (saved.error) return setError(saved.error);
        title = peopleTitle(saved.names ?? []);
      }
      if (notes) {
        onDone();
        router.push(`/s/${sent.token}`);
        return;
      }
      onDone(title ? `Saved. Their link greets ${title}.` : undefined);
    });
  };

  const openOthers = () => {
    setShowOthers((shown) => !shown);
    if (others === null) listRecentShares().then(setOthers, () => setOthers([]));
  };

  const moveTo = (target: RecentShare) => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      const id = await made();
      if (!id) return;
      const moved = await moveQuickShare(id, target.id).catch(() => ({ error: "That didn't work. Try again." }));
      if ("error" in moved) return setError(moved.error);
      const whose = moved.clientName ? `${moved.clientName}'s link` : "their link";
      onDone(
        moved.closed
          ? `Added to ${whose}.`
          : `Added to ${whose}. They'd opened the one you sent, so it still works.`,
      );
    });
  };

  const undoSend = () => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      const id = await made();
      if (!id) return;
      const undone = await releaseQuickShare(id).catch(() => null);
      if (!undone) return setError("That didn't work. Try again.");
      if (undone.released) return onDone("Undone. The link has stopped working.");
      setUndo(undone.opened ? "opened" : "late");
    });
  };

  // One of their clients was picked: their newest link, if it isn't this one.
  const picked = (person: Chosen) => {
    if (person.group !== "client") return;
    newestLinkFor(person.pick, shareId ?? undefined).then(
      (link) => {
        if (link) setTheirs({ person, link });
      },
      () => {},
    );
  };

  const recent = (others ?? []).filter((share) => share.id !== shareId).slice(0, 5);
  const dashboardLink = "mx-auto flex min-h-11 items-center gap-1 px-3 text-sm font-semibold";

  return (
    <div className="pb-2">
      {sent.copied && (
        <p
          id={copiedId}
          className="mb-4 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2.5 text-center text-sm font-medium text-emerald-800"
        >
          <Check aria-hidden size={16} className="shrink-0" /> Link copied. Paste it into a text or email.
        </p>
      )}
      <WhoFields
        people={people}
        onPeople={(next) => {
          setPeople(next);
          // Taken off again: no question about their other link.
          if (theirs && !next.some((person) => person.key === theirs.person.key)) setTheirs(null);
        }}
        onTyping={setTyping}
        onPicked={picked}
        note={note}
        onNote={setNote}
      />
      {theirs && (
        <div role="group" aria-label={`${theirs.person.name}'s other link`} className="mt-3 rounded-2xl bg-stone-50 p-3 text-sm">
          <p>
            {theirs.person.name} already has a link from you ({theirs.link.homes}{" "}
            {theirs.link.homes === 1 ? "home" : "homes"}).
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1">
            <button
              type="button"
              onClick={() => moveTo(theirs.link)}
              aria-disabled={pending}
              className={cn(button({ kind: "ghost", flush: true }), "font-semibold text-brand", busy(pending))}
            >
              Add this home to it
            </button>
            <span aria-hidden className="text-stone-400">
              ·
            </span>
            <button
              type="button"
              onClick={() => setTheirs(null)}
              className={cn(button({ kind: "ghost" }), "text-stone-700")}
            >
              Keep a new link
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2.5">
        <button type="button" onClick={() => save()} aria-disabled={pending} className={cn(primary, busy(pending))}>
          Save
        </button>
        {/* What they'll read first when they open it: a note or a like from
            the agent on the price, a room, anything. */}
        <button type="button" onClick={() => save(true)} aria-disabled={pending || !shareId} className={cn(secondary, busy(pending))}>
          <PenLine aria-hidden size={16} /> Add your take
        </button>
        <button type="button" onClick={() => onDone()} className={secondary}>
          Skip
        </button>
        {/* There from the start, so nothing under the thumb moves when the link
            is made (on a slow connection that can take a moment). */}
        {shareId ? (
          <Link href={`/dashboard/shares/${shareId}`} className={cn(dashboardLink, "text-brand")}>
            Open in your dashboard <ChevronRight aria-hidden size={16} />
          </Link>
        ) : (
          <span role="link" aria-disabled="true" className={cn(dashboardLink, "text-stone-400")}>
            Open in your dashboard <ChevronRight aria-hidden size={16} />
          </span>
        )}
      </div>

      <div className="mt-2 border-t border-stone-100 pt-1">
        <button
          type="button"
          aria-expanded={showOthers}
          onClick={openOthers}
          className="flex min-h-11 w-full items-center justify-between gap-2 py-1 text-left text-sm font-semibold"
        >
          Meant for someone you&apos;ve already sent homes to?
          <ChevronDown
            aria-hidden
            size={18}
            className={cn("shrink-0 text-stone-500 transition-transform", showOthers && "rotate-180")}
          />
        </button>
        {showOthers && (
          <div className="pb-2">
            {others === null ? (
              <p role="status" className="py-2 text-sm text-muted">
                Finding your clients…
              </p>
            ) : recent.length === 0 ? (
              <p className="py-2 text-sm text-muted">No other clients yet.</p>
            ) : (
              <>
                {/* Read before the tap, not after it. */}
                <p className="text-meta leading-relaxed text-muted">
                  Their link will show this home. The link you just sent will stop working.
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {recent.map((share) => (
                    <li key={share.id}>
                      <button
                        type="button"
                        onClick={() => moveTo(share)}
                        aria-disabled={pending}
                        className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-stone-50 px-4 py-2.5 text-left hover:bg-stone-100"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-medium">
                            {linkTitle(share.clientName, share.firstAddress)} · {share.homes}{" "}
                            {share.homes === 1 ? "home" : "homes"}
                          </span>
                          <span className="block truncate text-meta text-muted">{linkLine(share)}</span>
                        </span>
                        <ChevronRight aria-hidden size={18} className="shrink-0 text-stone-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-stone-100 pt-2 text-center">
        {undo === null && (
          <button
            type="button"
            autoFocus={kept}
            onClick={() => setUndo("ask")}
            className={cn(button({ kind: "ghost" }), "text-stone-700")}
          >
            <Undo2 aria-hidden size={16} /> Undo send
          </button>
        )}
        {undo === "ask" && (
          <>
            <p className="pt-1 text-sm text-stone-700">The link will stop working.</p>
            <div className="mt-2 flex justify-center gap-2">
              <button
                type="button"
                // The button that asked is gone, so the cursor comes here.
                autoFocus
                onClick={undoSend}
                aria-disabled={pending}
                className={cn(button({ kind: "neutral" }), busy(pending))}
              >
                Undo send
              </button>
              <button
                type="button"
                onClick={() => {
                  setUndo(null);
                  setKept(true);
                }}
                className={cn(button({ kind: "ghost" }), "text-stone-700")}
              >
                Keep it
              </button>
            </div>
          </>
        )}
        {undo && undo !== "ask" && (
          // The buttons are gone, so the cursor comes to the answer.
          <p ref={focusOnMount} tabIndex={-1} className="py-2 text-sm text-stone-700 outline-none">
            {undo === "opened" ? "They've opened it." : "It's been too long to undo here."} You can remove the home from
            your dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

// The slower way: make the link first, then send it with a fresh tap.
export function DraftBody({ home, onNextToken }: { home: SendHome; onNextToken: (token: string) => void }) {
  const id = useId();
  const [people, setPeople] = useState<Chosen[]>([]);
  const [typing, setTyping] = useState("");
  const [note, setNote] = useState("");
  // The link, once it's made, and how many people it was named for.
  const [link, setLink] = useState<{ url: string; shareId: string; people: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  // Shown only after a tap, so the browser is there to ask.
  const [phone] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [canShare] = useState(() => typeof navigator.share === "function");
  const facts = [
    home.beds != null && `${home.beds} bd`,
    home.baths != null && `${home.baths} ba`,
    home.sqft && `${home.sqft.toLocaleString("en-US")} sq ft`,
    home.city,
  ]
    .filter(Boolean)
    .join(" · ");

  const create = () => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      const failed = "That link didn't save. Try again.";
      const reserved = await reserveSendToken().catch(() => null);
      if (!reserved || !("token" in reserved)) return setError(failed);
      const made = await claim({ token: reserved.token, listingKey: home.listingKey });
      if (!("shareId" in made)) return setError(made.error === FAILED ? failed : made.error);
      onNextToken(made.nextToken);
      const named = withTyped(people, typing);
      let count = 0;
      if (named.length > 0 || note.trim()) {
        const saved = await nameQuickShare(made.shareId, { people: named.map((person) => person.pick), note }).catch(
          (): { error?: string; names?: string[] } => ({ error: failed }),
        );
        if (saved.error) setError(saved.error);
        count = saved.names?.length ?? 0;
      }
      setLink({ url: `${window.location.origin}/s/${reserved.token}`, shareId: made.shareId, people: count });
    });
  };

  const message = link ? `${messageFor(home)} ${link.url}` : "";

  return (
    <div className="pb-2">
      <div className="rounded-2xl bg-stone-50 p-4">
        <p className="font-display text-xl">{formatPrice(home.price)}</p>
        <p className="truncate font-medium">{home.address}</p>
        <p className="truncate text-sm text-muted">{facts}</p>
      </div>
      {link ? (
        <div className="mt-4">
          <label htmlFor={`${id}-link`} className="text-sm font-semibold">
            Your link is ready
          </label>
          <input
            id={`${id}-link`}
            // The form that made it is gone, so the cursor comes to the link.
            ref={focusOnMount}
            readOnly
            value={link.url}
            onFocus={(event) => event.target.select()}
            className={cn(field({ quiet: true }), "mt-2")}
          />
          {link.people >= 2 && (
            <p className="mt-2 text-meta text-muted">Each person also has their own link in your dashboard.</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(link.url).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () => setError("That didn't copy. Press and hold the link to copy it."),
                )
              }
              className={primary}
            >
              {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            {phone && (
              <a href={`sms:?&body=${encodeURIComponent(message)}`} className={secondary}>
                <MessageSquare aria-hidden size={18} /> Text
              </a>
            )}
            {canShare && (
              <button
                type="button"
                onClick={() =>
                  navigator.share({ title: HOME_MESSAGE_TITLE, text: messageFor(home), url: link.url }).catch(() => {})
                }
                className={secondary}
              >
                <Share2 aria-hidden size={18} /> Share…
              </button>
            )}
            <Link
              href={`/dashboard/shares/${link.shareId}`}
              className="mx-auto flex min-h-11 items-center gap-1 px-3 text-sm font-semibold text-brand"
            >
              Open in your dashboard <ChevronRight aria-hidden size={16} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <WhoFields people={people} onPeople={setPeople} onTyping={setTyping} note={note} onNote={setNote} />
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-1">
            <button
              type="button"
              onClick={create}
              aria-disabled={pending}
              className={cn(primary, busy(pending))}
            >
              {pending ? "Creating…" : "Create link"}
            </button>
            <Link
              href={`/dashboard/new?home=${encodeURIComponent(home.listingKey)}`}
              className="mx-auto flex min-h-11 items-center gap-1 px-3 text-sm font-semibold text-brand"
            >
              More homes or people <ChevronRight aria-hidden size={16} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
