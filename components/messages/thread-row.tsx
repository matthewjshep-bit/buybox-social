"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ThreadFace } from "@/components/messages/thread-face";
import { Badge, RoleChip } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import type { Thread } from "@/lib/messages";

// One conversation in the list: their face (two, overlapping, for a link to
// several people), their name, one line about where things stand, and how
// long ago ("4h", as the messages in it say it). A blue dot on the face when
// there's something new; "Waiting" in amber when they're waiting on you. The
// one that's open is marked; the one just tapped shades while it loads.

export function ThreadRow({ thread, fallback = false }: { thread: Thread; fallback?: boolean }) {
  const pathname = usePathname();
  const open = pathname === thread.href;
  // The one Messages opens on by itself (the newest), on a wide screen.
  const shown = fallback && pathname === "/messages";
  const [first] = thread.people;
  const at = thread.lastAt.toISOString();
  return (
    <li>
      <Link
        href={thread.href}
        aria-current={open ? "page" : undefined}
        className={cn(
          // (The focus ring drawn inside the row: the list scrolls, and would cut its sides off.)
          "relative isolate flex min-h-[4.5rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50 focus-visible:outline-offset-[-3px]! motion-reduce:transition-none",
          open && "bg-stone-100",
          shown && "lg:bg-stone-100",
        )}
      >
        <Pending />
        <span className="relative shrink-0">
          <ThreadFace thread={thread} />
          {thread.unread && (
            <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-brand ring-2 ring-white" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-body", thread.unread ? "font-bold" : "font-semibold")}>{thread.title}</span>
            {!thread.group && first?.agent && <RoleChip role="agent" small />}
            {thread.unread && <span className="sr-only">New</span>}
          </span>
          <span className={cn("flex min-w-0 items-center gap-1 text-meta", thread.unread ? "text-ink" : "text-muted")}>
            <span className="min-w-0 truncate">{thread.lastLine}</span>
            <span aria-hidden>·</span>
            <time dateTime={at} suppressHydrationWarning className="shrink-0 whitespace-nowrap">
              {timeAgo(at)}
            </time>
          </span>
        </span>
        {thread.waiting && (
          <Badge tone="attention" className="shrink-0">
            Waiting
          </Badge>
        )}
      </Link>
    </li>
  );
}

// The row just tapped, shaded while its conversation loads (after a moment,
// so a quick one never flickers): the tap was heard.
function Pending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className="pointer-events-none absolute inset-0 -z-10 bg-stone-100 opacity-0 transition-opacity data-pending:opacity-100 data-pending:delay-100 motion-reduce:transition-none"
    />
  );
}
