import { Plus, Send } from "lucide-react";
import Link from "next/link";
import { ClientListRow, LinkRow } from "@/components/client-list";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { getClientBook, type Client } from "@/lib/clients";
import { cn } from "@/lib/format";
import { button, card } from "@/lib/ui";

// The agent's clients, said plainly, in large type, for someone who wants to
// see at a glance who needs them. Three groups, each under a plain heading:
// who's waiting for an answer (a showing, something they said), who hasn't
// opened what was sent, and everyone else. Each client is one row: their name,
// one sentence on where things stand, one line of facts, and one big button
// for the next thing to do. Their links and homes are on their own page.
// Links sent with no name on them come last.

const isWaiting = (c: Client) => c.status.kind === "ask" || c.status.kind === "comment";

function Group({ title, tone, clients }: { title: string; tone?: "attention"; clients: Client[] }) {
  if (clients.length === 0) return null;
  const id = `group-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="flex items-center gap-3 text-2xl font-semibold">
        {tone === "attention" && <span aria-hidden className="size-3 rounded-full bg-amber-500" />}
        {title}
        <span className="text-xl font-normal text-stone-500">{clients.length}</span>
      </h2>
      <ul className={cn(card, "mt-4 divide-y divide-stone-200", tone === "attention" && "ring-2 ring-amber-300")}>
        {clients.map((client) => (
          <ClientListRow key={client.key} client={client} />
        ))}
      </ul>
    </section>
  );
}

export default async function ClientsPage() {
  // (An agent with no name yet was sent to add it: see layout.tsx.)
  const agent = await requireAgent();
  const { clients, unclaimed } = await getClientBook(agent.id);
  const waiting = clients.filter(isWaiting);
  const unopened = clients.filter((c) => !isWaiting(c) && c.status.kind === "unopened");
  const others = clients.filter((c) => !isWaiting(c) && c.status.kind !== "unopened");

  return (
    <>
      <LiveRefresh />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="font-display text-4xl">Clients</h1>
        <Link href="/dashboard/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Plus aria-hidden size={20} /> Send homes
        </Link>
      </div>

      {clients.length === 0 && unclaimed.length === 0 ? (
        <EmptyState icon={Send} title="Send your first homes" className="mt-8">
          Your clients show up here.
        </EmptyState>
      ) : (
        <>
          <Group title="Waiting for you" tone="attention" clients={waiting} />
          <Group title="Haven't opened yet" clients={unopened} />
          <Group title={waiting.length + unopened.length > 0 ? "Everyone else" : "Your clients"} clients={others} />
          {unclaimed.length > 0 && (
            <section id="links" aria-labelledby="unclaimed-title" className="mt-12 scroll-mt-4">
              <h2 id="unclaimed-title" className="text-2xl font-semibold">
                Links without a name
              </h2>
              <p className="mt-1 text-lg text-stone-600">
                Open one to add a name.
              </p>
              <ul className={cn(card, "mt-4 divide-y divide-stone-200")}>
                {unclaimed.map((link) => (
                  <LinkRow key={link.shareId} link={link} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
