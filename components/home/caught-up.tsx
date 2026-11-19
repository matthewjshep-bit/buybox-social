import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

// "You're all caught up": where what's new ends, so a feed has a place to stop
// rather than going on forever. A rule either side, a tick, and a line more.
export function CaughtUp({
  title = "You're all caught up",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div role="note" aria-label={title} className="flex items-center gap-3 py-2">
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
