import { ArrowRight, Send } from "lucide-react";
import Link from "next/link";
import { ClientListRow } from "@/components/client-list";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { getClientBook, isWaiting, type Client } from "@/lib/clients";
import { cn } from "@/lib/format";
import { button, pageTitle } from "@/lib/ui";
import { FindClient, type FindRow } from "./find-client";

// The agent's clients, said plainly, in large type, for someone who wants to
// see at a glance who needs them. Three groups, each under a plain heading:
// who's waiting for an answer (a showing, something they said), who hasn't
// opened what was sent, and everyone else. Each client is one row: their name
// (with a dot on their face when there's something new from them), one
// sentence on where things stand, one line of facts, and one big button for
// the next thing to do. Their links and homes are on their own page. With
// more than eight clients there's a box to find one by name, and "Everyone
// else" shows its first ten. Links sent with no name on them are on the
// Links page; here there's only a line saying how many, as the way to them.

// How many clients before there's a box to find one.
const FIND_ABOVE = 8;
// How many of "Everyone else" show before "Show all".
const OTHERS_FIRST = 10;

const row = (client: Client): FindRow => ({
  id: client.key,
  text: client.name,
  node: <ClientListRow client={client} />,
});

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
        <h1 className={pageTitle}>Clients</h1>
        <Link href="/dashboard/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Send aria-hidden size={20} /> Send homes
        </Link>
      </div>

      {clients.length === 0 && unclaimed.length === 0 ? (
        <EmptyState icon={Send} title="Send your first homes" className="mt-8">
          Your clients show up here.
        </EmptyState>
      ) : (
        <>
          <FindClient
            label="Find a client"
            none="No client by that name."
            find={clients.length > FIND_ABOVE}
            groups={[
              { title: "Waiting for you", tone: "attention", rows: waiting.map(row) },
              { title: "Haven't opened yet", rows: unopened.map(row) },
              {
                title: waiting.length + unopened.length > 0 ? "Everyone else" : "Your clients",
                rows: others.map(row),
                first: OTHERS_FIRST,
              },
            ]}
          />
          {unclaimed.length > 0 && (
            <p className="mt-8">
              <Link
                href="/dashboard/links"
                className={cn(button({ kind: "ghost", size: "lg", flush: true }), "text-stone-700")}
              >
                {unclaimed.length === 1 ? "1 link with no name" : `${unclaimed.length} links with no name`}
                <ArrowRight aria-hidden size={18} />
              </Link>
            </p>
          )}
        </>
      )}
    </>
  );
}
