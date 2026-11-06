"use client";

import { Check, ChevronDown, ChevronRight, Copy, MessageSquare, Plus, Send, Share2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type ComponentProps, type RefObject } from "react";
import {
  claimQuickShare,
  listRecentShares,
  moveQuickShare,
  nameQuickShare,
  releaseQuickShare,
  reserveSendToken,
  type ClaimResult,
  type RecentShare,
} from "@/app/dashboard/actions";
import { ReelFeed, type SendHome } from "@/components/reel";
import { Sheet } from "@/components/sheet";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";

// Send, for agents: on any home, one tap opens the phone's share sheet with a
// link to just that home, made for one client, then asks who it was for.

const FAILED = "That link didn't save. Tap Send again.";

const messageFor = (home: SendHome) =>
  `I picked a home for you: ${home.address}, ${formatPrice(home.price)}. Tell me what you think.`;

export const sendHomeFrom = (listing: Listing): SendHome => ({
  listingKey: listing.ListingKey,
  address: listing.UnparsedAddress,
  city: listing.City,
  price: listing.ListPrice,
  beds: listing.BedroomsTotal ?? null,
  baths: listing.BathroomsTotalInteger ?? null,
  sqft: listing.LivingArea ?? null,
});

// A phone or tablet, where Send opens the share sheet. Anywhere else it copies.
const touchScreen = () =>
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

// Asks once more if the first try never reached the server: the same link for
// the same home comes back the same, so a retry can't make a second one.
const claim = (input: { token: string; listingKey: string }) =>
  claimQuickShare(input)
    .catch(() => claimQuickShare(input))
    .catch((): ClaimResult => ({ error: FAILED }));

const action = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 font-semibold";
const primary = "bg-brand text-white hover:bg-brand/90";
const secondary = "bg-stone-100 text-ink hover:bg-stone-200";
const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

type Sent = { n: number; home: SendHome; claim: Promise<ClaimResult>; copied: boolean };

// Everything Send needs on a page: the link waiting for the next tap, and the
// sheets and messages that follow it. `ui` goes anywhere on the page.
export function useQuickSend({
  profileComplete,
  anchor,
}: {
  profileComplete: boolean;
  // What the sheets rise over: the map's pane, say. The whole screen otherwise.
  anchor?: RefObject<HTMLElement | null>;
}) {
  // The next link to hand out, made by the server before the tap, so nothing
  // has to be waited for once it comes.
  const token = useRef<string | null>(null);
  // Between one Send and the link for the next.
  const [waiting, setWaiting] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  // "Send this home": the slower way, when one tap can't do it.
  const [draft, setDraft] = useState<SendHome | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sends = useRef(0);

  const say = (message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // One link per page, so two open tabs never hold the same one.
  useEffect(() => {
    if (!profileComplete) return;
    let live = true;
    reserveSendToken().then(
      (result) => {
        if (live && "token" in result) token.current = result.token;
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [profileComplete]);

  const refill = () =>
    reserveSendToken()
      .then((result) => {
        if ("token" in result) token.current = result.token;
      })
      .catch(() => {})
      .finally(() => setWaiting(false));

  const send = (home: SendHome) => {
    if (!profileComplete) return setNeedsProfile(true);
    const ready = token.current;
    const phone = touchScreen();
    if (!ready || (!phone && !navigator.clipboard)) return setDraft(home);
    const url = `${window.location.origin}/s/${ready}`;
    const text = messageFor(home);
    // In the same tap, before anything is waited for: a phone opens its share
    // sheet only straight after a tap.
    let handed: Promise<void>;
    try {
      handed = phone
        ? navigator.share({ title: "A home for you", text, url })
        : navigator.clipboard.writeText(`${text} ${url}`);
    } catch (error) {
      handed = Promise.reject(error);
    }
    // At the same moment the link is made for this home; the next Send gets a new one.
    token.current = null;
    setWaiting(true);
    const made = claim({ token: ready, listingKey: home.listingKey });
    made.then((result) => {
      if (!("nextToken" in result)) return refill();
      token.current = result.nextToken;
      setWaiting(false);
    });
    handed.then(
      () => setSent({ n: ++sends.current, home, claim: made, copied: !phone }),
      async (error: unknown) => {
        // Not sent after all, so the link goes again once it's been made.
        const result = await made;
        if ("shareId" in result) await releaseQuickShare(result.shareId).catch(() => {});
        if (error instanceof DOMException && error.name === "AbortError") say("Not sent");
        // The share sheet or the clipboard said no: the slower way, one tap at a time.
        else setDraft(home);
      },
    );
  };

  const ui = (
    <>
      <Sheet
        open={Boolean(sent)}
        onClose={() => setSent(null)}
        label="Sent. Who's it for?"
        title="Sent. Who's it for?"
        anchor={anchor}
      >
        {sent && (
          <SentBody
            key={sent.n}
            sent={sent}
            onDone={(message) => {
              setSent(null);
              if (message) say(message);
            }}
          />
        )}
      </Sheet>
      <Sheet open={Boolean(draft)} onClose={() => setDraft(null)} label="Send this home" title="Send this home" anchor={anchor}>
        {draft && (
          <DraftBody
            key={draft.listingKey}
            home={draft}
            // The link it was given for the next Send, if this page has none.
            onNextToken={(next) => {
              token.current ??= next;
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={needsProfile}
        onClose={() => setNeedsProfile(false)}
        label="Before you send"
        title="Before you send"
        anchor={anchor}
      >
        <div className="pb-2 text-center">
          <p className="text-[15px] leading-relaxed text-stone-700">
            Add your name and photo first so clients know it&apos;s from you.
          </p>
          <Link href="/dashboard/profile" className={cn(action, primary, "mt-4")}>
            Add your name and photo
          </Link>
        </div>
      </Sheet>
      {toast && (
        <p
          role="status"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto w-fit max-w-md rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-ink shadow-lg"
        >
          {toast}
        </p>
      )}
    </>
  );

  return { send, waiting, ui };
}

// The reel, for a signed-in agent: its share button sends the home to a client.
export function QuickSendReel({
  profileComplete,
  ...reel
}: Omit<ComponentProps<typeof ReelFeed>, "onSend"> & { profileComplete: boolean }) {
  const quick = useQuickSend({ profileComplete });
  return (
    <>
      <ReelFeed {...reel} onSend={quick.send} />
      {quick.ui}
    </>
  );
}

// Beside the map, where the homes have no buttons of their own: a pill over
// them that sends the one showing. Hidden while there's none to send.
export function SendThisHome({
  home,
  profileComplete,
  anchor,
}: {
  home: SendHome | null;
  profileComplete: boolean;
  anchor?: RefObject<HTMLElement | null>;
}) {
  const quick = useQuickSend({ profileComplete, anchor });
  return (
    <>
      {home && (
        <button
          type="button"
          // Stays where it is while the next link comes, so the cursor isn't lost.
          aria-disabled={quick.waiting}
          onClick={() => {
            if (!quick.waiting) quick.send(home);
          }}
          className={cn(
            "absolute left-3 top-3 z-30 flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-lg ring-1 ring-black/5 hover:bg-stone-50",
            quick.waiting && "cursor-progress opacity-70",
          )}
        >
          <Send aria-hidden size={16} />
          {quick.waiting ? "Getting a new link…" : "Send this home"}
        </button>
      )}
      {quick.ui}
    </>
  );
}

// Who a link is for, and a note: both optional, both the agent's to change later.
function WhoFields({
  name,
  onName,
  note,
  onNote,
}: {
  name: string;
  onName: (name: string) => void;
  note: string;
  onNote: (note: string) => void;
}) {
  const id = useId();
  const [noting, setNoting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Their first name (optional)
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={40}
          autoComplete="off"
          aria-describedby={`${id}-name-hint`}
          onChange={(event) => onName(event.target.value)}
          className={cn(inputClass, "mt-1")}
        />
        <p id={`${id}-name-hint`} className="mt-1 text-[13px] text-stone-600">
          For your dashboard. The link greets them by name.
        </p>
      </div>
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
            className={cn(inputClass, "mt-1 resize-y")}
          />
          <p id={`${id}-note-hint`} className="mt-1 text-[13px] text-stone-600">
            It shows under the photo on their link.
          </p>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setNoting(true)}
          className="flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-brand"
        >
          <Plus aria-hidden size={16} /> Add a note (optional)
        </button>
      )}
    </div>
  );
}

// After the share sheet: who it went to, a note, or a change of mind.
function SentBody({ sent, onDone }: { sent: Sent; onDone: (message?: string) => void }) {
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [others, setOthers] = useState<RecentShare[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [undo, setUndo] = useState<"ask" | "opened" | "late" | null>(null);

  useEffect(() => {
    let live = true;
    sent.claim.then((made) => {
      if (live) setResult(made);
    });
    return () => {
      live = false;
    };
  }, [sent.claim]);

  const shareId = result && "shareId" in result ? result.shareId : null;
  // The link, once it's made: it may still be on its way when this opens.
  const made = async () => {
    const done = await sent.claim;
    return "shareId" in done ? done.shareId : null;
  };

  if (result && "error" in result) {
    return (
      <div className="pb-2 text-center">
        <p role="alert" className="text-[15px] font-semibold text-red-700">
          {FAILED}
        </p>
        <button type="button" onClick={() => onDone()} className={cn(action, secondary, "mt-4")}>
          Close
        </button>
      </div>
    );
  }

  const save = () => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      const id = await made();
      if (!id) return;
      const clientName = name.trim();
      if (clientName || note.trim()) {
        const saved = await nameQuickShare(id, { clientName, note }).catch(() => ({ error: "That didn't save. Try again." }));
        if (saved.error) return setError(saved.error);
      }
      onDone(clientName ? `Saved. Their link greets ${clientName}.` : undefined);
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
      onDone(
        moved.closed
          ? `Added to ${moved.clientName}'s link.`
          : `Added to ${moved.clientName}'s link. They'd opened the one you sent, so it still works.`,
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

  const recent = (others ?? []).filter((share) => share.id !== shareId).slice(0, 5);

  return (
    <div className="pb-2">
      {sent.copied && (
        <p
          role="status"
          className="mb-4 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2.5 text-center text-sm font-medium text-emerald-800"
        >
          <Check aria-hidden size={16} className="shrink-0" /> Link copied. Paste it into a text or email.
        </p>
      )}
      <WhoFields name={name} onName={setName} note={note} onNote={setNote} />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2.5">
        <button type="button" onClick={save} aria-disabled={pending} className={cn(action, primary, pending && "opacity-60")}>
          Save
        </button>
        <button type="button" onClick={() => onDone()} className={cn(action, secondary)}>
          Skip
        </button>
        {shareId && (
          <Link
            href={`/dashboard/shares/${shareId}`}
            className="mx-auto flex min-h-11 items-center gap-1 px-3 text-sm font-semibold text-brand"
          >
            Open in your dashboard <ChevronRight aria-hidden size={16} />
          </Link>
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
              <p role="status" className="py-2 text-sm text-stone-600">
                Finding your clients…
              </p>
            ) : recent.length === 0 ? (
              <p className="py-2 text-sm text-stone-600">No other clients yet.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {recent.map((share) => (
                    <li key={share.id}>
                      <button
                        type="button"
                        onClick={() => moveTo(share)}
                        aria-disabled={pending}
                        className="flex min-h-11 w-full items-center rounded-2xl bg-stone-50 px-4 py-2 text-left text-[15px] font-medium hover:bg-stone-100"
                      >
                        <span className="truncate">
                          {share.clientName} · {share.homes} {share.homes === 1 ? "home" : "homes"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
                  Their link will show this home. The link you just sent will stop working.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-stone-100 pt-2 text-center">
        {undo === null && (
          <button
            type="button"
            onClick={() => setUndo("ask")}
            className="mx-auto flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100"
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
                className={cn("min-h-11 rounded-full bg-stone-900 px-5 text-sm font-semibold text-white", pending && "opacity-60")}
              >
                Undo send
              </button>
              <button
                type="button"
                onClick={() => setUndo(null)}
                className="min-h-11 rounded-full px-5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Keep it
              </button>
            </div>
          </>
        )}
        {undo && undo !== "ask" && (
          <p role="status" className="py-2 text-sm text-stone-700">
            {undo === "opened" ? "They've opened it." : "It's been too long to undo here."} You can remove the home from
            your dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

// The slower way: make the link first, then send it with a fresh tap.
function DraftBody({ home, onNextToken }: { home: SendHome; onNextToken: (token: string) => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<{ url: string; shareId: string } | null>(null);
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
      if (name.trim() || note.trim()) {
        const saved = await nameQuickShare(made.shareId, { clientName: name.trim(), note }).catch(() => ({ error: failed }));
        if (saved.error) setError(saved.error);
      }
      setLink({ url: `${window.location.origin}/s/${reserved.token}`, shareId: made.shareId });
    });
  };

  const message = link ? `${messageFor(home)} ${link.url}` : "";

  return (
    <div className="pb-2">
      <div className="rounded-2xl bg-stone-50 p-4">
        <p className="font-display text-xl">{formatPrice(home.price)}</p>
        <p className="truncate font-medium">{home.address}</p>
        <p className="truncate text-sm text-stone-600">{facts}</p>
      </div>
      {link ? (
        <div className="mt-4">
          <label htmlFor={`${id}-link`} className="text-sm font-semibold">
            Your link is ready
          </label>
          <input
            id={`${id}-link`}
            readOnly
            value={link.url}
            onFocus={(event) => event.target.select()}
            className="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2.5 text-sm"
          />
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
              className={cn(action, primary)}
            >
              {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            {phone && (
              <a href={`sms:?&body=${encodeURIComponent(message)}`} className={cn(action, secondary)}>
                <MessageSquare aria-hidden size={18} /> Text
              </a>
            )}
            {canShare && (
              <button
                type="button"
                onClick={() =>
                  navigator.share({ title: "A home for you", text: messageFor(home), url: link.url }).catch(() => {})
                }
                className={cn(action, secondary)}
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
            <WhoFields name={name} onName={setName} note={note} onNote={setNote} />
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
              className={cn(action, primary, pending && "opacity-60")}
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
