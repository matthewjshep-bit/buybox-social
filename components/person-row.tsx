import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, RoleChip } from "@/components/ui";
import { cn } from "@/lib/format";

// Someone in a list of people, the same wherever people are listed (Search,
// followers, following): their face, their name to their page, "Agent"
// beside an agent's (so two people called Matt can be told apart), a line
// under it when there's something to say (an agent's company, "Follows
// you"), and what can be done about them (Follow) at the end. Goes in a
// list: it's a list item.
export function PersonRow({
  href,
  name,
  face,
  photo,
  agent,
  kind,
  line,
  action,
  rank,
}: {
  // Their page.
  href: string;
  name: string;
  // Their first name: the initial on their face. (Empty: no name yet.)
  face: string;
  photo: string | null;
  agent: boolean;
  // What a pro is (lib/kinds.ts), for the chip: an agent, an investor, a lender.
  kind?: string | null;
  line?: ReactNode;
  // The control at the end of the row: Follow.
  action?: ReactNode;
  // Their place in a ranked list (Popular), before their face.
  rank?: number;
}) {
  return (
    <li className="flex items-center gap-3 p-3">
      {rank !== undefined && (
        <span className={cn("w-7 shrink-0 text-center font-display text-2xl tabular-nums", rank <= 3 ? "text-ink" : "text-stone-500")}>
          <span className="sr-only">Number </span>
          {rank}
        </span>
      )}
      <Avatar name={face} tone={agent ? "agent" : "person"} size={10} photo={photo} href={href} />
      {/* Their name and its line are one link, a fingertip tall. */}
      <Link href={href} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold underline-offset-2 group-hover:underline">{name}</span>
          <RoleChip role={agent ? (kind && kind !== "buyer" ? kind : "agent") : null} small />
        </span>
        {line && <span className="block truncate text-sm text-muted">{line}</span>}
      </Link>
      {action}
    </li>
  );
}
