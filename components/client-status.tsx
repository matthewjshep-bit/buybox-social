import { DoorOpen, Eye, Heart, MessageCircle } from "lucide-react";
import type { ClientStatus } from "@/lib/clients";
import { cn, timeAgo } from "@/lib/format";

// "5h ago", "just now", "Nov 3".
export const ago = (date: Date) => {
  const text = timeAgo(date.toISOString());
  return /^\d+[mhd]$/.test(text) ? `${text} ago` : text;
};

// The street of an address: "5902 Lakeview Terrace SE".
export const street = (address: string) => address.split(",")[0];

// The one thing to know about a client, in a line: they want a showing,
// they're looking right now, what they said that's waiting on you, how many
// homes they liked, or that they haven't opened what you sent.
export function ClientStatusLine({ status, className }: { status: ClientStatus; className?: string }) {
  const line = "flex min-w-0 items-center gap-1.5 text-meta";
  switch (status.kind) {
    case "ask":
      return (
        <p className={cn(line, "font-medium text-amber-900", className)}>
          <DoorOpen aria-hidden size={14} className="shrink-0 text-amber-700" />
          <span className="truncate">Wants to see {street(status.address)}</span>
        </p>
      );
    case "active":
      return (
        <p className={cn(line, "font-medium text-emerald-800", className)}>
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">Looking at homes now</span>
        </p>
      );
    case "comment":
      return (
        <p className={cn(line, "text-stone-800", className)}>
          <MessageCircle aria-hidden size={14} className="shrink-0 text-stone-500" />
          <span className="truncate">“{status.body}”</span>
        </p>
      );
    case "liked":
      return (
        <p className={cn(line, "text-stone-800", className)}>
          <Heart aria-hidden size={14} className="shrink-0 fill-rose-600 text-rose-600" />
          <span className="truncate">
            Liked {status.n} of {status.of} {status.of === 1 ? "home" : "homes"}
          </span>
        </p>
      );
    case "opened":
      return (
        <p className={cn(line, "text-muted", className)}>
          <Eye aria-hidden size={14} className="shrink-0" />
          <span className="truncate">Opened · no reactions yet</span>
        </p>
      );
    case "unopened":
      return (
        <p className={cn(line, "text-amber-900", className)}>
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
          <span className="truncate">Hasn&apos;t opened · sent {ago(status.sentAt)}</span>
        </p>
      );
  }
}
