import { MessageCircle, Plus, Send, Sparkles, ThumbsUp, User } from "lucide-react";
import Link from "next/link";
import { addPublicComment, joinPublic, setPublicReaction } from "@/app/homes/actions";
import { AspectSummary } from "@/components/aspect-summary";
import { CommentComposer, NameGate, ReactionPicker } from "@/components/listing-thread";
import { LiveRefresh } from "@/components/live-refresh";
import { PhotoCarousel } from "@/components/photo-carousel";
import { firstName, type Account } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getFeed, type FeedPost, type Headline } from "@/lib/feed";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { describeReaction } from "@/lib/reactions";
import { FEED_SORTS, type FeedSort } from "@/lib/search-options";

// The signed-in home page: what people think about homes, one post per home.
export async function Feed({ user, sort }: { user: Account; sort: FeedSort }) {
  const posts = await getFeed(user, await readDevice(), sort);
  return (
    <NameGate
      actions={{ join: joinPublic, react: setPublicReaction, comment: addPublicComment }}
      myName={firstName(user)}
      prompt="Your first name shows next to what you post."
    >
      <LiveRefresh />
      <main className="mx-auto max-w-6xl pb-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6 sm:px-0">
          <div>
            <h1 className="font-display text-3xl">Your feed</h1>
            <p className="text-stone-700">What people like, dislike and say about homes.</p>
          </div>
          {user.role === "agent" && (
            <Link
              href="/dashboard/new"
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white"
            >
              <Plus aria-hidden size={16} /> New share
            </Link>
          )}
        </div>

        <nav aria-label="Sort the feed" className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0">
          {Object.entries(FEED_SORTS).map(([value, label]) => {
            const current = value === sort;
            return (
              <Link
                key={value}
                href={value === "latest" ? "/" : `/?sort=${value}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                  current ? "border-ink bg-ink text-white" : "border-stone-300 bg-white text-stone-800 hover:border-stone-500",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {posts.length === 0 ? (
          <p className="mx-4 mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200 sm:mx-0">
            No active listings right now.
          </p>
        ) : (
          <div className="mt-5 flex flex-col sm:gap-6">
            {posts.map((post, index) => (
              <FeedPostCard key={post.listing.ListingKey} post={post} priority={index === 0} />
            ))}
          </div>
        )}
      </main>
    </NameGate>
  );
}

function headlineText(headline: Headline | null) {
  if (!headline) return "New listing";
  if (headline.kind === "sent") {
    return headline.who === "you" ? "You sent this to a client" : "An agent sent this to a buyer";
  }
  const who =
    headline.who === "anonymous" ? "A buyer" : headline.who === "client" ? `${headline.name}, your client,` : headline.name;
  if (headline.kind === "comment") return headline.who === "anonymous" ? "A buyer commented privately" : `${who} commented`;
  return `${who} ${describeReaction(headline.state, { pass: headline.who === "client" })}`;
}

function HeadlineAvatar({ headline }: { headline: Headline | null }) {
  const base = "flex size-10 shrink-0 items-center justify-center rounded-full";
  if (headline && "name" in headline) {
    return (
      <span aria-hidden className={`${base} bg-brand font-semibold text-white`}>
        {headline.name[0]?.toUpperCase()}
      </span>
    );
  }
  const Icon = !headline ? Sparkles : headline.kind === "sent" ? Send : User;
  return (
    <span aria-hidden className={`${base} bg-stone-200 text-stone-700`}>
      <Icon size={18} />
    </span>
  );
}

function likesText({ likes, likers }: FeedPost) {
  if (likers.length === 0) return `${likes} ${likes === 1 ? "like" : "likes"}`;
  const others = likes - likers.length;
  if (others <= 0) return `Liked by ${likers.join(" and ")}`;
  return `Liked by ${likers.join(", ")} and ${others} ${others === 1 ? "other" : "others"}`;
}

// Stacked like a social post on phones; photos beside the conversation on desktop.
function FeedPostCard({ post, priority }: { post: FeedPost; priority: boolean }) {
  const { listing, headline } = post;
  const href = `/homes/${encodeURIComponent(listing.ListingKey)}`;
  return (
    <article
      aria-label={listing.UnparsedAddress}
      className="overflow-hidden border-b border-stone-200 bg-white sm:rounded-2xl sm:border lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]"
    >
      <header className="flex items-center gap-3 px-4 py-3 lg:col-start-2 lg:row-start-1 lg:border-b lg:border-stone-100 lg:px-5">
        <HeadlineAvatar headline={headline} />
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className="font-semibold">{headlineText(headline)}</p>
          <p className="truncate text-stone-600">
            {listing.City}, {listing.StateOrProvince}
            {headline && ` · ${timeAgo(headline.at)}`}
          </p>
        </div>
      </header>

      <div className="bg-stone-100 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:min-h-[28rem]">
        <PhotoCarousel media={listing.Media} address={listing.UnparsedAddress} priority={priority} fillHeight />
      </div>

      <div className="flex flex-col px-4 pb-4 pt-3 lg:col-start-2 lg:row-start-2 lg:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-2xl font-semibold tabular-nums">{formatPrice(listing.ListPrice)}</p>
          <Link href={href} scroll={false} className="flex min-h-11 items-center px-1 text-sm font-semibold text-brand">
            Details
          </Link>
        </div>
        <p className="text-sm text-stone-700">
          {listing.BedroomsTotal} bd · {listing.BathroomsTotalInteger} ba ·{" "}
          {listing.LivingArea.toLocaleString("en-US")} sq ft · {listing.UnparsedAddress}
        </p>

        <AspectSummary liked={post.aspects.liked} disliked={post.aspects.disliked} limit={4} className="mt-3" />

        <div className="mt-4">
          <ReactionPicker
            listingKey={listing.ListingKey}
            reactions={post.mine.reaction ? [{ name: "You", state: post.mine, mine: true }] : []}
          />
        </div>

        <div className="mt-3 text-[15px] leading-relaxed">
          {post.likes > 0 && (
            <p className="flex items-center gap-1.5 font-semibold">
              <ThumbsUp aria-hidden size={15} className="text-emerald-700" />
              {likesText(post)}
            </p>
          )}

          {post.highlight && (
            <blockquote className="mt-2 border-l-2 border-brand pl-3">
              <p className="break-words">&ldquo;{post.highlight}&rdquo;</p>
              <footer className="text-xs text-stone-600">A buyer, shared from a private chat</footer>
            </blockquote>
          )}

          {post.publicComments > post.recentComments.length && (
            <Link href={href} scroll={false} className="mt-2 flex min-h-11 items-center gap-1.5 text-stone-600">
              <MessageCircle aria-hidden size={15} />
              View all {post.publicComments} comments
            </Link>
          )}
          {post.recentComments.map((comment) => (
            <p key={comment.id} className="mt-1 break-words">
              <span className="font-semibold">{comment.name}</span> {comment.body}
            </p>
          ))}
          {post.privateComments > 0 && (
            <p className="mt-1 text-sm text-stone-600">
              {post.privateComments} more in private chats with agents
            </p>
          )}
        </div>

        <div className="mt-auto">
          <CommentComposer compact listingKey={listing.ListingKey} />
        </div>
      </div>
    </article>
  );
}
