import { ArrowLeft, Globe, Heart, Plus, RotateCcw, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AspectSummary } from "@/components/aspect-summary";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl, cn, formatPrice, timeAgo } from "@/lib/format";
import { describeReaction, NO_REACTION, type AspectCounts, type ReactionState } from "@/lib/reactions";
import { getShareListings, getThread, type Share } from "@/lib/shares";
import { removeComment, setHomeRemoved } from "../../actions";
import { ClientNameEditor, ReplyForm, SendLink } from "./client";

type Listings = Awaited<ReturnType<typeof getShareListings>>;
type Thread = Awaited<ReturnType<typeof getThread>>;

// Everything one client has told this agent, on one page.
export default async function ShareDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [share] = await sql<Share[]>`
    select id, token, agent_id, client_name, note from shares
    where id = ${id} and agent_id = ${agent.id}`;
  if (!share) notFound();

  const [listings, thread] = await Promise.all([
    getShareListings(share.id, { includeRemoved: true }),
    getThread(share.id),
  ]);
  const active = listings.filter((l) => !l.removedAt);
  const removed = listings.filter((l) => l.removedAt);
  const clientName = share.client_name || "Unnamed client";

  return (
    <>
      <LiveRefresh />
      <Link href="/dashboard" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft aria-hidden size={16} /> All shares
      </Link>
      <ClientNameEditor shareId={share.id} name={share.client_name} />
      <SendLink url={`${appUrl()}/s/${share.token}`} clientName={share.client_name} count={active.length} />

      <ClientProfile clientName={clientName} listings={listings} thread={thread} />

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl">On their link</h2>
        <Link
          href={`/dashboard/new?share=${share.id}`}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold"
        >
          <Plus aria-hidden size={16} /> Add homes
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-6 text-center text-stone-700 ring-1 ring-stone-200">
          No homes on this link right now. Add some, or restore one below.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-5">
          {active.map((listing) => (
            <HomePanel key={listing.ListingKey} shareId={share.id} listing={listing} thread={thread} />
          ))}
        </div>
      )}

      {removed.length > 0 && (
        <section aria-labelledby="removed-title" className="mt-10">
          <h2 id="removed-title" className="font-display text-2xl">
            Removed from their link
          </h2>
          <p className="text-sm text-stone-700">
            {clientName} can&apos;t see these anymore. What they said about them still counts above.
          </p>
          <div className="mt-3 flex flex-col gap-5">
            {removed.map((listing) => (
              <HomePanel key={listing.ListingKey} shareId={share.id} listing={listing} thread={thread} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// What this client likes and passes on, across every home ever sent to them,
// including ones since removed. One row per person on the link.
function ClientProfile({
  clientName,
  listings,
  thread,
}: {
  clientName: string;
  listings: Listings;
  thread: Thread;
}) {
  type Person = {
    name: string;
    liked: number;
    passed: number;
    likes: AspectCounts;
    dislikes: AspectCounts;
    // Things they liked in photos, with how many homes.
    loved: Map<string, number>;
  };
  const people = new Map<string, Person>();
  const personFor = (participantId: string, name: string): Person => {
    const person: Person = people.get(participantId) ?? {
      name,
      liked: 0,
      passed: 0,
      likes: {},
      dislikes: {},
      loved: new Map(),
    };
    people.set(participantId, person);
    return person;
  };
  for (const r of thread.reactions) {
    const person = personFor(r.participantId, r.name);
    if (r.state.reaction === "like") person.liked++;
    if (r.state.reaction === "dislike") person.passed++;
    for (const a of r.state.liked) person.likes[a] = (person.likes[a] ?? 0) + 1;
    for (const a of r.state.disliked) person.dislikes[a] = (person.dislikes[a] ?? 0) + 1;
  }
  for (const like of thread.photoLikes) {
    const person = personFor(like.participantId, like.name);
    person.loved.set(like.tag, (person.loved.get(like.tag) ?? 0) + 1);
  }

  return (
    <section aria-labelledby="profile-title" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 id="profile-title" className="font-display text-2xl">
        What {clientName} wants
      </h2>
      {people.size === 0 ? (
        <p className="mt-1 text-stone-700">
          Once they react, you&apos;ll see what they like and pass on here, across every home you send.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {[...people.entries()].map(([participantId, person]) => (
            <li key={participantId}>
              <p className="text-[15px]">
                <span className="font-semibold">{person.name}</span> liked{" "}
                <span className="tabular-nums">{person.liked}</span> of{" "}
                <span className="tabular-nums">{listings.length}</span>{" "}
                {listings.length === 1 ? "home" : "homes"} · passed{" "}
                <span className="tabular-nums">{person.passed}</span>
              </p>
              <AspectSummary
                liked={person.likes}
                disliked={person.dislikes}
                likeLabel="Likes"
                dislikeLabel="Doesn't like"
                limit={10}
                className="mt-2"
              />
              {person.loved.size > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="flex items-center gap-1 font-semibold text-rose-800">
                    <Heart aria-hidden size={14} />
                    Loved in photos
                  </span>
                  {[...person.loved]
                    .sort((a, b) => b[1] - a[1])
                    .map(([tag, n]) => (
                      <span
                        key={tag}
                        className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-900 ring-1 ring-rose-200"
                      >
                        {tag} <span className="tabular-nums">{n}</span>
                      </span>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomePanel({
  shareId,
  listing,
  thread,
}: {
  shareId: string;
  listing: Listings[number];
  thread: Thread;
}) {
  // One line per person: their reaction plus what they liked in the photos.
  const lines = new Map<string, { name: string; state: ReactionState; tags: string[] }>();
  for (const r of thread.reactions.filter((r) => r.listingKey === listing.ListingKey)) {
    lines.set(r.participantId, { name: r.name, state: r.state, tags: [] });
  }
  for (const like of thread.photoLikes.filter((l) => l.listingKey === listing.ListingKey)) {
    const line = lines.get(like.participantId) ?? { name: like.name, state: NO_REACTION, tags: [] };
    line.tags.push(like.tag);
    lines.set(like.participantId, line);
  }
  const reactions = [...lines].map(([participantId, line]) => ({ participantId, ...line }));
  const comments = thread.comments.filter((c) => c.listingKey === listing.ListingKey);
  const isRemoved = Boolean(listing.removedAt);
  return (
    <section aria-label={listing.UnparsedAddress} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "relative size-16 shrink-0 overflow-hidden rounded-xl bg-stone-200",
            isRemoved && "opacity-60 grayscale",
          )}
        >
          <Image src={listing.Media[0]?.MediaURL} alt="" fill sizes="64px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{listing.UnparsedAddress}</h3>
          <p className="text-sm text-stone-700">
            {formatPrice(listing.ListPrice)} · {listing.City}
          </p>
        </div>
        <form action={setHomeRemoved.bind(null, shareId, listing.ListingKey, !isRemoved)}>
          <button
            type="submit"
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            {isRemoved ? <RotateCcw aria-hidden size={15} /> : <X aria-hidden size={15} />}
            {isRemoved ? "Restore" : "Remove"}
            <span className="sr-only"> {listing.UnparsedAddress}</span>
          </button>
        </form>
      </div>

      {reactions.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {reactions.map((r) => {
            const passed = r.state.reaction === "dislike";
            const Icon = passed ? ThumbsDown : r.state.reaction ? ThumbsUp : Heart;
            return (
              <li key={r.participantId} className="flex items-start gap-2">
                <Icon
                  aria-hidden
                  size={15}
                  className={cn(
                    "mt-0.5 shrink-0",
                    passed ? "text-amber-800" : r.state.reaction ? "text-emerald-700" : "text-rose-600",
                  )}
                />
                <span>
                  <span className="font-semibold">{r.name}</span> {describeReaction(r.state, r.tags)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-600">No reactions yet.</p>
      )}

      {comments.length > 0 && (
        <ul aria-label="Comments" className="mt-4 flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                  comment.isAgent ? "bg-ink" : "bg-brand",
                )}
              >
                {comment.name[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[15px] leading-snug">
                  <span className="font-semibold">{comment.name}</span>
                  {comment.isAgent && (
                    <span className="ml-1.5 rounded bg-ink px-1.5 py-px align-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
                      Agent
                    </span>
                  )}{" "}
                  <span className="whitespace-pre-line">{comment.body}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-stone-600">
                  <span>{timeAgo(comment.createdAt)}</span>
                  {comment.sharedPublicly && (
                    <span className="inline-flex items-center gap-1">
                      <Globe aria-hidden size={11} /> Shared publicly
                    </span>
                  )}
                </p>
              </div>
              <form action={removeComment.bind(null, comment.id)}>
                <button
                  type="submit"
                  aria-label={`Remove comment from ${comment.name}`}
                  className="-mt-1.5 flex size-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {!isRemoved && <ReplyForm shareId={shareId} listingKey={listing.ListingKey} />}
    </section>
  );
}
