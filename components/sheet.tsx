"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { cn } from "@/lib/format";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Where the header ends: a sheet pulled all the way up stops just under it.
const HEADER = 56;

// How far a notch reaches down from the top of the screen, if there is one.
function notch() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden";
  document.body.append(probe);
  const at = probe.offsetHeight;
  probe.remove();
  return at;
}

// The keyboard goes back to what opened a sheet, as soon as that can take it
// (it may still be fading back in from under the sheet), unless something
// else has taken the keyboard meanwhile. (Just shut, the sheet can still
// hold it for a moment: that's nothing else.)
function giveFocusBack(to: HTMLElement | null, sheet: HTMLElement) {
  let tries = 0;
  const attempt = () => {
    const now = document.activeElement;
    if (!to?.isConnected || (now && now !== document.body && !sheet.contains(now))) return;
    to.focus({ preventScroll: true });
    if (document.activeElement !== to && ++tries < 30) requestAnimationFrame(attempt);
  };
  attempt();
}

// What a sheet beside the photo is placed within: the nearest positioned box around it.
function holderOf(el: HTMLElement) {
  let at = el.parentElement;
  while (at && at !== document.body && getComputedStyle(at).position === "static") at = at.parentElement;
  return at ?? document.documentElement;
}

// A panel that rises from the bottom, over the thing it's about, like the
// comments on a reel. It sits over `anchor` (the feed it belongs to, which may
// be a pane or a pop-out) rather than the whole window. Escape, the close
// button, a tap above it or a drag down closes it.
//
// With `detents` it has two heights: it opens at medium, with its top on the
// photo's foot so the whole photo stays in view (but between 35% and 55% of
// the way down), and the handle drags it up to large, just under the header,
// and back (a tap on the handle, or Enter, switches too). `docked`, on a wide
// screen, it isn't over the home at all: it takes the anchor's exact box
// beside the photo and leaves the photo free to tap, rather than shutting
// everything else off. Closed from inside, the keyboard goes back to what
// opened it. Beside the photo, `tabs` can stand in for the title: a switch
// between what it holds, which changes in place, never closing.
export function Sheet({
  open,
  onClose,
  label,
  title,
  children,
  footer,
  anchor,
  tall = false,
  detents,
  docked = false,
  tabs,
  bodyRef,
  footerHidden = false,
  returnTo,
  className,
}: {
  open: boolean;
  onClose: () => void;
  // Its name for screen readers: "Comments".
  label: string;
  title: ReactNode;
  children: ReactNode;
  // Stays put at the bottom while the rest scrolls (a comment box).
  footer?: ReactNode;
  anchor?: RefObject<HTMLElement | null>;
  // A fixed height, the same however much is in it (comments), rather than
  // only as tall as its contents. It leaves the top of the screen to the home
  // it's over, which stays as it was underneath.
  tall?: boolean;
  // Medium and large heights (phones). `minTop`: where the photo ends, from
  // the anchor's top.
  detents?: { minTop: number };
  // Beside the photo, in the anchor's box, not shutting off the page (wide screens).
  docked?: boolean;
  // Beside the photo: in the title's place, a switch between what it holds.
  tabs?: ReactNode;
  // The part that scrolls.
  bodyRef?: Ref<HTMLDivElement>;
  // The footer stays (what's typed in it too) but out of sight.
  footerHidden?: boolean;
  // Where the keyboard goes back to when what opened it has gone (it opened
  // from a sheet that changed into this one). Asked as it opens.
  returnTo?: () => HTMLElement | null;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const drag = useRef<{ y: number; at: number; dy: number; top: number; handle: boolean } | null>(null);
  const detent = useRef<"medium" | "large">("medium");
  // The same, for the handle's name.
  const [large, setLarge] = useState(false);
  const toDetent = (to: "medium" | "large") => {
    detent.current = to;
    setLarge(to === "large");
  };
  // Opened docked (or not): it reopens the other way if that changes.
  const openedDocked = useRef(false);
  // What had the keyboard when it opened, to give it back to.
  const opener = useRef<HTMLElement | null>(null);
  // Closed (Escape, Close, a drag) while the keyboard was inside: what had it
  // may be gone by the time it shuts (the comment box goes with the home).
  const hadFocus = useRef(false);
  // The notch, measured once each time it opens.
  const notchAt = useRef<number | null>(null);
  const returnRef = useRef(returnTo);
  useLayoutEffect(() => {
    returnRef.current = returnTo;
  });
  const minTop = detents?.minTop;

  const anchorBox = () => anchor?.current?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
  // Where its top goes at each height, on screen.
  const tops = (box: DOMRect) => {
    const medium = box.top + Math.min(Math.max(minTop ?? 0, box.height * 0.35), box.height * 0.55);
    notchAt.current ??= notch();
    return { medium, large: Math.min(medium, box.top + HEADER + notchAt.current) };
  };

  const place = (el: HTMLDialogElement) => {
    const box = anchorBox();
    if (openedDocked.current) {
      // Not in the browser's top layer: placed within whatever holds it.
      const holder = holderOf(el);
      const base = holder.getBoundingClientRect();
      Object.assign(el.style, {
        left: `${box.left - base.left + holder.scrollLeft}px`,
        top: `${box.top - base.top + holder.scrollTop}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        bottom: "",
        maxHeight: "",
      });
      return;
    }
    const width = Math.min(box.width, 672);
    el.style.left = `${box.left + (box.width - width) / 2}px`;
    el.style.top = "";
    el.style.width = `${width}px`;
    el.style.bottom = `${Math.max(0, innerHeight - box.bottom)}px`;
    // Rising from a box above the window's foot (the white panel), its
    // bottom corners follow the box's round ones.
    el.style.borderBottomLeftRadius = el.style.borderBottomRightRadius = innerHeight - box.bottom > 1 ? "1rem" : "";
    if (minTop !== undefined) {
      const { medium, large } = tops(box);
      el.style.height = `${box.bottom - (detent.current === "large" ? large : medium)}px`;
      el.style.maxHeight = "";
    } else {
      el.style.height = tall ? `${Math.round(box.height * 0.6)}px` : "";
      el.style.maxHeight = `${Math.round(box.height * (tall ? 0.6 : 0.8))}px`;
    }
  };

  // Opens before the browser paints, so whatever opened it can put the cursor
  // in its comment box straight away (and a phone shows its keyboard).
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const shut = () => {
      const inside = el.contains(document.activeElement) || hadFocus.current;
      hadFocus.current = false;
      const was = opener.current;
      const back = was && was !== document.body && was.isConnected ? was : (returnRef.current?.() ?? null);
      // Beside the photo, the keyboard goes back to what opened it, before
      // it closes; over the home, the browser hands it back as it closes,
      // and if that's still out of sight, it follows once it's back.
      if (openedDocked.current && inside) back?.focus({ preventScroll: true });
      el.close();
      if (inside || !openedDocked.current) giveFocusBack(back, el);
    };
    if (!open) {
      if (el.open) shut();
      el.style.transform = "";
      el.style.opacity = "";
      return;
    }
    if (el.open && openedDocked.current !== docked) shut();
    if (!el.open) {
      toDetent("medium");
      notchAt.current = null;
      openedDocked.current = docked;
      hadFocus.current = false;
      // (Opened as the sheet before it changed into this one, the button
      // that did it has gone with it: `returnTo` stands in for it.)
      const active = document.activeElement;
      opener.current =
        active instanceof HTMLElement && active !== document.body ? active : (returnRef.current?.() ?? null);
      if (docked) {
        // Placed first: opening moves the keyboard into it, which would
        // otherwise scroll whatever holds it to wherever it was. With tabs,
        // the keyboard starts on the one that's showing.
        place(el);
        el.show();
        (el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? heading.current)?.focus({ preventScroll: true });
      } else {
        place(el);
        el.showModal();
      }
    } else {
      place(el);
    }
    const resize = () => place(el);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // `place` reads only what's listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor, tall, docked, minTop]);

  // What it holds changes while it's open (the comments, then the
  // Scorecard): the keyboard stays in it, on its title (beside the photo,
  // the tab that's showing), rather than falling out of the page with the
  // button that changed it.
  const shownLabel = useRef(label);
  useLayoutEffect(() => {
    const el = dialog.current;
    const was = shownLabel.current;
    shownLabel.current = label;
    if (!open || !el?.open || was === label) return;
    const now = document.activeElement;
    if (!now || now === document.body || !el.contains(now)) {
      (el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? heading.current)?.focus({ preventScroll: true });
    }
  }, [open, label]);

  // Slides back down (or, beside the photo, fades away), then closes.
  const dismiss = () => {
    const el = dialog.current;
    const close = () => {
      hadFocus.current = Boolean(el?.contains(document.activeElement));
      onClose();
    };
    if (!el || reducedMotion()) return close();
    const side = openedDocked.current;
    el.style.transition = side ? "opacity 150ms ease-in, transform 150ms ease-in" : "transform 180ms ease-in";
    el.style.transform = side ? "translateX(16px)" : "translateY(100%)";
    if (side) el.style.opacity = "0";
    setTimeout(
      () => {
        el.style.transition = "";
        close();
      },
      side ? 150 : 180,
    );
  };

  // Beside the photo, Escape puts it away even when the keyboard is out on
  // the photo, unless something there (a card) used it first.
  const dismissRef = useRef(dismiss);
  useLayoutEffect(() => {
    dismissRef.current = dismiss;
  });
  useEffect(() => {
    if (!open || !docked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (dialog.current?.contains(event.target as Node) || document.querySelector("dialog[open]:modal")) return;
      dismissRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, docked]);

  // Medium to large, or back: a tap on the handle, or Enter on it.
  const switchHeight = () => {
    const el = dialog.current;
    if (!el) return;
    toDetent(detent.current === "large" ? "medium" : "large");
    settleAt(el);
  };

  // Back to a height, gently.
  const settleAt = (el: HTMLDialogElement) => {
    el.style.transition =
      "height 220ms cubic-bezier(0.2,0.8,0.2,1), transform 220ms cubic-bezier(0.2,0.8,0.2,1)";
    el.style.transform = "";
    place(el);
  };

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      // (Not when it has already opened again, the other way: wide, or not.)
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
      // Escape is handled here rather than left to the browser, which can
      // swallow the first press after another dialog (the name prompt) closes,
      // and doesn't close one that's beside the photo at all.
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (!docked && event.target === event.currentTarget) dismiss();
      }}
      className={cn(
        "inset-auto m-0 max-w-none flex-col overflow-hidden bg-white p-0 text-ink open:flex motion-reduce:open:animate-none",
        docked
          ? "absolute z-30 rounded-2xl shadow-[-8px_0_40px_rgb(0_0_0/0.25)] open:animate-[sheet-in_260ms_cubic-bezier(0.2,0.8,0.2,1)]"
          : "fixed rounded-t-3xl shadow-[0_-8px_40px_rgb(0_0_0/0.25)] backdrop:bg-black/25 open:animate-[sheet-up_260ms_cubic-bezier(0.2,0.8,0.2,1)]",
        className,
      )}
    >
      {docked ? (
        <div className={cn("relative flex shrink-0 items-center border-b border-stone-100 py-2 pr-2", tabs ? "pl-3" : "pl-5")}>
          {tabs ? (
            <div className="min-w-0 flex-1">{tabs}</div>
          ) : (
            <h2 ref={heading} tabIndex={-1} className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink"
          >
            <X aria-hidden size={20} />
          </button>
        </div>
      ) : (
        // The handle and title: drag them down to close (or, with two
        // heights, up to make it taller and back down).
        <div
          className="relative shrink-0 touch-none select-none pb-2 pt-2.5"
          onPointerDown={(event) => {
            const el = dialog.current;
            const target = event.target as HTMLElement;
            if (!el || target.closest("button:not([data-handle])")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const { medium, large } = tops(anchorBox());
            const top = detent.current === "large" ? large : medium;
            drag.current = { y: event.clientY, at: event.timeStamp, dy: 0, top, handle: Boolean(target.closest("[data-handle]")) };
            el.style.transition = "none";
          }}
          onPointerMove={(event) => {
            const el = dialog.current;
            const moved = drag.current;
            if (!moved || !el) return;
            moved.dy = event.clientY - moved.y;
            if (minTop === undefined) {
              moved.dy = Math.max(0, moved.dy);
              el.style.transform = `translateY(${moved.dy}px)`;
              return;
            }
            // Up, it grows, as far as just under the header; down past its
            // medium height, it slides away.
            const box = anchorBox();
            const { medium, large } = tops(box);
            const top = Math.max(large, moved.top + moved.dy);
            el.style.height = `${box.bottom - Math.min(top, medium)}px`;
            el.style.transform = top > medium ? `translateY(${top - medium}px)` : "";
          }}
          onPointerUp={(event) => {
            const moved = drag.current;
            drag.current = null;
            const el = dialog.current;
            if (!moved || !el) return;
            const speed = moved.dy / Math.max(1, event.timeStamp - moved.at);
            const flickDown = moved.dy > 30 && speed > 0.6;
            if (minTop === undefined) {
              if (moved.dy > 110 || flickDown) return dismiss();
              el.style.transition = "transform 200ms ease-out";
              el.style.transform = "";
              return;
            }
            // A tap on the handle, not a drag: the other height.
            if (moved.handle && Math.abs(moved.dy) < 6) return switchHeight();
            const { medium, large } = tops(anchorBox());
            const top = moved.top + moved.dy;
            if (top > medium + 110 || (flickDown && detent.current === "medium")) return dismiss();
            const flickUp = moved.dy < -30 && speed < -0.6;
            toDetent(flickUp ? "large" : flickDown ? "medium" : top - large < medium - top ? "large" : "medium");
            settleAt(el);
          }}
          onPointerCancel={() => {
            drag.current = null;
            if (dialog.current) settleAt(dialog.current);
          }}
        >
          {/* First, so it's where the keyboard lands as it opens. */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-2 top-2.5 flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink"
          >
            <X aria-hidden size={20} />
          </button>
          {minTop !== undefined ? (
            // A fingertip to tap (a pointer's tap is caught above, where the
            // drag is; the keyboard's press lands here).
            <button
              type="button"
              data-handle
              aria-label={`${large ? "Shrink" : "Expand"} ${label.toLowerCase()}`}
              onClick={(event) => {
                if (event.detail === 0) switchHeight();
              }}
              className="mx-auto -my-2 flex h-5 w-14 items-center justify-center rounded-full hit-44"
            >
              <span aria-hidden className="block h-1 w-10 rounded-full bg-stone-300" />
            </button>
          ) : (
            <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-stone-300" />
          )}
          <h2 ref={heading} tabIndex={-1} className="mt-2.5 px-14 text-center text-[15px] font-semibold outline-none">
            {title}
          </h2>
        </div>
      )}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">
        {children}
      </div>
      {footer && (
        <div
          hidden={footerHidden}
          className={cn(
            "shrink-0 bg-white",
            docked
              ? "border-t border-stone-200 p-3"
              : "border-t border-stone-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2",
          )}
        >
          {footer}
        </div>
      )}
    </dialog>
  );
}
