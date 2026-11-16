"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

// Long words stop after four lines, with a way to read the rest; without
// scripts they show in full.
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
      {more && (
        <div className="mt-0.5 flex justify-end">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="relative z-20 -mr-2 min-h-11 min-w-11 shrink-0 scroll-mt-[var(--filters)] rounded-full px-2 text-meta font-semibold text-muted hover:text-ink"
          >
            {open ? "less" : "more"}
          </button>
        </div>
      )}
    </>
  );
}
