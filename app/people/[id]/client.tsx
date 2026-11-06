"use client";

import { Share2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

const noop = () => () => {};

// Your own page, shared the way your phone shares things; elsewhere, or if
// that fails, copied.
export function ShareMyPage({ name }: { name: string }) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The toast sits on the page itself, above everything, once it's in the browser.
  const inBrowser = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const say = (text: string) => {
    clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(null), 2200);
  };

  const share = async () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} on BuyBox Social`, url });
        return;
      } catch (error) {
        // Closing the share sheet isn't an error.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied");
    } catch {
      say("Couldn't copy the link");
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
      {inBrowser &&
        createPortal(
          <p
            role="status"
            className={cn(
              "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg",
              !toast && "sr-only",
            )}
          >
            {toast}
          </p>,
          document.body,
        )}
    </>
  );
}

// Long words stop after four lines, with a way to read the rest; without
// scripts they show in full. `meta` ("2 likes · Replied to Sam") sits beside
// the way to read more.
export function MoreText({ children, meta, className }: { children: ReactNode; meta?: ReactNode; className?: string }) {
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

  const more = clamped || open;
  return (
    <>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-line break-words",
          !open && "line-clamp-4 [@media(scripting:none)]:line-clamp-none",
          className,
        )}
      >
        {children}
      </p>
      {(meta || more) && (
        <div className={cn("flex items-center justify-between gap-3", more ? "mt-0.5" : "mt-1")}>
          <p className="min-w-0 text-[13px] text-stone-600">{meta}</p>
          {more && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="relative z-20 -mr-2 min-h-11 min-w-11 shrink-0 scroll-mt-[var(--filters)] rounded-full px-2 text-[13px] font-semibold text-stone-600 hover:text-ink"
            >
              {open ? "less" : "more"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
