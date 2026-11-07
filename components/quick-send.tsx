"use client";

import { Check, ChevronDown, ChevronRight, Copy, MessageSquare, Plus, Send, Share2, Undo2 } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type RefObject,
} from "react";
import {
  claimQuickShare,
  dropSendToken,
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
import { cn, formatPrice, timeAgo } from "@/lib/format";
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

// A link waits on the server for a day (claimQuickShare). A page holding one
// longer than this asks for a new one rather than hand out a link that's gone.
const STALE = 23 * 60 * 60 * 1000;
// A page looked at again after this long asks for a new one too, in case its
// link went while it was hidden (other pages made the agent's 20).
const REFRESH = 10 * 60 * 1000;

// A link name this page no longer needs goes back, so it can never become a link.
const giveBack = (token: string) => void dropSendToken(token).catch(() => {});

// For whatever replaced the button that was just pressed, so the cursor stays in the sheet.
const focusOnMount = (element: HTMLElement | null) => {
  element?.focus();
};

const action = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 font-semibold";
const primary = "bg-brand text-white hover:bg-brand/90";
const secondary = "bg-stone-100 text-ink hover:bg-stone-200";
const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

// `result` is the server's answer, once it's in: the sheet may open before it.
type Sent = { n: number; home: SendHome; claim: Promise<ClaimResult>; copied: boolean; result?: ClaimResult };

export type QuickSend = ReturnType<typeof useQuickSend>;

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
  // has to be waited for once it comes, and when it was made.
  const token = useRef<{ value: string; at: number } | null>(null);
  // Moves on whenever the page shows or goes, so a link that arrives for a
  // page that has gone is given back rather than kept.
  const epoch = useRef(0);
  // A new link is on its way.
  const asking = useRef(false);
  // Between one Send and the link for the next.
  const [waiting, setWaiting] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  // "Send this home": the slower way, when one tap can't do it.
  const [draft, setDraft] = useState<SendHome | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sends = useRef(0);

  // A beat after any sheet has closed, so screen readers, which can't hear
  // outside an open sheet, hear it.
  const say = (message: string) => {
    clearTimeout(toastTimer.current);
    setToast(null);
    toastTimer.current = setTimeout(() => {
      setToast(message);
      toastTimer.current = setTimeout(() => setToast(null), 2600);
    }, 50);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Holds a link the server made for this page; the one it replaces goes back.
  const take = (value: string, from: number) => {
    if (from !== epoch.current) return giveBack(value);
    const old = token.current;
    token.current = { value, at: Date.now() };
    if (old && old.value !== value) giveBack(old.value);
  };

  // Asks for a link for the next Send, unless one is already on its way.
  const reserve = () => {
    if (asking.current) return Promise.resolve();
    asking.current = true;
    const from = epoch.current;
    return reserveSendToken()
      .then(
        (result) => {
          if ("token" in result) take(result.token, from);
        },
        () => {},
      )
      .finally(() => {
        if (from === epoch.current) asking.current = false;
      });
  };

  // One link per page, so two open tabs never hold the same one. A page left
  // open a while (a phone tab, or one put back from the browser's history)
  // gets a new one when it's looked at again, and a page that goes gives its
  // link back, so the map's pop-outs don't use up the agent's 20.
  useEffect(() => {
    if (!profileComplete) return;
    epoch.current += 1;
    asking.current = false;
    reserve();
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      const held = token.current;
      if (!held || Date.now() - held.at > REFRESH) reserve();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      epoch.current += 1;
      asking.current = false;
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      const held = token.current;
      token.current = null;
      if (held) giveBack(held.value);
    };
    // `reserve` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileComplete]);

  // The link from "Send this home", for the next Send, if this page has none.
  const offer = (value: string) => {
    const held = token.current;
    if (held && Date.now() - held.at < REFRESH) return giveBack(value);
    take(value, epoch.current);
  };

  const send = (home: SendHome) => {
    if (!profileComplete) return setNeedsProfile(true);
    const held = token.current;
    // Too old to trust, or not here yet: the slower way, and a new link for next time.
    const ready = held && Date.now() - held.at < STALE ? held.value : null;
    const phone = touchScreen();
    if (!ready || (!phone && !navigator.clipboard)) {
      if (!ready) {
        token.current = null;
        if (held) giveBack(held.value);
        reserve();
      }
      return setDraft(home);
    }
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
    asking.current = true;
    const n = ++sends.current;
    const from = epoch.current;
    let answer: ClaimResult | undefined;
    const made = claim({ token: ready, listingKey: home.listingKey });
    made.then((result) => {
      answer = result;
      setSent((now) => (now?.n === n ? { ...now, result } : now));
      if (from !== epoch.current) {
        if ("nextToken" in result) giveBack(result.nextToken);
        return;
      }
      asking.current = false;
      if (!("nextToken" in result)) return reserve().finally(() => setWaiting(false));
      take(result.nextToken, from);
      setWaiting(false);
    });
    handed.then(
      () => setSent({ n, home, claim: made, copied: !phone, result: answer }),
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

  const failed = Boolean(sent?.result && "error" in sent.result);
  // On a computer the link is only copied so far, so the sheet doesn't say it's sent.
  const sentTitle = failed ? "That link didn't save" : sent?.copied ? "Who's it for?" : "Sent. Who's it for?";

  const ui = (
    <>
      <Sheet open={Boolean(sent)} onClose={() => setSent(null)} label={sentTitle} title={sentTitle} anchor={anchor}>
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
          <DraftBody key={draft.listingKey} home={draft} onNextToken={offer} />
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
      {/* Always there, so a screen reader hears each message as it comes. */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center">
        {toast && (
          <p className="w-fit max-w-md rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-ink shadow-lg">
            {toast}
          </p>
        )}
      </div>
    </>
  );

  return { send, waiting, ui };
}

// The reel, for a signed-in agent: its share button sends the home to a client.
export function QuickSendReel({
  profileComplete,
  ...reel
}: Omit<ComponentProps<typeof ReelFeed>, "onSend"> & { profileComplete: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // In the map's pop-out the sheets rise over the home, not the whole window.
  const quick = useQuickSend({ profileComplete, anchor: reel.embedded ? box : undefined });
  const feed = <ReelFeed {...reel} onSend={quick.send} />;
  return (
    <>
      {reel.embedded ? (
        <div ref={box} className="relative h-full w-full">
          {feed}
        </div>
      ) : (
        feed
      )}
      {quick.ui}
    </>
  );
}

// Beside the map, where the homes have no buttons of their own: a pill that
// sends the one showing. Its name says which home, for a screen reader.
export function SendPill({ home, quick, className }: { home: SendHome; quick: QuickSend; className?: string }) {
  return (
    <button
      type="button"
      // Stays where it is while the next link comes, so the cursor isn't lost.
      aria-disabled={quick.waiting}
      onClick={() => {
        if (!quick.waiting) quick.send(home);
      }}
      className={cn(
        "flex h-12 items-center gap-2 rounded-full bg-white px-5 font-semibold text-ink shadow-lg ring-1 ring-stone-200 hover:bg-stone-50",
        // Solid while it waits, so nothing behind it shows through the words.
        quick.waiting && "cursor-progress text-stone-600 hover:bg-white",
        className,
      )}
    >
      <Send aria-hidden size={18} className="shrink-0" />
      {quick.waiting ? (
        "Getting a new link…"
      ) : (
        <>
          Send this home<span className="sr-only">: {home.address}</span>
        </>
      )}
    </button>
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

// "96 Fernhollow Ln and 2 more · Sent 2d ago": which of their links this is.
function linkLine(share: RecentShare) {
  const where = share.firstAddress
    ? `${share.firstAddress}${share.homes > 1 ? ` and ${share.homes - 1} more` : ""}`
    : "No homes on it right now";
  const ago = timeAgo(share.sentAt);
  return `${where} · Sent ${ago === "just now" || !/\d[mhd]$/.test(ago) ? ago : `${ago} ago`}`;
}

// After the share sheet: who it went to, a note, or a change of mind.
function SentBody({ sent, onDone }: { sent: Sent; onDone: (message?: string) => void }) {
  const copiedId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [others, setOthers] = useState<RecentShare[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [undo, setUndo] = useState<"ask" | "opened" | "late" | null>(null);
  // "Keep it" was pressed, so the cursor goes back to "Undo send".
  const [kept, setKept] = useState(false);

  const result = sent.result;
  const failed = Boolean(result && "error" in result);
  const shareId = result && "shareId" in result ? result.shareId : null;

  // On a computer the sheet opens with the cursor on Close; this way a screen
  // reader also says the link was copied. Set before the sheet opens (this
  // runs first), since Sheet is the reel track's and takes no description.
  useLayoutEffect(() => {
    const dialog = box.current?.closest("dialog");
    if (!dialog || !sent.copied || failed) return;
    dialog.setAttribute("aria-describedby", copiedId);
    return () => dialog.removeAttribute("aria-describedby");
  }, [sent.copied, failed, copiedId]);

  // The link, once it's made: it may still be on its way when this opens.
  const made = async () => {
    const done = await sent.claim;
    return "shareId" in done ? done.shareId : null;
  };

  if (failed) {
    return (
      <div ref={box} className="pb-2 text-center">
        <p role="alert" className="text-[15px] font-semibold leading-relaxed text-red-700">
          {sent.copied
            ? "The link you just copied won't open. Tap Send again and use the new one."
            : "The link you just sent won't open. Tap Send again and send the new one."}
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
  const dashboardLink = "mx-auto flex min-h-11 items-center gap-1 px-3 text-sm font-semibold";

  return (
    <div ref={box} className="pb-2">
      {sent.copied && (
        <p
          id={copiedId}
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
              <p role="status" className="py-2 text-sm text-stone-600">
                Finding your clients…
              </p>
            ) : recent.length === 0 ? (
              <p className="py-2 text-sm text-stone-600">No other clients yet.</p>
            ) : (
              <>
                {/* Read before the tap, not after it. */}
                <p className="text-[13px] leading-relaxed text-stone-600">
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
                          <span className="block truncate text-[15px] font-medium">
                            {share.clientName} · {share.homes} {share.homes === 1 ? "home" : "homes"}
                          </span>
                          <span className="block truncate text-[13px] text-stone-600">{linkLine(share)}</span>
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
                onClick={() => {
                  setUndo(null);
                  setKept(true);
                }}
                className="min-h-11 rounded-full px-5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
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
            // The form that made it is gone, so the cursor comes to the link.
            ref={focusOnMount}
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
