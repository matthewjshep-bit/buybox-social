import { ArrowLeft, Globe, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl, formatPrice, timeAgo } from "@/lib/format";
import { getShareListings, getThread, type Share } from "@/lib/shares";
import { removeComment } from "../../actions";
import { ReplyForm, SendLink } from "./client";

const REACTION_LABELS = { love: "Love", maybe: "Maybe", pass: "Pass" } as const;

export default async function ShareDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [share] = await sql<Share[]>`
    select id, token, agent_id, client_name, note from shares
    where id = ${id} and agent_id = ${agent.id}`;
  if (!share) notFound();

  const [listings, thread] = await Promise.all([getShareListings(share.id), getThread(share.id)]);
  const shareUrl = `${appUrl()}/s/${share.token}`;

  return (
    <>
      <LiveRefresh />
      <Link href="/dashboard" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft aria-hidden size={16} /> All shares
      </Link>
      <h1 className="mt-1 font-display text-3xl">{share.client_name || "Unnamed client"}</h1>
      <SendLink url={shareUrl} clientName={share.client_name} count={listings.length} />

      <div className="mt-6 flex flex-col gap-5">
        {listings.map((listing) => {
          const reactions = thread.reactions.filter((r) => r.listingKey === listing.ListingKey);
          const comments = thread.comments.filter((c) => c.listingKey === listing.ListingKey);
          return (
            <section
              key={listing.ListingKey}
              aria-label={listing.UnparsedAddress}
              className="rounded-2xl bg-white p-4 ring-1 ring-stone-200"
            >
              <div className="flex items-center gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-stone-200">
                  <Image src={listing.Media[0]?.MediaURL} alt="" fill sizes="64px" className="object-cover" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{listing.UnparsedAddress}</h2>
                  <p className="text-sm text-stone-700">
                    {formatPrice(listing.ListPrice)} · {listing.City}
                  </p>
                </div>
              </div>

              {reactions.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                  {reactions.map((r) => (
                    <li key={r.participantId} className="rounded-full bg-stone-100 px-3 py-1">
                      <span className="font-semibold">{r.name}</span>: {REACTION_LABELS[r.reaction]}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-stone-600">No reactions yet.</p>
              )}

              {comments.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {comments.map((comment) => (
                    <li key={comment.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-semibold">{comment.isAgent ? "You" : comment.name}</span>
                        {comment.tag && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700">
                            {comment.tag === "like" ? (
                              <ThumbsUp aria-hidden size={12} />
                            ) : (
                              <ThumbsDown aria-hidden size={12} />
                            )}
                            {comment.tag === "like" ? "Like" : "Don't like"}
                          </span>
                        )}
                        <span className="text-xs text-stone-600">{timeAgo(comment.createdAt)}</span>
                        {comment.sharedPublicly && (
                          <span className="inline-flex items-center gap-1 text-xs text-stone-600">
                            <Globe aria-hidden size={12} /> Shared publicly
                          </span>
                        )}
                        <form action={removeComment.bind(null, comment.id)} className="ml-auto">
                          <button
                            type="submit"
                            aria-label={`Remove comment from ${comment.name}`}
                            className="flex size-9 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-200"
                          >
                            <Trash2 aria-hidden size={15} />
                          </button>
                        </form>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line break-words text-[15px]">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <ReplyForm shareId={share.id} listingKey={listing.ListingKey} />
            </section>
          );
        })}
      </div>
    </>
  );
}
