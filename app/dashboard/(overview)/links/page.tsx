import { Send } from "lucide-react";
import Link from "next/link";
import { LinkRow, lookAlikes } from "@/components/client-list";
import { street } from "@/components/client-status";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { getClientBook, type ClientLink } from "@/lib/clients";
import { cn } from "@/lib/format";
import { button, card, pageTitle } from "@/lib/ui";
import { FindClient } from "../find-client";
import { DeleteLink } from "./delete-link";

// Every link the agent has sent, newest first, whoever it went to: who it's
// for, the homes on it and when it went, how it's gone in a few words, and
// one button (the link to copy while nobody has opened it, otherwise its
// page). A link nobody has opened and nobody is named on can be deleted here,
// and only here. With more than eight there's a box to find one by name or
// address, and three choices of which to show.

// How many links before there's a box to find one, and the choices.
const FIND_ABOVE = 8;

const SHOW = [
  { key: "all", label: "All", test: () => true },
  { key: "waiting", label: "Waiting for you", test: (link: ClientLink) => link.waiting },
  { key: "unopened", label: "Not opened", test: (link: ClientLink) => !link.openedAt },
] as const;

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // (An agent with no name yet was sent to add it: see ../layout.tsx.)
  const agent = await requireAgent();
  const [{ links }, { show: asked }] = await Promise.all([getClientBook(agent.id), searchParams]);
  const many = links.length > FIND_ABOVE;
  const show = (many && SHOW.find((choice) => choice.key === asked)) || SHOW[0];
  const shown = links.filter(show.test);
  // Told apart among all of them, so a row reads the same whichever are shown.
  const alike = lookAlikes(links);

  return (
    <>
      <LiveRefresh />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className={pageTitle}>Links</h1>
        <Link href="/dashboard/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Send aria-hidden size={20} /> Send homes
        </Link>
      </div>

      {links.length === 0 ? (
        <EmptyState icon={Send} title="Send your first homes" className="mt-8">
          Every link you send shows up here.
        </EmptyState>
      ) : (
        <>
          {many && (
            <nav aria-label="Which links to show" className="mt-6 flex flex-wrap gap-1.5 px-0.5">
              {SHOW.map((choice) => (
                <Link
                  key={choice.key}
                  href={choice.key === "all" ? "/dashboard/links" : `/dashboard/links?show=${choice.key}`}
                  scroll={false}
                  aria-current={choice === show ? "true" : undefined}
                  className={cn(
                    // (The Home pills: a 44px touch area around a 36px pill.)
                    "flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors hit-44",
                    choice === show ? "bg-ink text-white" : "text-ink hover:bg-black/5",
                  )}
                >
                  {choice.label}
                </Link>
              ))}
            </nav>
          )}
          {shown.length === 0 ? (
            <p className={cn(card, "mt-6 p-6 text-center text-lg text-stone-700")}>
              {show.key === "waiting" ? "Nobody is waiting for you." : "Every link has been opened."}
            </p>
          ) : (
            <FindClient
              label="Find a link"
              none="No link by that name or address."
              find={many}
              groups={[
                {
                  label: "Links",
                  rows: shown.map((link) => {
                    const what = link.firstAddress ? street(link.firstAddress) : "no homes";
                    return {
                      id: link.shareId,
                      text: `${link.for.join(" ")} ${link.firstAddress ?? ""}`,
                      node: (
                        <LinkRow
                          link={link}
                          lead="who"
                          timed={alike.has(link.shareId)}
                          // Only a link nobody has opened, with nobody on it.
                          more={!link.openedAt && link.people === 0 && <DeleteLink shareId={link.shareId} what={what} />}
                        />
                      ),
                    };
                  }),
                },
              ]}
            />
          )}
        </>
      )}
    </>
  );
}
