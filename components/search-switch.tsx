import Link from "next/link";
import { cn } from "@/lib/format";

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
