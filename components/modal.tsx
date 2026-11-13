"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/format";

// A route shown over the page that opened it. Closing goes back, so the URL and
// the browser's back button stay in step with what's on screen.
// `variant`: "sheet", a white box over the page; "stage", the homes on a dark
// stage that takes nearly all the window (all of it on a phone), with Close
// at its top left and, on a wide screen, a gutter to its right where the homes
// before and after are a tap away (`[data-stage-nav]`, which the feed fills).
export function Modal({
  label,
  variant = "sheet",
  children,
}: {
  label: string;
  variant?: "sheet" | "stage";
  children: ReactNode;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  // What opened it (a card's link, a pin on the map), which gets the keyboard
  // back when it closes, rather than the top of the page.
  const opener = useRef<HTMLElement | null>(null);

  // Open before anything inside it looks at its size: what's inside (the
  // homes, scrolling to the one tapped) does that in its own effects, which
  // run after this one, and a closed dialog has no size at all.
  useLayoutEffect(() => {
    const now = document.activeElement;
    if (!opener.current && now instanceof HTMLElement && now !== document.body && !dialog.current?.contains(now)) {
      opener.current = now;
    }
    const box = dialog.current;
    if (!box?.open) box?.showModal();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
      // This runs while the dialog is still on the page (a layout effect's
      // cleanup comes before React takes it off), and while it's open as a
      // modal, everything behind it is inert and can't take focus: closed
      // first, the opener can.
      if (box?.open) box.close();
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);

  // A spot card open over a photo, and its X (the first Close in it).
  const openSpotCard = () => dialog.current?.querySelector<HTMLElement>("[data-spot-card]") ?? null;
  const closeSpotCard = (card: HTMLElement) =>
    card.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();

  const stage = variant === "stage";
  const close = (
    <button
      type="button"
      aria-label="Close"
      onClick={() => router.back()}
      className={
        stage
          ? // On the dark: glass, at the stage's top left, clear of a notch.
            "absolute left-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex size-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/20 lg:top-3"
          : "absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/95 text-ink shadow"
      }
    >
      <X aria-hidden size={stage ? 20 : 22} />
    </button>
  );

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      // Escape with a spot card open over a photo closes just the card, as on
      // the full page. Cancelling the keydown keeps the browser from asking
      // the dialog to close at all; the card closes itself when the key comes
      // from inside it, and otherwise (focus on its chip or pin) its X does.
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // Not a key meant for a dialog opened over this one.
        if ((event.target as Element).closest?.("dialog") !== dialog.current) return;
        const card = openSpotCard();
        if (!card) return;
        event.preventDefault();
        if (!card.contains(event.target as Node)) closeSpotCard(card);
      }}
      onCancel={(event) => {
        event.preventDefault();
        // A close request that isn't a key (a phone's back gesture) does the
        // same: the card first, the pop-out after.
        const card = openSpotCard();
        if (card) closeSpotCard(card);
        else router.back();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) router.back();
      }}
      className={cn(
        "m-0 h-dvh max-h-none w-full max-w-none overscroll-contain bg-transparent p-0",
        stage
          ? "overflow-hidden backdrop:bg-black/90 motion-safe:backdrop:backdrop-blur-sm"
          : "overflow-y-auto backdrop:bg-black/60 sm:px-6 sm:py-8",
      )}
    >
      {stage ? (
        <>
          {/* The stage: the whole window on a phone; wide, everything but a
              thin margin and the gutter on the right, rounded. Focus on it
              is white, as everywhere on the dark. */}
          <div className="absolute inset-0 overflow-hidden bg-night text-white [--ring:white] lg:inset-y-3 lg:left-3 lg:right-[4.5rem] lg:rounded-2xl lg:shadow-2xl lg:ring-1 lg:ring-white/10">
            {close}
            {children}
          </div>
          {/* The homes before and after, beside the stage: the feed puts
              its buttons here (it can't reach outside its own box). */}
          <div data-stage-nav className="absolute right-3 top-1/2 hidden -translate-y-1/2 flex-col gap-3 [--ring:white] lg:flex" />
        </>
      ) : (
        <div className="relative mx-auto min-h-full max-w-5xl overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-2xl">
          {close}
          {children}
        </div>
      )}
    </dialog>
  );
}
