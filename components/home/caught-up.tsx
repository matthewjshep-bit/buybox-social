import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { dayName, daysBefore, dayOf, PROFILE_TIME_ZONE } from "@/lib/profile";

// "You're all caught up": where what's new ends, so a feed has a place to stop
// rather than going on forever. A rule either side, a tick, and a line more.
export function CaughtUp({
  title = "You're all caught up",
  children,
  className,
}: {
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role="note" aria-label={title} className={cn("flex items-center gap-3 py-2", className)}>
      <span aria-hidden className="h-px flex-1 bg-stone-300" />
      <div className="flex max-w-[80%] flex-col items-center text-center">
        <CheckCircle2 aria-hidden size={22} className="text-emerald-600" />
        <p className="mt-1 text-body font-semibold">{title}</p>
        {children && <div className="text-balance text-meta text-muted">{children}</div>}
      </div>
      <span aria-hidden className="h-px flex-1 bg-stone-300" />
    </div>
  );
}

// "since Tuesday", "since yesterday", "since November 4": when they last looked.
export function sinceWords(at: string, now: number = Date.now()) {
  const day = dayOf(at);
  const days = daysBefore(day, now);
  if (days <= 0) return "since earlier today";
  if (days === 1) return "since yesterday";
  if (days < 7) {
    return `since ${new Date(at).toLocaleDateString("en-US", { weekday: "long", timeZone: PROFILE_TIME_ZONE })}`;
  }
  return `since ${dayName(day, now)}`;
}
