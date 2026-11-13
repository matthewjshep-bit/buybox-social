import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ClientDays } from "@/components/home/client-day-card";
import { ClientFaces, clientName, clientReel, inFaceOrder } from "@/components/home/faces-row";
import { Lenses } from "@/components/home/lens-pills";
import { NeedsYou } from "@/components/home/needs-you";
import { FollowingFeed } from "@/components/home-feed";
import { Avatar } from "@/components/ui";
import type { ClientDay } from "@/lib/agent-feed";
import { CLIENT_FILTERS, type AgentClient, type ClientFilterKey } from "@/lib/clients";
import { cn } from "@/lib/format";
import type { HomeFeedEntry } from "@/lib/home-feed";
import type { NeedsItem } from "@/lib/needs-you";
import type { ReactionState } from "@/lib/reactions";
import { button, card } from "@/lib/ui";

// An agent's home ("Today"): what needs them first, then what their clients
// have been doing. Top to bottom: a bar to send homes (wider screens), their
// clients' faces, the few things clients are waiting on them for, and then
// their clients' days (or, a tap away, the people they follow). Beside it on
// a wide screen, their clients at a glance, counted exactly as the Clients
// page counts them, and who's looking right now. One filled button on the
// page: the first thing waiting for them.

export type HomeLens = { initial: string; fromUrl: boolean };

// Each count, worded for a sentence after its number, as the rail and the
// phone's one line say them; and in the Clients page's order.
const WEEK: { key: Exclude<ClientFilterKey, "all">; one: string; many: string; short: string }[] = [
  { key: "new", one: "with new activity", many: "with new activity", short: "with news" },
  { key: "asks", one: "wants a showing", many: "want a showing", short: "wants a showing" },
  { key: "unopened", one: "link not opened", many: "links not opened", short: "not opened" },
  { key: "liked", one: "liked a home", many: "liked a home", short: "liked a home" },
  { key: "commented", one: "commented", many: "commented", short: "commented" },
];

// How many clients each count holds, with the very test the Clients page uses.
function countsOf(clients: AgentClient[]) {
  return WEEK.map((row) => {
    const filter = CLIENT_FILTERS.find((f) => f.key === row.key);
    return { ...row, n: filter ? clients.filter(filter.test).length : 0 };
  });
}

// "Send homes to…": shaped like a box to type in, as a post box is, and opening
// the builder with the people picker ready.
function Composer({ me }: { me: { name: string; photo: string | null } }) {
  return (
    <div className={cn(card, "hidden items-center gap-3 p-3 sm:flex")}>
      <Avatar name={me.name} tone="agent" photo={me.photo} size={10} />
      <Link
        href="/dashboard/new?focus=to"
        aria-label="Send homes to a client"
        className="flex h-11 min-w-0 flex-1 items-center rounded-full border border-stone-300 px-4 text-body hover:border-stone-400 hover:bg-stone-50"
      >
        <span className="shrink-0 font-semibold">Send homes to…</span>
        <span className="ml-1.5 truncate text-muted max-[480px]:hidden">a client or anyone on Porchcard</span>
      </Link>
    </div>
  );
}

// An agent who hasn't sent anything yet: the one thing to do.
function FirstSend() {
  return (
    <section aria-labelledby="first-send-title" className={cn(card, "px-5 py-7 text-center")}>
      <h2 id="first-send-title" className="font-display text-2xl">
        Send your first homes
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-balance text-body text-stone-700">
        Pick a few homes, add your client, and we&apos;ll make them a personal link. You&apos;ll see what they love here.
      </p>
      <Link href="/dashboard/new" className={cn(button({ kind: "primary" }), "mt-4")}>
        Choose homes
      </Link>
    </section>
  );
}

// The week in one line, on a phone: each count to the clients it counts.
function WeekLine({ clients }: { clients: AgentClient[] }) {
  const counts = countsOf(clients).filter((row) => row.n > 0 && row.key !== "commented");
  if (counts.length === 0) return null;
  return (
    <nav aria-label="Your clients at a glance" className="-mt-2 lg:hidden">
      <ul className="flex flex-wrap items-center px-1 text-meta text-muted">
        {counts.map((row, i) => (
          <li key={row.key} className="flex items-center">
            {i > 0 && <span aria-hidden className="px-1">·</span>}
            <Link
              href={`/dashboard?show=${row.key}`}
              className={cn(
                "inline-flex min-h-11 items-center underline-offset-2 hover:underline",
                row.key === "unopened" && "text-amber-800",
              )}
            >
              <strong className="font-semibold text-ink">{row.n}</strong>&nbsp;
              {row.key === "asks" && row.n > 1 ? "want a showing" : row.short}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Beside the stream: the counts, each to the Clients page showing just those.
function ClientCounts({ clients }: { clients: AgentClient[] }) {
  return (
    <section aria-labelledby="client-counts-title" className={cn(card, "p-4")}>
      <h2 id="client-counts-title" className="text-body font-semibold">
        Your clients
      </h2>
      <ul className="mt-1 divide-y divide-stone-200">
        {countsOf(clients).map((row) => (
          <li key={row.key}>
            <Link
              href={`/dashboard?show=${row.key}`}
              className="group flex min-h-11 items-center gap-3 py-1.5"
            >
              <span
                className={cn(
                  "w-7 font-display text-xl leading-none tabular-nums",
                  row.key === "unopened" && row.n > 0 && "text-amber-700",
                )}
              >
                {row.n}
              </span>{" "}
              <span className={cn("flex-1 text-body group-hover:underline", row.key === "unopened" && row.n > 0 && "text-amber-800")}>
                {row.n === 1 ? row.one : row.many}
              </span>
              <ChevronRight aria-hidden size={16} className="text-stone-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Who's on one of their links right now.
function ActiveNow({ clients }: { clients: AgentClient[] }) {
  const active = inFaceOrder(clients).filter((client) => client.activeNow);
  if (active.length === 0) return null;
  return (
    <section aria-labelledby="active-now-title" className={cn(card, "p-4")}>
      <h2 id="active-now-title" className="text-body font-semibold">
        Active now
      </h2>
      <ul className="mt-1">
        {active.slice(0, 3).map((client) => {
          const person = client.people[0];
          return (
            <li key={client.key}>
              <Link href={clientReel(client)} className="group flex min-h-11 items-center gap-3 py-1.5">
                <Avatar name={clientName(client)} photo={person?.photo} size={9} className="ring-2 ring-emerald-500 ring-offset-1" />
                <span className="text-body group-hover:underline">
                  <strong className="font-semibold">{clientName(client)}</strong>{" "}
                  {client.people.length > 1 ? "are" : "is"} looking at homes
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AgentHome({
  firstName,
  me,
  profileHref,
  clients,
  needs,
  days,
  feed,
  mine,
  seenAt,
  lens,
}: {
  firstName: string;
  me: { name: string; photo: string | null };
  // Their own public page.
  profileHref: string;
  clients: AgentClient[];
  needs: { items: NeedsItem[]; more: number };
  days: ClientDay[];
  // The people they follow, for the Following lens.
  feed: HomeFeedEntry[];
  mine: Record<string, ReactionState>;
  seenAt: string | null;
  lens: HomeLens;
}) {
  const initial = lens.initial === "following" ? "following" : "clients";
  return (
    <main className="mx-auto grid max-w-[948px] grid-cols-1 gap-8 px-4 pb-16 pt-2 lg:grid-cols-[minmax(0,600px)_300px] lg:justify-center lg:pt-5">
      <h1 className="sr-only">{firstName ? `Hi, ${firstName}` : "Your home"}</h1>
      <div className="flex min-w-0 flex-col gap-5">
        <Composer me={me} />
        <ClientFaces clients={clients} />
        {clients.length === 0 ? (
          <FirstSend />
        ) : (
          <>
            <NeedsYou items={needs.items} more={needs.more} />
            <WeekLine clients={clients} />
            <section aria-labelledby="stream-title">
              <h2 id="stream-title" className="sr-only">
                What&apos;s happening
              </h2>
              <Lenses
                label="Show"
                lenses={[
                  { key: "clients", label: "Clients" },
                  { key: "following", label: "Following" },
                ]}
                initial={initial}
                fromUrl={lens.fromUrl}
                panels={{
                  clients: <ClientDays days={days} />,
                  following: (
                    <FollowingFeed
                      entries={feed}
                      mine={mine}
                      seenAt={seenAt}
                      empty="Follow people to see what they like here. Tap anyone's name on a home to see their page."
                    />
                  ),
                }}
              />
            </section>
          </>
        )}
      </div>
      <aside aria-label="At a glance" className="hidden flex-col gap-4 lg:sticky lg:top-5 lg:flex lg:self-start">
        {clients.length > 0 && <ClientCounts clients={clients} />}
        <ActiveNow clients={clients} />
        <p className="flex flex-wrap items-center px-1 text-meta text-muted">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">
            All clients
          </Link>
          <span aria-hidden className="px-1.5">·</span>
          <Link href="/dashboard/profile" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">
            Your brand
          </Link>
          <span aria-hidden className="px-1.5">·</span>
          <Link href={profileHref} className="inline-flex min-h-11 items-center hover:text-ink hover:underline">
            Your page
          </Link>
        </p>
      </aside>
    </main>
  );
}
