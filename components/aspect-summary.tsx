import { Heart, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/format";
import { aspectLabel, topAspects, type AspectCounts } from "@/lib/reactions";

// What people single out about a home, most-mentioned first.
export function AspectSummary({
  liked,
  disliked,
  limit = 5,
  className,
  likeLabel = "People like",
  dislikeLabel = "People pass on",
}: {
  liked: AspectCounts;
  disliked: AspectCounts;
  limit?: number;
  className?: string;
  likeLabel?: string;
  dislikeLabel?: string;
}) {
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
