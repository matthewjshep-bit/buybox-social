import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { ListingCard, NameGate } from "@/components/listing-thread";
import { LiveRefresh } from "@/components/live-refresh";
import { readDevice } from "@/lib/engagement";
import { isSampleListing } from "@/lib/listings/types";
import { getParticipant, getShareByToken, getShareListings, getThread } from "@/lib/shares";
import { addComment, joinThread, setCommentSharing, setReaction } from "./actions";
import { InviteButton } from "./client";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const found = await getShareByToken(token);
  if (!found) return { title: "Link not available", robots: { index: false } };
  const listings = await getShareListings(found.share.id);
  const title = `${found.agent.full_name || "Your agent"} picked ${
    listings.length === 1 ? listings[0].UnparsedAddress : `${listings.length} homes`
  } for you`;
  const description = "Take a look and tell me what you think.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const found = await getShareByToken(token);
  if (!found) notFound();
  const { share, agent } = found;

  const [listings, thread, device] = await Promise.all([
    getShareListings(share.id),
    getThread(share.id),
    readDevice(),
  ]);
  const me = await getParticipant(share.id, device);
  const agentName = agent.full_name || "Your agent";
  const count = listings.length;

  return (
    <div style={{ "--brand": agent.brand_color } as React.CSSProperties} className="min-h-dvh">
      <LiveRefresh />
      <NameGate
        actions={{
          join: joinThread.bind(null, token),
          react: setReaction.bind(null, token),
          comment: addComment.bind(null, token),
          setSharing: setCommentSharing.bind(null, token),
        }}
        myName={me?.first_name ?? null}
        prompt={`So ${agentName} and anyone else on this link know who's talking. No account or password needed.`}
      >
        <header className="bg-brand px-5 pb-16 pt-8 text-white">
          <div className="mx-auto max-w-xl">
            <div className="flex items-center gap-3">
              <AgentAvatar agent={agent} size={52} className="ring-2 ring-white/70" />
              <div className="min-w-0 text-sm leading-snug">
                <p className="truncate font-semibold">{agentName}</p>
                {agent.brokerage && <p className="truncate text-white/85">{agent.brokerage}</p>}
              </div>
            </div>
            <h1 className="mt-6 font-display text-3xl leading-tight sm:text-4xl">
              {share.client_name ? `${share.client_name}, I` : "I"} picked{" "}
              {count === 1 ? "this home" : `these ${count} homes`} for you
            </h1>
            {share.note && (
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-white/90">
                {share.note}
              </p>
            )}
          </div>
        </header>

        <main className="mx-auto -mt-10 flex max-w-xl flex-col gap-6 px-3 pb-8 sm:px-0">
          {listings.map((listing, index) => (
            <ListingCard
              key={listing.ListingKey}
              pass
              listing={listing}
              priority={index === 0}
              reactions={thread.reactions
                .filter((r) => r.listingKey === listing.ListingKey)
                .map((r) => ({ name: r.name, state: r.state, mine: r.participantId === me?.id }))}
              comments={thread.comments
                .filter((c) => c.listingKey === listing.ListingKey)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  isAgent: c.isAgent,
                  tag: c.tag,
                  body: c.body,
                  createdAt: c.createdAt,
                  mine: c.participantId !== null && c.participantId === me?.id,
                  sharedPublicly: c.sharedPublicly,
                }))}
            />
          ))}

          <section className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-stone-200">
            <h2 className="font-display text-xl">Deciding with someone?</h2>
            <p className="mt-1 text-sm text-stone-600">
              Send them this link so you can all weigh in here, together with {agentName}.
            </p>
            <InviteButton token={token} />
          </section>
        </main>

        <footer className="mx-auto max-w-xl px-5 pb-10 text-center text-xs leading-relaxed text-stone-600">
          {listings.some(isSampleListing) && (
            <p className="font-medium">
              Sample listings for demonstration. These homes are fictional and not for sale.
            </p>
          )}
          <p className="mt-1">Anyone with this link can see and join this conversation.</p>
        </footer>
      </NameGate>
    </div>
  );
}
