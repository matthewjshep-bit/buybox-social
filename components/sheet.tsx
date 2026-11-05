"use client";

import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/format";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A panel that rises from the bottom, over the thing it's about: phones and
// wide screens alike, like the comments on a reel. It sits over `anchor` (the
// feed it belongs to, which may be a pane or a pop-out) rather than the whole
// window. Escape, the close button, a tap above it or a drag down closes it.
export function Sheet({
  open,
  onClose,
  label,
  title,
  children,
  footer,
  anchor,
  tall = false,
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
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; at: number; dy: number } | null>(null);

  // Opens before the browser paints, so whatever opened it can put the cursor
  // in its comment box straight away (and a phone shows its keyboard).
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!open) {
      if (el.open) el.close();
      el.style.transform = "";
      return;
    }
    const place = () => {
      const box = anchor?.current?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
      const width = Math.min(box.width, 672);
      el.style.left = `${box.left + (box.width - width) / 2}px`;
      el.style.width = `${width}px`;
      el.style.bottom = `${Math.max(0, innerHeight - box.bottom)}px`;
      el.style.height = tall ? `${Math.round(box.height * 0.6)}px` : "";
      el.style.maxHeight = `${Math.round(box.height * (tall ? 0.6 : 0.8))}px`;
    };
    place();
    if (!el.open) el.showModal();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, tall]);

  // Slides back down, then closes.
  const dismiss = () => {
    const el = dialog.current;
    if (!el || reducedMotion()) return onClose();
    el.style.transition = "transform 180ms ease-in";
    el.style.transform = "translateY(100%)";
    setTimeout(() => {
      el.style.transition = "";
      onClose();
    }, 180);
  };

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onClose={onClose}
      // Escape is handled here rather than left to the browser, which can
      // swallow the first press after another dialog (the name prompt) closes.
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
      className={cn(
        "fixed inset-auto m-0 max-w-none flex-col overflow-hidden rounded-t-3xl bg-white p-0 text-ink shadow-[0_-8px_40px_rgb(0_0_0/0.25)] open:flex",
        "backdrop:bg-black/25 open:animate-[sheet-up_260ms_cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:open:animate-none",
        className,
      )}
    >
      {/* The handle and title: drag them down to close. */}
      <div
        className="relative shrink-0 touch-none select-none pb-2 pt-2.5"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, at: event.timeStamp, dy: 0 };
          if (dialog.current) dialog.current.style.transition = "none";
        }}
        onPointerMove={(event) => {
          if (!drag.current || !dialog.current) return;
          drag.current.dy = Math.max(0, event.clientY - drag.current.y);
          dialog.current.style.transform = `translateY(${drag.current.dy}px)`;
        }}
        onPointerUp={(event) => {
          const moved = drag.current;
          drag.current = null;
          const el = dialog.current;
          if (!moved || !el) return;
          const fast = moved.dy / Math.max(1, event.timeStamp - moved.at) > 0.6;
          if (moved.dy > 110 || (moved.dy > 30 && fast)) return dismiss();
          el.style.transition = "transform 200ms ease-out";
          el.style.transform = "";
        }}
        onPointerCancel={() => {
          drag.current = null;
          if (dialog.current) dialog.current.style.transform = "";
        }}
      >
        <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-stone-300" />
        <h2 className="mt-2.5 px-14 text-center text-[15px] font-semibold">{title}</h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-2 top-2.5 flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink"
        >
          <X aria-hidden size={20} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-stone-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {footer}
        </div>
      )}
    </dialog>
  );
}
