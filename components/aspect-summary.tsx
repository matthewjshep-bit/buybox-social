import { Heart, ThumbsDown } from "lucide-react";
import type { ReactNode } from "react";
import { AspectRows } from "@/components/aspect-rows";
import { cn } from "@/lib/format";
import { aspectLabel, topAspects, type Aspect, type AspectCounts } from "@/lib/reactions";

// What people single out about a home, most-mentioned first: as chips, or
// (`rows`, the Scorecard) one row each, with how many people and a tap to
// see who and where. The chips are plain enough for a server page; the rows
// (which open and close) live in their own client file.
export function AspectSummary({
  liked,
  disliked,
  likeLabel = "People like",
  dislikeLabel = "People pass on",
  variant = "chips",
  you,
  detail,
}: {
  liked: AspectCounts;
  disliked: AspectCounts;
  likeLabel?: string;
  dislikeLabel?: string;

  variant?: "chips" | "rows";
  // Rows: the specifics your own reaction includes.
  you?: { liked: Aspect[]; disliked: Aspect[] };
  // Rows: what a row shows when it's opened.
  detail?: (aspect: Aspect, tone: "like" | "dislike") => ReactNode;
}) {
  if (variant === "rows") {
    const likes = topAspects(liked);
    const dislikes = topAspects(disliked);
    if (likes.length === 0 && dislikes.length === 0) return null;
    return (
      <div className="flex flex-col gap-5">
        {likes.length > 0 && (
          <AspectRows tone="like" label={likeLabel} items={likes} first={5} you={you?.liked ?? []} detail={detail} />
        )}
        {dislikes.length > 0 && (
          <AspectRows
            tone="dislike"
            label={dislikeLabel}

            items={dislikes}
            // Fewer passes show before "Show all".
            first={3}
            you={you?.disliked ?? []}
            detail={detail}
          />
        )}
      </div>
    );
  }
  const likes = topAspects(liked, 5);
  const dislikes = topAspects(disliked, 5);
  if (likes.length === 0 && dislikes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
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
