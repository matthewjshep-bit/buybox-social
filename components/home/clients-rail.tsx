import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ClientStatusLine } from "@/components/client-status";
import { Avatar } from "@/components/ui";
import type { Client } from "@/lib/clients";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// An agent's clients beside their feed, as a list of friends is: each person
// (their face, their name, the one thing to know about them), whoever wants
// something first, and the way to all of them.
export function ClientsRail({ clients, show = 6, className }: { clients: Client[]; show?: number; className?: string }) {
  return (
    <section aria-labelledby={`clients-rail-${show}`} className={cn(card, "py-3", className)}>
      <div className="flex items-baseline justify-between px-4">
        <h2 id={`clients-rail-${show}`} className="text-body font-semibold">
          Your clients
        </h2>
        {clients.length > 0 && <span className="text-meta text-muted">{clients.length}</span>}
      </div>
      {clients.length === 0 ? (
        <p className="px-4 pt-2 text-meta text-muted">
          Send homes to someone and they&apos;ll show up here, with what they think of each one.
        </p>
      ) : (
        <ul className="mt-1">
          {clients.slice(0, show).map((client) => (
            <li key={client.key}>
              <Link href={client.href} className="group flex min-h-14 items-center gap-3 px-4 py-1.5 hover:bg-stone-50">
                <span className="relative shrink-0">
                  <Avatar name={client.name} photo={client.photo} size={10} />
                  {client.unread && (
                    <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-brand ring-2 ring-white" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold group-hover:underline">
                    {client.name}
                    {client.unread && <span className="sr-only">, new since you last looked</span>}
                  </span>
                  <ClientStatusLine status={client.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/dashboard"
        className="mx-4 mt-1 flex min-h-11 items-center justify-center gap-1 border-t border-stone-200 pt-1 text-sm font-semibold text-stone-700 hover:text-ink"
      >
        {clients.length > show ? `See all ${clients.length} clients` : "See all clients"} <ArrowRight aria-hidden size={14} />
      </Link>
    </section>
  );
}
