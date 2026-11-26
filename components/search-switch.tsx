import { Search } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/format";
import { field } from "@/lib/ui";

// Search looks for two things, a tap apart: homes (the map) and people. Two
// underline tabs, each a fingertip tall, the one you're on marked. The same
// row at the top of both pages, so it stays put as you switch. Only for
// someone signed in: people are found only by people who are.
export function SearchSwitch({ on, className }: { on: "homes" | "people"; className?: string }) {
  const tabs = [
    { key: "homes", label: "Homes", href: "/search" },
    { key: "people", label: "People", href: "/search/people" },
  ] as const;
  return (
    <div role="group" aria-label="Search for" className={cn("flex gap-1 border-b border-stone-200", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === on ? "page" : undefined}
          className={cn(
            "-mb-px flex min-h-11 min-w-16 items-center justify-center border-b-2 px-3 text-sm font-semibold",
            tab.key === on ? "border-stone-900 text-ink" : "border-transparent text-stone-600 hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

// Search's box, the same on both sides: one round-ended field, a fingertip
// tall, its name said rather than shown, and the magnifier inside its end
// to search with (Enter does too). `className`: its width and place.
export function SearchField({
  id,
  label,
  className,
  ...input
}: { id: string; label: string; className?: string } & Omit<ComponentProps<"input">, "id" | "type" | "className">) {
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input id={id} type="search" {...input} className={cn(field({ pill: true }), "w-full pr-11")} />
      <button
        type="submit"
        aria-label="Search"
        className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-stone-700 transition-colors hover:text-ink"
      >
        <Search aria-hidden size={18} />
      </button>
    </div>
  );
}
