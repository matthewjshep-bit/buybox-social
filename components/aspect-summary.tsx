"use client";

import { ChevronDown, Heart, ThumbsDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { aspectLabel, topAspects, type Aspect, type AspectCounts } from "@/lib/reactions";

// What people single out about a home, most-mentioned first: as chips, or
// (`rows`, the Scorecard) one row each, with a bar for how many and a tap to
// see who and where.
export function AspectSummary({
  liked,
  disliked,
  limit = 5,
  className,
  likeLabel = "People like",
  dislikeLabel = "People pass on",
  variant = "chips",
  you,
  detail,
  passLimit = 3,
}: {
  liked: AspectCounts;
  disliked: AspectCounts;
  limit?: number;
  className?: string;
  likeLabel?: string;
  dislikeLabel?: string;
  variant?: "chips" | "rows";
  // Rows: the specifics your own reaction includes.
  you?: { liked: Aspect[]; disliked: Aspect[] };
  // Rows: what a row shows when it's opened.
  detail?: (aspect: Aspect, tone: "like" | "dislike") => ReactNode;
  // Rows: how many passes show before "Show all".
  passLimit?: number;
}) {
  if (variant === "rows") {
    const likes = topAspects(liked);
    const dislikes = topAspects(disliked);
    if (likes.length === 0 && dislikes.length === 0) return null;
    return (
      <div className={cn("flex flex-col gap-5", className)}>
        {likes.length > 0 && (
          <AspectRows tone="like" label={likeLabel} items={likes} first={limit} you={you?.liked ?? []} detail={detail} />
        )}
        {dislikes.length > 0 && (
          <AspectRows tone="dislike" label={dislikeLabel} items={dislikes} first={passLimit} you={you?.disliked ?? []} detail={detail} />
        )}
      </div>
    );
  }
  const likes = topAspects(liked, limit);
  const dislikes = topAspects(disliked, limit);
  if (likes.length === 0 && dislikes.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {likes.length > 0 && <AspectRow tone="like" label={likeLabel} items={likes} />}
      {dislikes.length > 0 && <AspectRow tone="dislike" label={dislikeLabel} items={dislikes} />}
    </div>
  );
}

function AspectRow({
  tone,
  label,
  items,
}: {
  tone: "like" | "dislike";
  label: string;
  items: [keyof AspectCounts, number][];
}) {
  const like = tone === "like";
  const Icon = like ? Heart : ThumbsDown;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className={cn("flex items-center gap-1 font-semibold", like ? "text-rose-900" : "text-amber-900")}>
        <Icon aria-hidden size={14} />
        {label}
      </span>
      {items.map(([aspect, count]) => (
        <span
          key={aspect}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
            like ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200",
          )}
        >
          {aspectLabel(aspect)} <span className="tabular-nums">{count}</span>
        </span>
      ))}
    </div>
  );
}

// One list of rows: the most-mentioned first, a few, then "Show all".
function AspectRows({
  tone,
  label,
  items,
  first,
  you,
  detail,
}: {
  tone: "like" | "dislike";
  label: string;
  items: [Aspect, number][];
  first: number;
  you: Aspect[];
  detail?: (aspect: Aspect, tone: "like" | "dislike") => ReactNode;
}) {
  const like = tone === "like";
  const Icon = like ? Heart : ThumbsDown;
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Aspect | null>(null);
  const most = items[0]?.[1] ?? 1;
  const shown = all ? items : items.slice(0, first);
  return (
    <div>
      <h4 className={cn("flex items-center gap-1.5 text-[13px] font-semibold", like ? "text-rose-900" : "text-amber-900")}>
        <Icon aria-hidden size={14} />
        {label}
      </h4>
      <ul className="mt-1 flex flex-col">
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
                <span className="w-32 shrink-0 truncate text-[15px] text-ink">
                  {aspectLabel(aspect)} <span className="font-semibold tabular-nums">{count}</span>
                </span>
                <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span
                    style={{ width: `${Math.max(6, (count / most) * 100)}%` }}
                    className={cn("block h-full rounded-full", like ? "bg-rose-500" : "bg-amber-500")}
                  />
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
          onClick={() => setAll(true)}
          className="-mx-2 flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-brand hover:bg-stone-50"
        >
          Show all {items.length}
        </button>
      )}
    </div>
  );
}
