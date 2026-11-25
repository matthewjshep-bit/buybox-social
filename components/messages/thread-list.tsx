import { PenLine, Send } from "lucide-react";
import Link from "next/link";
import { ListTitle } from "@/components/messages/list-title";
import { ThreadRow } from "@/components/messages/thread-row";
import { EmptyState } from "@/components/ui";
import type { Thread } from "@/lib/messages";
import { button } from "@/lib/ui";

// The conversations, newest first, under "Messages" and the pencil that
// starts a new one (sending homes). The newest reads as open on a wide
// screen until one is picked (Messages opens on it). With none yet: what
// this is for, and the way to send homes.
export function ThreadList({ threads, compose }: { threads: Thread[]; compose: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <ListTitle />
        <Link
          href={compose}
          aria-label="Send homes"
          title="Send homes"
          className="flex size-11 items-center justify-center rounded-full text-ink hover:bg-stone-100"
        >
          <PenLine aria-hidden size={22} />
        </Link>
      </div>
      {threads.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Send}
            title="No messages yet"
            action={
              <Link href={compose} className={button({ kind: "primary", size: "lg" })}>
                Send homes
              </Link>
            }
          >
            Homes you send, and homes sent to you, show up here.
          </EmptyState>
        </div>
      ) : (
        <ul aria-label="Conversations" className="flex flex-col">
          {threads.map((thread, i) => (
            <ThreadRow key={thread.key} thread={thread} fallback={i === 0} />
          ))}
        </ul>
      )}
    </div>
  );
}
