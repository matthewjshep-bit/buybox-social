import { ArrowLeft, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { factsOf, LinkRow, NextStep, StatusSentence } from "@/components/client-list";
import { CopyLink } from "@/components/copy-link";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { getClientBook } from "@/lib/clients";
import { cn } from "@/lib/format";
import { duration } from "@/lib/shares";
import { button, card } from "@/lib/ui";

export const metadata = { title: "Client · Porchcard" };

// One client, plainly: who they are, where things stand, the next thing to
// do, how it's gone in a line, and every link of homes they've been sent, each
// opening its page (their likes, passes and words on each home, and replies).
// Only ever one of the agent's own clients.
export default async function ClientPage({ params }: { params: Promise<{ key: string }> }) {
  const agent = await requireAgent();
  const { key: raw } = await params;
  let key = raw;
  try {
    key = decodeURIComponent(raw);
  } catch {
    // Already plain.
  }
  const { clients } = await getClientBook(agent.id);
  const client = clients.find((c) => c.key === key);
  if (!client) notFound();

  // How it's gone, leaving out what the sentence above says already, and zeros.
  const tally = [
    client.status.kind !== "liked" && client.liked > 0 && `Liked ${client.liked} of ${client.homes}`,
    client.passed > 0 && `Passed on ${client.passed}`,
    client.comments > 0 && `${client.comments} ${client.comments === 1 ? "comment" : "comments"}`,
    client.seconds > 0 && `Spent ${duration(client.seconds)} looking`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <LiveRefresh />
      <Link href="/dashboard" className="-ml-2 inline-flex min-h-12 items-center gap-2 rounded-full px-2 text-lg font-medium hover:bg-black/5">
        <ArrowLeft aria-hidden size={20} /> All clients
      </Link>

      <section aria-labelledby="client-name" className={cn(card, "mt-4 p-6")}>
        <div className="flex items-start gap-5">
          <Avatar name={client.name} photo={client.photo} size={18} />
          <div className="min-w-0 flex-1">
            <h1 id="client-name" className="break-words font-display text-4xl leading-tight">
              {client.name}
            </h1>
            <StatusSentence status={client.status} className="mt-2" />
            <p className="mt-1 text-lg text-stone-600">{factsOf(client)}</p>
            {tally && <p className="mt-1 text-lg text-stone-600">{tally}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {/* Answer them, when they're waiting; their link, to send again, always. */}
          {(client.status.kind === "ask" || client.status.kind === "comment") && <NextStep client={client} />}
          <CopyLink path={client.linkPath} name={client.name} />
          <Link href="/dashboard/new?focus=to" className={button({ kind: "secondary", size: "lg" })}>
            <Plus aria-hidden size={20} /> Send more homes
          </Link>
          {client.profileId && (
            <Link href={`/people/${client.profileId}`} className={button({ kind: "ghost", size: "lg" })}>
              <UserRound aria-hidden size={20} /> Their profile
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="links-title" className="mt-10">
        <h2 id="links-title" className="text-2xl font-semibold">
          Homes you&apos;ve sent {client.name}
        </h2>
        <p className="mt-1 text-lg text-stone-600">Open a link to see what they thought of each home, and to reply.</p>
        <ul className={cn(card, "mt-4 divide-y divide-stone-200")}>
          {client.links.map((link) => (
            <LinkRow key={link.shareId} link={link} />
          ))}
        </ul>
      </section>
    </>
  );
}
