"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/format";

// What a feed shows: one word and a caret, on the first day's line. A plain
// <details> of links, so it works without scripts; with them, a tap anywhere
// else or Escape closes it too. Choosing closes it (the choice already on
// too) and leaves the keyboard on the word, which then says the new choice.
export type FeedFilterOption = { key: string; label: string; href: string; lock?: boolean };

export function FeedFilter({ options, current }: { options: FeedFilterOption[]; current: string }) {
  const on = options.find((option) => option.key === current) ?? options[0];
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const menu = details.current;
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    // Escape closes it and leaves the keyboard on the word.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.open) return;
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    menu.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      menu.removeEventListener("keydown", escape);
    };
  }, []);

  const chosen = () => {
    const menu = details.current;
    if (!menu) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  };

  return (
    <details ref={details} data-feed-filter className="group relative">
      <summary
        className={cn(
          "-mr-2 flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-full px-2 text-body font-semibold select-none hover:bg-black/5 [&::-webkit-details-marker]:hidden",
          on === options[0] ? "text-muted" : "text-ink",
        )}
      >
        <span className="sr-only">Show: </span>
        {on.label}
        <ChevronDown aria-hidden size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <nav
        aria-label="Show"
        className="absolute right-0 top-full z-40 mt-1 w-44 rounded-2xl bg-white p-1 shadow-lg ring-1 ring-stone-200"
      >
        <ul>
          {options.map((option) => (
            <li key={option.key}>
              <Link
                href={option.href}
                scroll={false}
                onClick={chosen}
                aria-current={option === on ? "page" : undefined}
                className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-body font-semibold text-ink hover:bg-stone-50"
              >
                <Check aria-hidden size={16} className={cn("shrink-0", option !== on && "invisible")} />
                {option.label}
                {option.lock && (
                  <>
                    <Lock aria-hidden size={12} className="ml-auto shrink-0 text-muted" />
                    <span className="sr-only">Only you see this</span>
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
