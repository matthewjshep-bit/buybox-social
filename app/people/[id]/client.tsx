"use client";

import { Share2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

// Your own page, shared the way your phone shares things; elsewhere, copied.
export function ShareMyPage({ name }: { name: string }) {
  const [toast, setToast] = useState<string | null>(null);

  const share = async () => {
    const url = window.location.origin + window.location.pathname;
    try {
      if (navigator.share) await navigator.share({ title: `${name} on BuyBox Social`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied");
        setTimeout(() => setToast(null), 2200);
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={share}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold text-ink ring-1 ring-stone-300 hover:bg-stone-50"
      >
        <Share2 aria-hidden size={16} />
        Share my page
      </button>
      <p
        role="status"
        className={cn(
          "fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg",
          !toast && "sr-only",
        )}
      >
        {toast}
      </p>
    </>
  );
}

// Long words stop after four lines, with a way to read the rest.
export function MoreText({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const text = ref.current;
    if (!text) return;
    const check = () => setClamped(text.scrollHeight > text.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(text);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <p ref={ref} className={cn("whitespace-pre-line break-words", !open && "line-clamp-4", className)}>
        {children}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="relative z-20 -my-2 min-h-11 text-[13px] font-semibold text-stone-600 hover:text-ink"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </>
  );
}
