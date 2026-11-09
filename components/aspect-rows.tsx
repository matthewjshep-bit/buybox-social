"use client";

import { ChevronDown, Heart, ThumbsDown } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";
import { aspectLabel, type Aspect } from "@/lib/reactions";

// One list of the Scorecard's rows: the most-mentioned first, a few, then
// "Show all". Each row says what and how many people, plainly ("Exterior ·
// 3 people"), a "You" when it's yours, and opens to show who and where.
export function AspectRows({
  tone,
  label,
  note,
  items,
  first,
  you,
  detail,
}: {
  tone: "like" | "dislike";
  label: string;
  // One short line under the heading.
  note?: string;
  items: [Aspect, number][];
  first: number;
  you: Aspect[];
  detail?: (aspect: Aspect, tone: "like" | "dislike") => ReactNode;
}) {
  const like = tone === "like";
  const Icon = like ? Heart : ThumbsDown;
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Aspect | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = all ? items : items.slice(0, first);
  return (
    <div>
      <h4 className={cn("flex items-center gap-1.5 text-meta font-semibold", like ? "text-rose-900" : "text-amber-900")}>
        <Icon aria-hidden size={14} />
        {label}
      </h4>
      {note && <p className="mt-0.5 text-meta text-muted">{note}</p>}
      <ul ref={list} className="mt-1 flex flex-col">
        {shown.map(([aspect, count]) => {
          const expanded = open === aspect;
          const mine = you.includes(aspect);
          return (
            <li key={aspect}>
              <button
                type="button"
                aria-expanded={detail ? expanded : undefined}
                onClick={detail ? () => setOpen(expanded ? null : aspect) : undefined}
                className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 text-left hover:bg-stone-50"
              >
                <span className="min-w-0 flex-1 truncate text-body text-ink">{aspectLabel(aspect)}</span>{" "}
                <span className="shrink-0 text-meta tabular-nums text-muted">
                  {count} {count === 1 ? "person" : "people"}
                </span>
                <span className="flex w-12 shrink-0 justify-end">
                  {mine && (
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] font-semibold",
                        like ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900",
                      )}
                    >
                      <Icon aria-hidden size={12} className={cn(like && "fill-current")} />
                      You
                    </span>
                  )}
                </span>
                {detail && (
                  <ChevronDown
                    aria-hidden
                    size={16}
                    className={cn("shrink-0 text-stone-400 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
                  />
                )}
              </button>
              {expanded && detail && <div className="pb-3 pt-1">{detail(aspect, tone)}</div>}
            </li>
          );
        })}
      </ul>
      {!all && items.length > first && (
        <button
          type="button"
          onClick={() => {
            // The button goes; the keyboard moves on to the first row it showed.
            flushSync(() => setAll(true));
            list.current?.querySelectorAll<HTMLElement>(":scope > li > button")[first]?.focus();
          }}
          className={cn(button({ kind: "ghost", flush: true }), "text-brand")}
        >
          Show all {items.length}
        </button>
      )}
    </div>
  );
}
