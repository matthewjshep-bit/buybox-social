import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { Avatar, RoleChip } from "@/components/ui";
import type { Thread } from "@/lib/messages";

// Across the top of a conversation: the way back to the list (a phone),
// their face and name (to their page, when they have one), "Agent" beside an
// agent's, a word on who's in it when it's several people, and (the
// sender's) the page about the link itself.
export function ThreadHeader({ thread, details }: { thread: Thread; details?: string | null }) {
  const [first] = thread.people;
  const names = thread.people.map((person) => person.name).filter(Boolean);
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 px-2 sm:px-3">
      <Link
        href="/messages"
        aria-label="Back to messages"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-stone-100 lg:hidden"
      >
        <ArrowLeft aria-hidden size={22} />
      </Link>
      <Avatar
        name={first?.name ?? null}
        photo={first?.photo}
        tone={first?.agent ? "agent" : "person"}
        size={9}
      />
      <div className="min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-1.5 text-body font-semibold leading-5">
          {first?.profileId && !thread.group ? (
            <Link href={`/people/${first.profileId}`} className="flex min-h-11 items-center truncate underline-offset-2 hover:underline">
              {thread.title}
            </Link>
          ) : (
            <span className="truncate">{thread.title}</span>
          )}
          {!thread.group && first?.agent && <RoleChip role="agent" small />}
        </h1>
        {thread.group && names.length > 0 && (
          <p className="truncate text-meta leading-4 text-muted">{names.join(", ")}</p>
        )}
      </div>
      {/* The sender's page about the newest link in it: who's on it and their
          links, what they want, the homes to add or take off. */}
      {thread.direction !== "received" && details && (
        <Link
          href={details}
          aria-label="Link details"
          title="Link details"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-stone-100"
        >
          <Info aria-hidden size={22} />
        </Link>
      )}
    </div>
  );
}
