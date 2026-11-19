import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { factsOf, LinkRow, lookAlikes, StatusSentence } from "@/components/client-list";
import { CopyLink } from "@/components/copy-link";
import { ClientFeed } from "@/components/home/client-feed";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { getClientCards } from "@/lib/client-feed";
import { getClientBook, replyHref } from "@/lib/clients";
import { cn } from "@/lib/format";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { ensureAccountVisitor } from "@/lib/public";
import { duration } from "@/lib/shares";
import { backLink, button, card, sectionTitle } from "@/lib/ui";

type Props = { params: Promise<{ key: string }> };

// One of the signed-in agent's own clients, by the key in the page's address.
async function clientOf(params: Props["params"]) {
  const agent = await requireAgent();
  const { key: raw } = await params;
  let key = raw;
  try {
    key = decodeURIComponent(raw);
  } catch {
    // Already plain.
  }
  const { clients } = await getClientBook(agent.id);
  return { agent, client: clients.find((c) => c.key === key) };
}

// The tab says who: their first name, as the agent knows them.
export async function generateMetadata({ params }: Props) {
  const { client } = await clientOf(params);
  return { title: `${client?.name ?? "Client"} · Porchcard` };
}

// One client, plainly: who they are, where things stand, the next thing to
// do, how it's gone in a line, what they did on the homes they were sent
// (whatever is waiting for an answer first, each with Reply right there), and
// every link of homes they've been sent, each opening its page. Only ever one
// of the agent's own clients.
export default async function ClientPage({ params }: Props) {
  const { agent, client } = await clientOf(params);
  if (!client) notFound();

  const [cards, mine] = await Promise.all([
    getClientCards(agent.id, { participantIds: client.participantIds, most: 10 }),
    ensureAccountVisitor(agent),
  ]);
  const me = {
    name: agent.full_name.trim() || agent.email,
    photo: photoUrl(mine.id, photoVersion(agent.photo_data_url)),
  };
  const did = cards.length > 0 || client.asks.length > 0;
  // Two links that went the same day with the same first home say what time.
  const alike = lookAlikes(client.links);
  const profile = client.profileId && `/people/${client.profileId}`;

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
      <Link href="/dashboard" className={backLink}>
        <ArrowLeft aria-hidden size={18} /> All clients
      </Link>

      <section aria-labelledby="client-name" className={cn(card, "mt-4 p-6")}>
        <div className="flex items-start gap-5">
          {/* Their face and their name open their public page, once they have one. */}
          {profile ? (
            <Link href={profile} aria-hidden tabIndex={-1} className="shrink-0 rounded-full">
              <Avatar name={client.name} photo={client.photo} size={18} />
            </Link>
          ) : (
            <Avatar name={client.name} photo={client.photo} size={18} />
          )}
          <div className="min-w-0 flex-1">
            <h1 id="client-name" className="break-words font-display text-4xl leading-tight">
              {profile ? (
                <Link href={profile} className="underline-offset-4 hover:underline">
                  {client.name}
                </Link>
              ) : (
                client.name
              )}
            </h1>
            <StatusSentence status={client.status} className="mt-2" />
            <p className="mt-1 text-lg text-stone-600">{factsOf(client)}</p>
            {tally && <p className="mt-1 text-lg text-stone-600">{tally}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {/* Three at most. While they're waiting, Reply is the one filled
              button, and goes down the page to what they said; otherwise the
              thing to do is send them more. Their link, to send again, always. */}
          {client.reply && (
            <Link href={did ? "#did" : replyHref(client.reply)} className={button({ kind: "primary", size: "lg" })}>
              Reply<span className="sr-only"> to {client.name}</span>
            </Link>
          )}
          {/* More homes go onto their newest link, so they stay in one place. */}
          <Link
            href={`/dashboard/new?share=${client.links[0].shareId}`}
            className={button({ kind: client.waiting ? "secondary" : "primary", size: "lg" })}
          >
            <Plus aria-hidden size={20} /> Send more homes
          </Link>
          <CopyLink path={client.linkPath} name={client.name} />
        </div>
      </section>

      {did && (
        <section id="did" aria-labelledby="did-title" className="mt-10 scroll-mt-4">
          <h2 id="did-title" className={sectionTitle}>
            What {client.name} did
          </h2>
          <div className="mt-4">
            <ClientFeed cards={cards} me={me} asks={client.asks} end={false} />
          </div>
        </section>
      )}

      <section aria-labelledby="links-title" className="mt-10">
        <h2 id="links-title" className={sectionTitle}>
          Sent to {client.name}
        </h2>
        <ul className={cn(card, "mt-4 divide-y divide-stone-200")}>
          {client.links.map((link) => (
            <LinkRow key={link.shareId} link={link} timed={alike.has(link.shareId)} />
          ))}
        </ul>
      </section>
    </>
  );
}
