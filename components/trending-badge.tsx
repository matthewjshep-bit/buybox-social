import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/format";
import { TRENDING_MIN_THIS_WEEK } from "@/lib/reactions";

// Only ever shown for real activity: several reactions or comments this week.
export function TrendingBadge({ className }: { className?: string }) {
  return (
    <span
      title={`${TRENDING_MIN_THIS_WEEK}+ reactions or comments this week`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200",
        className,
      )}
    >
      <TrendingUp aria-hidden size={13} />
      Trending
    </span>
  );
}
