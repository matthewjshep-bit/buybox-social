"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Badge, RoleChip } from "@/components/ui";
import { cn, whenWords } from "@/lib/format";
import type { Thread } from "@/lib/messages";

// One conversation in the list: their face (two, overlapping, for a link to
// several people), their name, one line about where things stand, and when.
// A blue dot on the face when there's something new; "Waiting" in amber when
// they're waiting on you. The one that's open is marked.

export function ThreadRow({ thread, fallback = false }: { thread: Thread; fallback?: boolean }) {
  const pathname = usePathname();
  const open = pathname === thread.href;
  // The one Messages opens on by itself (the newest), on a wide screen.
  const shown = fallback && pathname === "/messages";
  const [first, second] = thread.people;
  return (
    <li>
      <Link
        href={thread.href}
        aria-current={open ? "page" : undefined}
        className={cn(
          "flex min-h-[4.5rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50",
          open && "bg-stone-100",
          shown && "lg:bg-stone-100",
        )}
      >
        <span className="relative shrink-0">
          {thread.group && second ? (
            <span className="relative block size-12">
              <Avatar name={second.name} photo={second.photo} size={8} className="absolute right-0 top-0 ring-2 ring-white" />
              <Avatar name={first?.name ?? null} photo={first?.photo} size={8} className="absolute bottom-0 left-0 ring-2 ring-white" />
            </span>
          ) : (
            <Avatar name={first?.name ?? null} photo={first?.photo} tone={first?.agent ? "agent" : "person"} size={10} />
          )}
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
            <span className="shrink-0 whitespace-nowrap">{whenWords(thread.lastAt)}</span>
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
