import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { UnreadDot } from "@/components/client-list";
import { ClientStatusLine } from "@/components/client-status";
import { RevealReply } from "@/components/home/day-reply";
import { HeldRows } from "@/components/home/held-feed";
import { Avatar } from "@/components/ui";
import { isWaiting, type ClientBook } from "@/lib/clients";
import { cn } from "@/lib/format";
import { button, card } from "@/lib/ui";

// How many clients the card shows: three, or everyone who's waiting, up to five.
const SHOWN = 3;
const WAITING_MOST = 5;

// "Your clients", on an agent's Home, straight under the box to send homes,
// the same at every width: a few of their clients as people (their face,
// their name, the one thing to know about them), whoever is waiting first,
// each of those with Reply right there; how many are waiting, in amber; and
// the way to all of them, on the Dashboard. Theirs alone to see (the lock).
// On a quiet day it's where their three most recent clients stand. Before
// they've sent anything, it's the one thing to do: send their first homes.
export function ClientsRail({ book, me }: { book: ClientBook; me: { name: string; photo: string | null } }) {
  const { clients, unclaimed } = book;
  if (clients.length === 0 && unclaimed.length === 0) {
    return (
      <section aria-labelledby="first-send-title" className={cn(card, "px-5 py-7 text-center")}>
        <h2 id="first-send-title" className="font-display text-2xl">
          Send your first homes
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-balance text-body text-stone-700">Your clients show up here.</p>
        <Link href="/dashboard/new" className={cn(button({ kind: "primary" }), "mt-4")}>
          Send homes
        </Link>
      </section>
    );
  }

  const waiting = clients.filter(isWaiting).length;
  return (
    <section aria-labelledby="clients-title" className={cn(card, "py-3")}>
      <div className="flex items-center gap-1.5 px-4">
        <h2 id="clients-title" className="text-body font-semibold">
          Your clients
        </h2>
        <Lock aria-hidden size={13} className="text-stone-500" />
        <span className="sr-only">Only you see this</span>
        {waiting > 0 ? (
          <span className="ml-auto text-meta font-semibold text-amber-900">{waiting} waiting</span>
        ) : (
          clients.length > 0 && <span className="ml-auto text-meta text-muted">{clients.length}</span>
        )}
      </div>
      {clients.length === 0 ? (
        <p className="px-4 pt-2 text-meta text-muted">No clients yet.</p>
      ) : (
        <HeldRows
          className="mt-1"
          // (They come whoever is waiting first.)
          show={Math.max(SHOWN, Math.min(WAITING_MOST, waiting))}
          rows={clients.map((client) => ({
            id: client.key,
            waiting: client.waiting,
            node: (
              <li>
                <RevealReply me={me} name={client.name} reply={client.reply}>
                  <Link
                    href={client.href}
                    className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-1.5 pl-4 hover:bg-stone-50"
                  >
                    <span className="relative shrink-0">
                      <Avatar name={client.name} photo={client.photo} size={10} />
                      {client.unread && <UnreadDot />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold group-hover:underline">
                        {client.name}
                        {client.unread && <span className="sr-only">, new since you last looked</span>}
                      </span>
                      <ClientStatusLine status={client.status} />
                    </span>
                  </Link>
                </RevealReply>
              </li>
            ),
          }))}
        />
      )}
      <Link
        href="/dashboard"
        className="mx-4 mt-1 flex min-h-11 items-center justify-center gap-1 border-t border-stone-200 pt-1 text-sm font-semibold text-stone-700 hover:text-ink"
      >
        See all<span className="sr-only"> clients</span> <ArrowRight aria-hidden size={14} />
      </Link>
    </section>
  );
}
