"use client";

import { Heart, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useOptimistic, useState, useTransition } from "react";
import { reloadReelHome } from "@/app/homes/actions";
import { CommentThread } from "@/components/comment-thread";
import { CommentComposer, useThread, type ReplyTarget, type SpotRef } from "@/components/listing-thread";
import type { FeedPost } from "@/lib/feed";
import { cn } from "@/lib/format";
import type { FeedCounts } from "@/lib/home-feed";
import { mediaKeyOf } from "@/lib/photos";
import { NO_REACTION, toggleOverall, type ReactionState } from "@/lib/reactions";

// Under a home in a feed, as LinkedIn has it: one small bar, a heart with
// how many liked the home and a speech bubble with how many comments it
// has. The heart likes it right there (a public like, as the heart in the
// reel is), and the page keeps its place. The bubble unfurls the home's
// comments under the bar, the same thread as everywhere (Reply, hearts,
// replies folded under each), with the box to add one at its foot; tapped
// again, it folds away. Everything here goes through the feed's FeedGate:
// signed out, the first tap asks them to sign up.

export function FeedBar({
  listingKey,
  address,
  counts,
  mine,
  active,
  reelHref,
}: {
  listingKey: string;
  address: string;
  // How many liked it and how many comments it has, as the page loaded.
  counts: FeedCounts;
  // The viewer's own take on it, so the heart starts out right.
  mine: ReactionState | null;
  // Still for sale (or a pro's own deal): it takes likes and comments.
  active: boolean;
  // The homes full screen, on this one (`&photo=` goes to one of its photos).
  reelHref: string;
}) {
  const { actions, ensureName } = useThread();
  const router = useRouter();
  const id = useId();

  // The heart.
  const [saved, setSaved] = useState<ReactionState>(mine ?? NO_REACTION);
  const [shown, show] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const on = shown.reaction === "like";

  // The thread, once it's been asked for.
  const [open, setOpen] = useState(false);
  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // What the numbers rest on: the page's counts until the thread has loaded,
  // then the thread's own (and whether the viewer's like was among them).
  const [base, setBase] = useState({ likes: counts.likes, comments: counts.comments, liked: mine?.reaction === "like" });
  const likes = Math.max(0, base.likes + Number(on) - Number(base.liked));
  const comments = base.comments;

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const next = await reloadReelHome(listingKey).catch(() => null);
    if (next) {
      setPost(next);
      setBase({
        likes: next.likes,
        comments: next.timeline.filter((item) => item.kind === "comment").length,
        liked: next.mine.reaction === "like",
      });
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  const toggle = () => {
    if (!open && !post && !loading) void load();
    setOpen(!open);
  };

  // A comment about a spot in a photo: the home full screen, on that photo.
  const goToSpot = (spot: SpotRef) => {
    const media = [...(post?.listing.Media ?? [])].sort((a, b) => a.Order - b.Order);
    const index = media.findIndex((photo) => mediaKeyOf(photo) === spot.mediaKey);
    router.push(index >= 0 ? `${reelHref}&photo=${index}` : reelHref);
  };

  const count = (n: number) => (n > 0 ? <span className="tabular-nums">{n.toLocaleString("en-US")}</span> : null);

  return (
    <div className="relative z-20">
      <div className="mx-3.5 mt-2.5 border-t border-stone-100" />
      <div className="flex items-center gap-1 px-2 py-0.5">
        {active && (
          <button
            type="button"
            aria-pressed={on}
            aria-label={`Like ${address}${likes ? `, ${likes} ${likes === 1 ? "like" : "likes"}` : ""}`}
            onClick={async () => {
              if (!(await ensureName())) return;
              const next = toggleOverall(shown, "like");
              setError(null);
              startTransition(async () => {
                show(next);
                const result = await actions.react(listingKey, next);
                if (result.ok) setSaved(next);
                else setError(result.error);
              });
            }}
            className={cn(
              "flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-body font-semibold transition-colors",
              on ? "text-rose-600 hover:bg-rose-50" : "text-stone-700 hover:bg-stone-100",
            )}
          >
            <Heart aria-hidden size={22} className={cn(on && "fill-current")} />
            {count(likes)}
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={comments ? `Comments, ${comments}` : "Comments"}
          onClick={toggle}
          className={cn(
            "flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-body font-semibold transition-colors hover:bg-stone-100",
            open ? "text-ink" : "text-stone-700",
          )}
        >
          <MessageCircle aria-hidden size={22} />
          {count(comments)}
        </button>
        {!active && likes > 0 && (
          <span className="flex h-11 items-center gap-1.5 px-2.5 text-body font-semibold text-stone-700">
            <Heart aria-hidden size={22} />
            {count(likes)}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="px-3.5 pb-2 text-meta text-red-700">
          {error}
        </p>
      )}
      {open && (
        <section id={id} role="region" aria-label="Comments" className="px-3.5 pb-3">
          {post ? (
            <>
              <CommentThread
                post={post}
                mode="public"
                likes={likes}
                mineLiked={on}
                open
                look="inline"
                onOpen={() => {}}
                onClose={() => setOpen(false)}
                onAllComments={() => {}}
                onReply={setReplyTo}
                onGoToSpot={goToSpot}
                onChanged={() => void load()}
              />
              {active && (
                <div className="mt-2">
                  <CommentComposer
                    listingKey={listingKey}
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                    label="Add a comment"
                    quickOnFocus
                    onPosted={() => {
                      setReplyTo(null);
                      void load();
                    }}
                  />
                </div>
              )}
            </>
          ) : failed ? (
            <p role="alert" className="flex min-h-11 flex-wrap items-center gap-x-3 text-body text-stone-700">
              Couldn&apos;t load the comments.
              <button type="button" onClick={() => void load()} className="font-semibold text-brand underline-offset-2 hover:underline">
                Try again
              </button>
            </p>
          ) : (
            <p role="status" className="flex min-h-11 items-center text-body text-muted">
              Loading comments…
            </p>
          )}
        </section>
      )}
    </div>
  );
}
