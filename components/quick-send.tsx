"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { lazy, Suspense, useEffect, useId, useRef, useState, type ComponentProps, type RefObject } from "react";
import {
  claimQuickShare,
  dropSendToken,
  releaseQuickShare,
  reserveSendToken,
  type ClaimResult,
} from "@/app/dashboard/actions";
import { HOME_MESSAGE_TITLE, homeMessage } from "@/app/dashboard/message";
import { ReelFeed, type SendHome } from "@/components/reel";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { button } from "@/lib/ui";

// Send, for agents: on any home, one tap opens the phone's share sheet with a
// link to just that home, made for one client, then asks who it was for.

export const FAILED = "That link didn't save. Tap Send again.";

// What the sheets after a Send hold: loaded once a page has a link to hand
// out, which only an agent's page ever has, so nobody else downloads them.
// Ready long before the first tap; if not, the sheet fills a moment later.
// (React's own lazy, so pages that never send don't carry a loader either.)
const loadSheets = () => import("./quick-send-sheets");
const SentBody = lazy(() => loadSheets().then((sheets) => ({ default: sheets.SentBody })));
const DraftBody = lazy(() => loadSheets().then((sheets) => ({ default: sheets.DraftBody })));
const sheetLoading = <div className="h-48" />;

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
export const claim = (input: { token: string; listingKey: string }) =>
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

// The sheet's one button, as wide as the sheet.
const primary = button({ kind: "primary", size: "lg", block: true });

// `result` is the server's answer, once it's in: the sheet may open before it.
// `token`: the link's own, for the agent's notes on it.
export type Sent = {
  n: number;
  home: SendHome;
  token: string;
  claim: Promise<ClaimResult>;
  copied: boolean;
  result?: ClaimResult;
};

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
  // What this Send's sheets rise over: side by side, the home's white panel
  // (as More does), so a sheet never sits half over it; otherwise `anchor`.
  const sheetAnchor = useRef<HTMLElement | null>(null);

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
    loadSheets().catch(() => {});
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

  const send = (home: SendHome, panel?: HTMLElement | null) => {
    sheetAnchor.current = panel ?? anchor?.current ?? null;
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
    const text = homeMessage(home);
    // In the same tap, before anything is waited for: a phone opens its share
    // sheet only straight after a tap.
    let handed: Promise<void>;
    try {
      handed = phone
        ? navigator.share({ title: HOME_MESSAGE_TITLE, text, url })
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
      () => setSent({ n, home, token: ready, claim: made, copied: !phone, result: answer }),
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
  // On a computer the sheet opens with the cursor on Close; this way a screen
  // reader also says the link was copied.
  const copiedId = useId();

  const ui = (
    <>
      <Sheet
        open={Boolean(sent)}
        onClose={() => setSent(null)}
        label={sentTitle}
        title={sentTitle}
        describedBy={sent?.copied && !failed ? copiedId : undefined}
        anchor={sheetAnchor}
      >
        {sent && (
          <Suspense fallback={sheetLoading}>
            <SentBody
              key={sent.n}
              sent={sent}
              copiedId={copiedId}
              onDone={(message) => {
                setSent(null);
                if (message) say(message);
              }}
            />
          </Suspense>
        )}
      </Sheet>
      <Sheet open={Boolean(draft)} onClose={() => setDraft(null)} label="Send this home" title="Send this home" anchor={sheetAnchor}>
        {draft && (
          <Suspense fallback={sheetLoading}>
            <DraftBody key={draft.listingKey} home={draft} onNextToken={offer} />
          </Suspense>
        )}
      </Sheet>
      <Sheet
        open={needsProfile}
        onClose={() => setNeedsProfile(false)}
        label="Before you send"
        title="Before you send"
        anchor={sheetAnchor}
      >
        <div className="pb-2 text-center">
          <p className="text-body leading-relaxed text-stone-700">
            Add your name and photo first so clients know it&apos;s from you.
          </p>
          <Link href="/dashboard/profile" className={cn(primary, "mt-4")}>
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
}: Omit<ComponentProps<typeof ReelFeed>, "onSend" | "sendBusy"> & { profileComplete: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // In the map's pop-out the sheets rise over the home, not the whole window.
  const quick = useQuickSend({ profileComplete, anchor: reel.embedded ? box : undefined });
  const feed = <ReelFeed {...reel} onSend={quick.send} sendBusy={quick.waiting} />;
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
        quick.waiting && "cursor-progress text-muted hover:bg-white",
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
