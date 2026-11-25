import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { Avatar, RoleChip } from "@/components/ui";
import type { Thread } from "@/lib/messages";

// Across the top of a conversation: the way back to the list (a phone),
// their face and name (to their page, when they have one), "Agent" beside an
// agent's, a word on who's in it when it's several people, and (the
// sender's) the page about the link itself.
export function ThreadHeader({ thread, details, level = 1 }: { thread: Thread; details?: string | null; level?: 1 | 2 }) {
  const [first] = thread.people;
  const names = thread.people.map((person) => person.name).filter(Boolean);
  // The page's own title on a conversation's page; under "Messages" when
  // it's the one Messages opened on by itself.
  const Title = level === 2 ? "h2" : "h1";
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
        <Title className="flex min-w-0 items-center gap-1.5 text-body font-semibold leading-5">
          {first?.profileId && !thread.group ? (
            <Link href={`/people/${first.profileId}`} className="flex min-h-11 items-center truncate underline-offset-2 hover:underline">
              {thread.title}
            </Link>
          ) : (
            <span className="truncate">{thread.title}</span>
          )}
          {!thread.group && first?.agent && <RoleChip role="agent" small />}
        </Title>
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
