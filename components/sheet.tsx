"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/format";

// A panel that slides up from the bottom on phones and in from the right on
// wide screens, over everything else. Escape, the close button or a tap
// outside closes it.
export function Sheet({
  open,
  onClose,
  label,
  title,
  children,
  footer,
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
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

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
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-0 mt-auto max-h-[78dvh] open:flex w-full max-w-none flex-col overflow-hidden rounded-t-3xl bg-white p-0 text-ink shadow-2xl backdrop:bg-black/40 open:animate-[sheet-up_220ms_ease-out] motion-reduce:open:animate-none",
        "lg:ml-auto lg:mr-0 lg:mt-0 lg:h-dvh lg:max-h-none lg:w-[26rem] lg:rounded-none lg:rounded-l-3xl lg:open:animate-[sheet-in_220ms_ease-out]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 flex size-11 items-center justify-center rounded-full hover:bg-stone-100"
        >
          <X aria-hidden size={20} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer && <div className="border-t border-stone-200 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">{footer}</div>}
    </dialog>
  );
}
