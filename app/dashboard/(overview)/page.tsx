import { ChevronRight, Link2, Plus, Send } from "lucide-react";
import Link from "next/link";
import { ago, ClientStatusLine, street } from "@/components/client-status";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar, EmptyState, HomeThumb } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { CLIENT_FILTERS, getClientBook, type Client, type ClientLink } from "@/lib/clients";
import { cn } from "@/lib/format";
import { duration } from "@/lib/shares";
import { button, card } from "@/lib/ui";

// The agent's clients, as a list of people (the way a list of connections
// is): each person once, however many links they're on, with how they're
// doing in numbers (homes sent, liked, passed, comments, time spent, when
// they were last on), the one thing to know about them, and under that the
// links they're on, each to its page. Links with nobody on them yet are
// listed after, as links. The filters along the top count people.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What each filter says when nobody's in it.
const NOBODY: Record<string, string> = {
  all: "No clients yet.",
  new: "Nothing new since you last looked.",
  asks: "Nobody is waiting on a showing.",
  commented: "You've answered everyone.",
  liked: "No one has liked a home yet.",
  unopened: "Everyone has opened what you sent.",
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // (An agent with no name yet was sent to add it: see layout.tsx.)
  const agent = await requireAgent();
  const { show } = await searchParams;
  const { clients, unclaimed } = await getClientBook(agent.id);
  const filter = CLIENT_FILTERS.find((f) => f.key === show) ?? CLIENT_FILTERS[0];
  const shown = clients.filter(filter.test);
  const nothing = clients.length === 0 && unclaimed.length === 0;

  return (
    <>
      <LiveRefresh />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="font-display text-3xl">Clients</h1>
          {!nothing && (
            <p className="text-meta text-muted">
              {plural(clients.length, "person", "people")}
              {unclaimed.length > 0 && ` · ${plural(unclaimed.length, "link")} with no one on it yet`}
            </p>
          )}
        </div>
        <Link href="/dashboard/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Plus aria-hidden size={18} /> Send homes
        </Link>
      </div>

      {nothing ? (
        <EmptyState icon={Send} title="Send your first homes" className="mt-6">
          Pick a few homes and add who they&apos;re for. Everyone you send homes to shows up here, with what they think of
          each one.
        </EmptyState>
      ) : (
        <>
          {clients.length > 0 && (
            <>
              <nav aria-label="Show clients" className="mt-5">
                <ul className="flex flex-wrap gap-2">
                  {CLIENT_FILTERS.map((f) => {
                    const here = f === filter;
                    const count = clients.filter(f.test).length;
                    // A filter with nobody in it is left off, unless it's the one on.
                    if (count === 0 && !here) return null;
                    return (
                      <li key={f.key} className="shrink-0">
                        <Link
                          href={f.key === "all" ? "/dashboard" : `/dashboard?show=${f.key}`}
                          aria-current={here ? "page" : undefined}
                          className={cn(
                            "flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1",
                            here
                              ? "bg-ink text-white ring-ink"
                              : "bg-white text-stone-800 ring-stone-300 hover:ring-stone-400",
                          )}
                        >
                          {f.label}
                          <span className={cn("tabular-nums", here ? "text-white/75" : "text-muted")}>{count}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <section aria-label="Clients" className="mt-4">
                {shown.length === 0 ? (
                  <p className={cn(card, "p-6 text-center text-stone-700")}>
                    {NOBODY[filter.key]}{" "}
                    <Link href="/dashboard" className="font-medium text-brand underline-offset-2 hover:underline">
                      See everyone
                    </Link>
                  </p>
                ) : (
                  <ul className={cn(card, "divide-y divide-stone-200")}>
                    {shown.map((client) => (
                      <ClientRow key={client.key} client={client} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {unclaimed.length > 0 && filter.key === "all" && (
            <section id="links" aria-labelledby="unclaimed-title" className="mt-8 scroll-mt-4">
              <h2 id="unclaimed-title" className="text-lg font-semibold">
                Links with no one on them yet
              </h2>
              <p className="text-meta text-muted">
                When someone opens one and gives their name, or you add them to it, they&apos;ll show up above.
              </p>
              <ul className={cn(card, "mt-3 divide-y divide-stone-200")}>
                {unclaimed.map((link) => (
                  <li key={link.shareId}>
                    <LinkRow link={link} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

// A number and what it counts, as a list of connections shows them.
function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "like" | "muted" }) {
  return (
    <li className="flex flex-col">
      <span
        className={cn(
          "text-body font-semibold tabular-nums",
          tone === "like" && "text-rose-700",
          tone === "muted" && "text-stone-500",
        )}
      >
        {value}
      </span>{" "}
      <span className="text-[12px] leading-4 text-muted">{label}</span>
    </li>
  );
}

// One person: their face and name (to their page, or their newest link), the
// one thing to know, their numbers, and the links they're on.
function ClientRow({ client }: { client: Client }) {
  return (
    <li className="p-4">
      <div className="flex items-start gap-3">
        <Link href={client.href} className="relative shrink-0 rounded-full" tabIndex={-1} aria-hidden>
          <Avatar name={client.name} photo={client.photo} size={10} />
          {client.activeNow && (
            <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h2 className="min-w-0 truncate text-lg font-semibold leading-tight">
              <Link href={client.href} className="underline-offset-2 hover:underline">
                {client.name}
              </Link>
            </h2>
            {client.unread && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                New<span className="sr-only"> since you last looked</span>
              </span>
            )}
            {!client.profileId && <span className="text-[12px] text-muted">Not on Porchcard yet</span>}
          </div>
          <ClientStatusLine status={client.status} className="mt-0.5" />
        </div>
        <Link
          href={client.href}
          aria-label={`Open ${client.name}`}
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-ink"
        >
          <ChevronRight aria-hidden size={18} />
        </Link>
      </div>

      <ul aria-label="In numbers" className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 rounded-xl bg-stone-50 px-3 py-2.5 sm:grid-cols-6">
        <Stat value={client.homes} label={client.homes === 1 ? "home sent" : "homes sent"} />
        <Stat value={client.liked} label="liked" tone={client.liked > 0 ? "like" : "muted"} />
        <Stat value={client.passed} label="passed" tone={client.passed > 0 ? undefined : "muted"} />
        <Stat value={client.comments} label={client.comments === 1 ? "comment" : "comments"} tone={client.comments > 0 ? undefined : "muted"} />
        <Stat value={client.seconds > 0 ? duration(client.seconds) : "—"} label="time looking" tone={client.seconds > 0 ? undefined : "muted"} />
        <Stat
          value={client.lastActive ? ago(client.lastActive) : "—"}
          label={client.lastActive ? "last on" : "not on yet"}
          tone={client.lastActive ? undefined : "muted"}
        />
      </ul>

      <ul aria-label={`Links ${client.name} is on`} className="mt-3 flex flex-col gap-1.5">
        {client.links.map((link) => (
          <li key={link.shareId}>
            <LinkRow link={link} compact />
          </li>
        ))}
      </ul>
    </li>
  );
}

// A link: its first homes' photos, what it is, when it went, and whether it's
// been opened. `compact`: listed under a person.
function LinkRow({ link, compact = false }: { link: ClientLink; compact?: boolean }) {
  const what = compact
    ? [link.firstAddress ? street(link.firstAddress) : "No homes", link.homes > 1 && `+${link.homes - 1} more`]
        .filter(Boolean)
        .join(" ")
    : link.title;
  return (
    <Link
      href={link.href}
      className={cn(
        "group flex items-center gap-3 hover:bg-stone-50",
        compact ? "-mx-2 min-h-12 rounded-xl px-2 py-1" : "min-h-16 px-4 py-2.5",
      )}
    >
      <span aria-hidden className="flex shrink-0 -space-x-3">
        {link.photos.length === 0 ? (
          <span className="flex size-10 items-center justify-center rounded-lg bg-stone-200 text-stone-500">
            <Link2 size={16} />
          </span>
        ) : (
          link.photos.map((photo, i) => (
            <HomeThumb key={i} src={photo} sizes="40px" className="size-10 rounded-lg ring-2 ring-white" />
          ))
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold group-hover:underline">
          {what}
          {compact && link.with.length > 0 && (
            <span className="font-normal text-muted"> · with {link.with.join(" & ")}</span>
          )}
        </span>
        <span className="block truncate text-[12px] leading-4 text-muted">
          {plural(link.homes, "home")} · sent {ago(link.sentAt)} ·{" "}
          {link.openedAt ? (
            <span className="text-emerald-800">
              opened {ago(link.openedAt)}
              {link.seen && ` · ${link.seen}`}
            </span>
          ) : (
            <span className="text-amber-800">not opened</span>
          )}
        </span>
      </span>
      {link.unread && <span aria-label="New activity" className="size-2 shrink-0 rounded-full bg-brand" />}
      <ChevronRight aria-hidden size={16} className="shrink-0 text-stone-400" />
    </Link>
  );
}
