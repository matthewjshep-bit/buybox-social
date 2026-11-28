"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/format";

// "Sort: Newest ⌄": the order picked, in a line of words, and the phone's (or
// the browser's) own list to pick another from, laid unseen over the words,
// as on Search. Picked, the page goes there in place (`href` + the value).
export function SortPicker({
  label,
  value,
  options,
  href,
}: {
  // What it sorts, for a screen reader: "Sort listings".
  label: string;
  value: string;
  options: { value: string; label: string }[];
  href: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn("flex min-w-0 items-center gap-1 text-sm", pending && "opacity-60")}>
      <span className="shrink-0 text-stone-600">Sort:</span>
      <span className="relative flex min-h-11 min-w-0 items-center gap-0.5 rounded-full px-1 font-semibold text-ink has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-[-2px] has-[select:focus-visible]:outline-brand">
        <span aria-hidden className="truncate">
          {options.find((option) => option.value === value)?.label}
        </span>
        <ChevronDown aria-hidden size={14} className="shrink-0" />
        <select
          aria-label={label}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            start(() => router.replace(`${href}${encodeURIComponent(next)}`, { scroll: false }));
          }}
          // (16px, so a phone doesn't zoom in on it.)
          className="absolute inset-0 size-full cursor-pointer appearance-none text-base opacity-0"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
