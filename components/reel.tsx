"use client";

import {
  ArrowUp,
  Bath,
  Bed,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Ruler,
  Send,
  Share2,
  Sparkles,
  ThumbsDown,
  User,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { loadReel, recordView, reloadReelHome } from "@/app/homes/actions";
import { AspectSummary } from "@/components/aspect-summary";
import { AspectChips, useReactions } from "@/components/like-pass";
import { CommentComposer, NameGate, Timeline, type ReplyTarget, type ThreadActions } from "@/components/listing-thread";
import { usePhotoLikes } from "@/components/photo-likes";
import { ReelPhotos } from "@/components/reel-photos";
import { Sheet } from "@/components/sheet";
import { NudgeHint, useNudges, type Nudge } from "@/components/walkthrough";
import type { FeedPost, Headline } from "@/lib/feed";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { isSampleListing, type ListingMedia } from "@/lib/listings/types";
import { photoTags, tagPhrase } from "@/lib/photos";
import { describeReaction, NO_REACTION, type Aspect, type ReactionState } from "@/lib/reactions";

// The feed: one home per screen, scrolled up like a reel, for as long as you
// keep going. Photos fill the screen; the price, the facts and who's talking
// sit over them, with the buttons down the right-hand side.

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ReelFeed({
  initial,
  mode,
  actions,
  myName,
  prompt,
  header,
  intro,
  end,
  infinite = false,
  embedded = false,
  agentName,
  canInvite = true,
  focus,
  onActiveChange,
}: {
  initial: FeedPost[];
  // Public pages, or an agent's private link.
  mode: "public" | "share";
  actions: ThreadActions;
  myName: string | null;
  prompt: string;
  // Floats over the top of the feed.
  header?: ReactNode;
  // A first screen before the homes (an agent's note).
  intro?: ReactNode;
  // The last screen, after the homes.
  end?: ReactNode;
  // Loads more homes as you near the end.
  infinite?: boolean;
  // Inside a pop-out rather than filling the screen.
  embedded?: boolean;
  agentName?: string;
  // On an agent's link: whether its share button invites others onto it.
  canInvite?: boolean;
  // Brings a home into view: the map's pins pick a home this way. `n` counts
  // picks, so picking the same home again still moves to it.
  focus?: { key: string; n: number } | null;
  // Tells the page which home is showing, as you scroll.
  onActiveChange?: (listingKey: string | null) => void;
}) {
  // The order is fixed when the page opens, so a background refresh never
  // reshuffles the homes under your thumb. Agent links follow the page, which
  // reloads after every change there.
  const [first] = useState(initial);
  const [more, setMore] = useState<FeedPost[]>([]);
  const [reloaded, setReloaded] = useState<Record<string, FeedPost>>({});
  const [hasMore, setHasMore] = useState(infinite);
  const [loading, setLoading] = useState(false);
  const posts = (mode === "share" ? initial : [...first, ...more]).map(
    (post) => reloaded[post.listing.ListingKey] ?? post,
  );

  const reload = useCallback(async (listingKey: string) => {
    if (mode === "share") return;
    const post = await reloadReelHome(listingKey);
    if (post) setReloaded((current) => ({ ...current, [listingKey]: post }));
  }, [mode]);

  // On public pages, saving a comment reloads just that home's conversation.
  const threadActions: ThreadActions =
    mode === "share"
      ? actions
      : {
          ...actions,
          comment: async (listingKey, body, sharePublicly, parentId) => {
            const result = await actions.comment(listingKey, body, sharePublicly, parentId);
            if (result.ok) reload(listingKey);
            return result;
          },
        };

  return (
    <NameGate actions={threadActions} myName={myName} prompt={prompt}>
      <Feed
        posts={posts}
        mode={mode}
        header={header}
        intro={intro}
        end={end}
        embedded={embedded}
        agentName={agentName}
        canInvite={canInvite}
        focus={focus}
        onActiveChange={onActiveChange}
        hasMore={hasMore}
        loading={loading}
        onNearEnd={async () => {
          if (!hasMore || loading) return;
          setLoading(true);
          const next = await loadReel(posts.map((post) => post.listing.ListingKey)).catch(() => []);
          setMore((current) => [...current, ...next]);
          if (next.length === 0) setHasMore(false);
          setLoading(false);
        }}
      />
    </NameGate>
  );
}

function Feed({
  posts,
  mode,
  header,
  intro,
  end,
  embedded,
  agentName,
  canInvite,
  focus,
  onActiveChange,
  hasMore,
  loading,
  onNearEnd,
}: {
  posts: FeedPost[];
  mode: "public" | "share";
  header?: ReactNode;
  intro?: ReactNode;
  end?: ReactNode;
  embedded: boolean;
  agentName?: string;
  canInvite: boolean;
  focus?: { key: string; n: number } | null;
  onActiveChange?: (listingKey: string | null) => void;
  hasMore: boolean;
  loading: boolean;
  onNearEnd: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [sheet, setSheet] = useState<{ kind: "comments" | "more"; key: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reactions = useReactions(Object.fromEntries(posts.map((post) => [post.listing.ListingKey, post.mine])));
  const offset = intro ? 1 : 0;
  const panelCount = offset + posts.length + 1;
  const activePost = posts[active - offset];

  // Which screen is showing.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.panel));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-panel]").forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [panelCount]);

  // More homes before you reach the end.
  useEffect(() => {
    if (hasMore && active >= offset + posts.length - 3) onNearEnd();
  }, [active, hasMore, offset, posts.length, onNearEnd]);

  // A home counts as viewed once it's been on screen for a moment.
  const viewed = useRef(new Set<string>());
  useEffect(() => {
    const key = activePost?.listing.ListingKey;
    if (!key || viewed.current.has(key)) return;
    const timer = setTimeout(() => {
      viewed.current.add(key);
      recordView(key).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [activePost]);

  const goTo = (index: number, instant = false) => {
    const root = scroller.current;
    if (!root) return;
    const target = Math.max(0, Math.min(panelCount - 1, index));
    root.scrollTo({ top: target * root.clientHeight, behavior: instant || reducedMotion() ? "auto" : "smooth" });
  };

  // Tell the page which home is showing.
  const activeKey = activePost?.listing.ListingKey ?? null;
  const report = useRef(onActiveChange);
  useLayoutEffect(() => {
    report.current = onActiveChange;
  });
  useEffect(() => {
    report.current?.(activeKey);
  }, [activeKey]);

  // On an agent's link, the first time: how to see more photos, then more homes.
  const nudges = useNudges({
    enabled: mode === "share" && !embedded && !sheet,
    home: activeKey,
    photoCount: activePost?.listing.Media.length ?? 0,
    hasNext: active - offset < posts.length - 1,
  });

  // Go to a home picked elsewhere (a pin on the map). The first pick, from the
  // page's address, jumps straight there.
  useEffect(() => {
    if (!focus) return;
    const index = posts.findIndex((post) => post.listing.ListingKey === focus.key);
    if (index === -1) return;
    goTo(offset + index, focus.n === 0);
    // Only a new pick should move the feed, not new posts arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // ↑ and ↓ move between homes, unless you're typing or a sheet is open.
  useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
      if (event.key === "ArrowDown" || event.key === "PageDown") goTo(active + 1);
      else if (event.key === "ArrowUp" || event.key === "PageUp") goTo(active - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Comments rise from the bottom. From the comment bar, the cursor goes
  // straight into the comment box, in the same tap, so a phone opens its
  // keyboard (it won't for focus that arrives later).
  const openComments = (key: string, compose = false) => {
    flushSync(() => setSheet({ kind: "comments", key }));
    if (compose) frame.current?.ownerDocument.querySelector<HTMLElement>("dialog[open] [data-composer]")?.focus();
  };

  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const share = async (post: FeedPost) => {
    const url =
      mode === "share" ? window.location.href : `${window.location.origin}/homes/${encodeURIComponent(post.listing.ListingKey)}`;
    const title = `${post.listing.UnparsedAddress} · ${formatPrice(post.listing.ListPrice)}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        say("Link copied");
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  };

  const sheetPost = sheet && posts.find((post) => post.listing.ListingKey === sheet.key);
  const reviewed = posts.filter((post) => reactions.states[post.listing.ListingKey]?.reaction).length;

  return (
    <div
      ref={frame}
      className={cn(
        // Its width, not the window's, decides the layout of each home.
        "overflow-hidden bg-stone-950 text-white @container",
        header ? "[--chrome-top:4rem]" : "[--chrome-top:0.75rem]",
        embedded ? "relative h-full w-full" : "fixed inset-0 z-30",
      )}
    >
      {mode === "public" && !embedded && <h1 className="sr-only">Homes for you</h1>}
      <div
        ref={scroller}
        data-reel
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {intro && (
          <section data-panel={0} aria-label="Welcome" className="relative h-full snap-start snap-always">
            {intro}
          </section>
        )}
        {posts.map((post, i) => {
          const key = post.listing.ListingKey;
          const state = reactions.states[key] ?? NO_REACTION;
          return (
            <Panel
              key={key}
              index={offset + i}
              post={post}
              mode={mode}
              active={active === offset + i}
              near={Math.abs(active - (offset + i)) <= 1}
              nudge={active === offset + i ? nudges.showing : null}
              onSwipe={active === offset + i ? nudges.onSwipe : undefined}
              state={state}
              base={reactions.base[key] ?? NO_REACTION}
              error={reactions.errors[key]}
              onLike={() => reactions.choose(key, "like")}
              onDoubleTapLike={() => reactions.like(key)}
              onComments={() => openComments(key)}
              onCompose={() => openComments(key, true)}
              squeezed={sheet?.kind === "comments" && sheet.key === key}
              onMore={() => setSheet({ kind: "more", key })}
              onShare={mode === "share" && !canInvite ? undefined : () => share(post)}
            />
          );
        })}
        <section
          data-panel={offset + posts.length}
          aria-label="The end"
          className="relative flex h-full snap-start snap-always flex-col items-center justify-center overflow-y-auto px-6 py-24 text-center"
        >
          {hasMore || loading ? (
            <p role="status" className="text-white/80">
              Finding more homes…
            </p>
          ) : (
            <>
              {mode === "share" && posts.length > 0 && (
                <p className="mb-3 text-sm text-white/80">
                  You&apos;ve reacted to {reviewed} of {posts.length} {posts.length === 1 ? "home" : "homes"}.
                </p>
              )}
              {end}
              {!embedded && (
                <button
                  type="button"
                  onClick={() => goTo(0)}
                  className="mt-6 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  <ArrowUp aria-hidden size={16} /> Back to the top
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {header && (
        // Out of the way while the comments are up, so the photo has the top.
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-20 transition-opacity duration-300",
            sheet?.kind === "comments" && "pointer-events-none opacity-0",
          )}
        >
          {header}
        </div>
      )}
      {mode === "share" && posts.length > 1 && active >= offset && active < offset + posts.length && (
        <p
          aria-live="polite"
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+4rem)] z-20 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold tabular-nums backdrop-blur-sm"
        >
          {active - offset + 1} of {posts.length}
        </p>
      )}
      {toast && (
        <p
          role="status"
          className="absolute bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-lg"
        >
          {toast}
        </p>
      )}

      <CommentsSheet
        post={sheet?.kind === "comments" ? (sheetPost ?? null) : null}
        mode={mode}
        canShare={sheetPost ? reactions.states[sheetPost.listing.ListingKey]?.reaction === "like" : false}
        anchor={frame}
        onClose={() => setSheet(null)}
      />
      <MoreSheet
        post={sheet?.kind === "more" ? (sheetPost ?? null) : null}
        state={sheetPost ? (reactions.states[sheetPost.listing.ListingKey] ?? NO_REACTION) : NO_REACTION}
        agentName={agentName}
        anchor={frame}
        onPass={() => sheetPost && reactions.choose(sheetPost.listing.ListingKey, "dislike")}
        onToggle={(aspect) => sheetPost && reactions.toggle(sheetPost.listing.ListingKey, aspect)}
        onNext={() => {
          setSheet(null);
          goTo(active + 1);
        }}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

function Panel({
  index,
  post,
  mode,
  active,
  near,
  nudge,
  onSwipe,
  state,
  base,
  error,
  onLike,
  onDoubleTapLike,
  onComments,
  onCompose,
  squeezed,
  onMore,
  onShare,
}: {
  index: number;
  post: FeedPost;
  mode: "public" | "share";
  active: boolean;
  // Close enough to load its photos.
  near: boolean;
  nudge: Nudge | null;
  // Moved on to another photo.
  onSwipe?: () => void;
  state: ReactionState;
  base: ReactionState;
  error?: string;
  onLike: () => void;
  onDoubleTapLike: () => void;
  onComments: () => void;
  // The comment bar: comments open with the cursor in the box.
  onCompose: () => void;
  // Its comments are open: the photo moves up into the space above them.
  squeezed: boolean;
  onMore: () => void;
  onShare?: () => void;
}) {
  const { listing } = post;
  const [photo, setPhoto] = useState(0);
  // Photos load as a home comes close, and stay once loaded.
  const [loaded, setLoaded] = useState(near);
  if (near && !loaded) setLoaded(true);
  const photos = usePhotoLikes(listing.ListingKey, post.photoLikes);
  const liked = state.reaction === "like";
  // Everyone who liked the home or anything in its photos, once each; yours
  // counts the moment you tap.
  const likes =
    post.likes - (base.reaction === "like" || photos.hadAny ? 1 : 0) + (liked || photos.hasAny ? 1 : 0);
  const current = listing.Media[photo];
  // Everything in the photo on screen, for the list that slides out of the heart.
  const things =
    current && photos.enabled
      ? photoTags(current).map((tag) => ({
          tag,
          liked: photos.isLiked(current, tag),
          count: photos.count(current, tag),
          toggle: () => photos.set(current, tag, !photos.isLiked(current, tag)),
        }))
      : [];
  const comments = post.timeline.filter((item) => item.kind === "comment").length;

  const likeWhatsShown = (shown: ListingMedia) => {
    onDoubleTapLike();
    const subject = photoTags(shown)[0];
    if (subject && photos.enabled && !photos.isLiked(shown, subject)) photos.set(shown, subject, true);
  };

  return (
    <article
      data-panel={index}
      data-home={listing.ListingKey}
      aria-label={listing.UnparsedAddress}
      // The photo sits between the words at the top left and those at the
      // bottom: when narrow, right under the top ones, leaving the buttons
      // room below it; when wide, centred.
      className="relative h-full snap-start snap-always overflow-hidden bg-stone-950 [--photo-align:0] [--photo-bottom:14.5rem] [--photo-top:calc(var(--chrome-top,4rem)_+_6.75rem)] @5xl:[--photo-align:0.5] @5xl:[--photo-top:calc(var(--chrome-top,4rem)_+_7.25rem)]"
    >
      {loaded && (
        <ReelPhotos
          media={listing.Media}
          address={listing.UnparsedAddress}
          active={active}
          priority={index <= 1}
          onIndexChange={(next) => {
            setPhoto(next);
            onSwipe?.();
          }}
          onDoubleTap={likeWhatsShown}
          peek={nudge === "photos"}
          squeezed={squeezed}
          overlay={nudge && <NudgeHint nudge={nudge} />}
          spots={(shown) =>
            photos.enabled &&
            (shown.Spots ?? []).map((spot) => (
              <PhotoSpot
                key={spot.tag}
                spot={spot}
                liked={photos.isLiked(shown, spot.tag)}
                count={photos.count(shown, spot.tag)}
                onToggle={() => photos.set(shown, spot.tag, !photos.isLiked(shown, spot.tag))}
              />
            ))
          }
        />
      )}
      {/* Shades keep the words readable over any photo, top and bottom. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-56 bg-linear-to-b from-black/55 via-black/20 to-transparent transition-opacity duration-300",
          squeezed && "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300",
          squeezed && "opacity-0",
        )}
      />

      {/* The words and buttons step aside while its comments are open. Only
          their links and buttons take a touch: a swipe that starts on the
          words, where a thumb usually is, turns the photos. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300 [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          squeezed && "opacity-0",
        )}
      >
        {/* Top left: what it costs, what it is, and where. */}
        <div className="absolute left-4 right-24 top-[calc(env(safe-area-inset-top)_+_var(--chrome-top,4rem)_+_0.25rem)] [text-shadow:0_1px_3px_rgb(0_0_0/0.45)] sm:left-6 @5xl:left-[max(1.5rem,calc((100%_-_72rem)_/_2_+_1.5rem))]">
          <p className="font-display text-3xl font-semibold leading-none tabular-nums @5xl:text-4xl">
            {formatPrice(listing.ListPrice)}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <Bed aria-hidden size={16} className="opacity-80" />
              {listing.BedroomsTotal} {listing.BedroomsTotal === 1 ? "bed" : "beds"}
            </span>
            <span className="flex items-center gap-1.5">
              <Bath aria-hidden size={16} className="opacity-80" />
              {listing.BathroomsTotalInteger} {listing.BathroomsTotalInteger === 1 ? "bath" : "baths"}
            </span>
            <span className="flex items-center gap-1.5">
              <Ruler aria-hidden size={16} className="opacity-80" />
              {listing.LivingArea.toLocaleString("en-US")} sq ft
            </span>
          </p>
          <h2 className="text-sm font-semibold leading-snug">
            <Link
              href={`/search?home=${encodeURIComponent(listing.ListingKey)}`}
              className="inline-flex min-h-8 items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <MapPin aria-hidden size={15} className="shrink-0" />
              {listing.UnparsedAddress}, {listing.City}
              <span className="sr-only"> (see it on the map)</span>
            </Link>
          </h2>
        </div>

        <div className="relative mx-auto h-full max-w-5xl">
          <Rail
            address={listing.UnparsedAddress}
            things={things}
            liked={liked}
            likes={likes}
            comments={comments}
            mode={mode}
            onLike={onLike}
            onComments={onComments}
            onShare={onShare}
            onMore={onMore}
          />
        </div>

        {/* Bottom and off the edge: who's talking, the description, and the
            comment bar right under it. Centred when the feed is wide; narrower
            (a phone, or the pane beside the map), the words sit beside the
            buttons, like a reel. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)_+_0.75rem))] sm:px-6 @5xl:items-center">
          <div className="w-full pr-20 [text-shadow:0_1px_3px_rgb(0_0_0/0.45)] sm:pr-24 @5xl:max-w-xl @5xl:pr-0 @5xl:text-center">
            <ActivityLine headline={post.headline} trending={post.buzz.trending} onOpen={onComments} />
            <Description listing={post.listing} reasons={post.reasons} />
            {error && (
              <p role="alert" className="mt-1 text-sm font-semibold text-rose-200">
                {error}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCompose}
            className="mt-3 flex h-11 w-full items-center gap-3 rounded-full @5xl:max-w-xl border border-white/15 bg-white/10 pl-5 pr-3 text-left text-[15px] text-white/75 backdrop-blur-md transition-colors hover:bg-white/15"
          >
            <span className="min-w-0 flex-1 truncate">Add a comment…</span>
            <Send aria-hidden size={18} className="shrink-0 opacity-70" />
          </button>
        </div>
      </div>
    </article>
  );
}

function RailButton({
  label,
  count,
  pressed,
  onClick,
  children,
  name,
}: {
  label: string;
  count?: string | number;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  name: string;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={pressed}
      onClick={onClick}
      className="group flex w-14 flex-col items-center gap-0.5 text-xs font-semibold [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm transition-transform group-active:scale-90 motion-reduce:transition-none motion-reduce:group-active:scale-100">
        {children}
      </span>
      <span aria-hidden className="tabular-nums">
        {count ?? label}
      </span>
    </button>
  );
}

type Thing = { tag: string; liked: boolean; count: number; toggle: () => void };

function Rail({
  address,
  things,
  liked,
  likes,
  comments,
  mode,
  onLike,
  onComments,
  onShare,
  onMore,
}: {
  address: string;
  things: Thing[];
  liked: boolean;
  likes: number;
  comments: number;
  mode: "public" | "share";
  onLike: () => void;
  onComments: () => void;
  onShare?: () => void;
  onMore: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-[max(5rem,calc(env(safe-area-inset-bottom)_+_4.25rem))] right-2 z-10 flex flex-col items-center gap-4 sm:right-4">
      <LikeWithList things={things}>
        <RailButton
          name={`Like ${address}${likes ? `, ${likes} ${likes === 1 ? "like" : "likes"}` : ""}`}
          label="Like"
          count={likes || "Like"}
          pressed={liked}
          onClick={onLike}
        >
          <Heart
            aria-hidden
            size={30}
            strokeWidth={2}
            className={cn(liked ? "fill-rose-500 text-rose-500" : "text-white", "drop-shadow")}
          />
        </RailButton>
      </LikeWithList>
      <RailButton
        name={`Comments${comments ? `, ${comments}` : ""}`}
        label="Comments"
        count={comments || "Comment"}
        onClick={onComments}
      >
        <MessageCircle aria-hidden size={28} className="drop-shadow" />
      </RailButton>
      {onShare && (
        <RailButton
          name={mode === "share" ? "Invite someone" : "Share"}
          label={mode === "share" ? "Invite" : "Share"}
          onClick={onShare}
        >
          {mode === "share" ? <Send aria-hidden size={26} /> : <Share2 aria-hidden size={26} className="drop-shadow" />}
        </RailButton>
      )}
      <RailButton name="More options" label="More" onClick={onMore}>
        <MoreHorizontal aria-hidden size={28} />
      </RailButton>
    </div>
  );
}

function headlineText(headline: Headline) {
  if (headline.kind === "sent") {
    return headline.who === "you" ? "You sent this to a client" : "An agent sent this to a buyer";
  }
  const who =
    headline.who === "anonymous" ? "A buyer" : headline.who === "client" ? `${headline.name}, your client,` : headline.name;
  if (headline.kind === "comment") return headline.who === "anonymous" ? "A buyer commented privately" : `${who} commented`;
  if (headline.kind === "photo") return `${who} liked ${tagPhrase(headline.tag)}`;
  return `${who} ${describeReaction(headline.state)}`;
}

// The latest thing someone did, like a caption's first line. Opens the conversation.
function ActivityLine({
  headline,
  trending,
  onOpen,
}: {
  headline: Headline | null;
  trending: boolean;
  onOpen: () => void;
}) {
  if (!headline && !trending) return null;
  const named = headline && "name" in headline;
  return (
    <div className="flex flex-wrap items-center gap-x-2 @5xl:justify-center">
      {headline && (
        <button type="button" onClick={onOpen} className="flex min-h-9 items-center gap-2 text-left text-sm">
          <span
            aria-hidden
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold [text-shadow:none]",
              named ? "bg-brand text-white" : "bg-white/25 text-white",
            )}
          >
            {named ? headline.name[0]?.toUpperCase() : headline.kind === "sent" ? <Send size={13} /> : <User size={14} />}
          </span>
          <span>
            <span className="font-semibold">{headlineText(headline)}</span>
            <span className="text-white/75" suppressHydrationWarning>
              {" "}
              · {timeAgo(headline.at)}
            </span>
          </span>
        </button>
      )}
      {trending && (
        <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide [text-shadow:none]">
          Trending
        </span>
      )}
    </div>
  );
}

// The listing's description, two lines until you ask for more, then who listed it.
function Description({ listing, reasons }: { listing: FeedPost["listing"]; reasons: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-sm leading-relaxed text-white/85">
      {reasons.length > 0 && (
        <p className="mb-1 flex flex-wrap items-center gap-1 font-semibold text-white @5xl:justify-center">
          <Sparkles aria-hidden size={13} />
          For you: {reasons.join(" · ")}
        </p>
      )}
      {listing.PublicRemarks && (
        <p className={cn("mt-0.5", !open && "line-clamp-2")}>
          {listing.PublicRemarks}
        </p>
      )}
      {listing.PublicRemarks && listing.PublicRemarks.length > 110 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="min-h-8 text-sm font-semibold text-white"
        >
          {open ? "less" : "more"}
        </button>
      )}
      <p className="mt-1.5 text-xs text-white/70">
        {listing.ListAgentFullName && `Listed by ${listing.ListAgentFullName}`}
        {listing.ListOfficeName && ` · ${listing.ListOfficeName}`}
        {isSampleListing(listing) && " · Sample listing"}
      </p>
    </div>
  );
}

const NO_ITEMS: FeedPost["timeline"] = [];

function CommentsSheet({
  post,
  mode,
  canShare,
  anchor,
  onClose,
}: {
  post: FeedPost | null;
  mode: "public" | "share";
  canShare: boolean;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const items = post?.timeline ?? NO_ITEMS;
  const comments = items.filter((item) => item.kind === "comment").length;

  // A new comment of yours scrolls into view at the bottom, where it lands.
  const seen = useRef(items.length);
  useEffect(() => {
    const last = items.at(-1);
    if (items.length > seen.current && last?.kind === "comment" && last.mine) {
      end.current?.scrollIntoView({ block: "end", behavior: reducedMotion() ? "auto" : "smooth" });
    }
    seen.current = items.length;
  }, [items]);

  const close = () => {
    setReplyTo(null);
    onClose();
  };

  return (
    <Sheet
      open={Boolean(post)}
      onClose={close}
      label="Comments"
      title={comments ? `${comments} ${comments === 1 ? "comment" : "comments"}` : "Comments"}
      anchor={anchor}
      tall
      footer={
        post && (
          <CommentComposer
            listingKey={post.listing.ListingKey}
            canShare={mode === "share" && canShare}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onPosted={() => setReplyTo(null)}
          />
        )
      }
    >
      {post && (
        <>
          {mode === "public" && (
            // Hidden when neither has anything to say yet.
            <div className="mb-5 border-b border-stone-100 pb-4 empty:hidden">
              <AspectSummary liked={post.aspects.liked} disliked={post.aspects.disliked} limit={4} />
              <Buzz post={post} />
            </div>
          )}
          <Timeline
            listingKey={post.listing.ListingKey}
            items={items}
            canShare={canShare}
            onReply={(target) => {
              setReplyTo(target);
              // In the same tap, so a phone shows its keyboard.
              end.current?.ownerDocument.querySelector<HTMLElement>("dialog[open] [data-composer]")?.focus();
            }}
          />
          {mode === "public" && (
            <p className="mt-8 text-center text-xs text-stone-500">
              Comments here are public. Buyers&apos; private chats with their agents stay private unless they choose to
              share.
            </p>
          )}
          <div ref={end} />
        </>
      )}
    </Sheet>
  );
}

// The quiet signals: views, agents sending it, private conversations.
function Buzz({ post }: { post: FeedPost }) {
  const parts = [
    post.buzz.views > 0 && `${post.buzz.views} ${post.buzz.views === 1 ? "view" : "views"}`,
    post.buzz.sends > 0 && `sent to ${post.buzz.sends} ${post.buzz.sends === 1 ? "buyer" : "buyers"} by agents`,
    post.privateComments > 0 &&
      `${post.privateComments} ${post.privateComments === 1 ? "comment" : "comments"} in private chats`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p aria-label="Activity" className="mt-2 text-sm text-stone-600">
      {parts.join(" · ")}
    </p>
  );
}

function MoreSheet({
  post,
  state,
  agentName,
  onPass,
  onToggle,
  onNext,
  onClose,
  anchor,
}: {
  post: FeedPost | null;
  state: ReactionState;
  agentName?: string;
  anchor: RefObject<HTMLElement | null>;
  onPass: () => void;
  onToggle: (aspect: Aspect) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const passed = state.reaction === "dislike";
  return (
    <Sheet open={Boolean(post)} onClose={onClose} label="More" title="More" anchor={anchor}>
      {post && (
        <div className="flex flex-col gap-5">
          <button
            type="button"
            aria-pressed={passed}
            onClick={onPass}
            className={cn(
              "flex min-h-12 items-center justify-center gap-2 rounded-xl border font-semibold",
              passed ? "border-amber-800 bg-amber-800 text-white" : "border-stone-300 bg-white hover:border-stone-500",
            )}
          >
            <ThumbsDown aria-hidden size={18} />
            Not for me
          </button>
          {state.reaction ? (
            <AspectChips state={state} onToggle={onToggle} />
          ) : (
            <p className="text-sm text-stone-600">
              Like it with the heart, or tell us it&apos;s not for you
              {agentName ? `, and ${agentName} will know` : ""}. Either way, your picks get better.
            </p>
          )}
          {passed && (
            <button
              type="button"
              onClick={onNext}
              className="flex min-h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
            >
              Next home
            </button>
          )}
          {!agentName && (
            <Link
              href={`/search?q=${encodeURIComponent(post.listing.City)}`}
              className="text-sm font-semibold text-brand underline-offset-2 hover:underline"
            >
              See homes near {post.listing.City} on the map
            </Link>
          )}
        </div>
      )}
    </Sheet>
  );
}

// Hovering the heart (or pressing and holding it on a phone) slides out
// everything in the photo on screen, each with its own heart.
function LikeWithList({ things, children }: { things: Thing[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  // A tap anywhere else closes a list opened by holding.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const release = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };

  return (
    <div
      ref={wrapper}
      data-open={open || undefined}
      className="group/like relative"
      onPointerDown={(event) => {
        held.current = false;
        if (event.pointerType === "mouse" || things.length === 0) return;
        hold.current = setTimeout(() => {
          held.current = true;
          setOpen(true);
        }, 450);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      // Holding the heart opens the list; letting go shouldn't also like the
      // home. Picks from the list always go through.
      onClickCapture={(event) => {
        if (!held.current) return;
        held.current = false;
        if (list.current?.contains(event.target as Node)) return;
        event.stopPropagation();
        event.preventDefault();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
      {things.length > 0 && (
        <div
          ref={list}
          role="group"
          aria-label="Like what's in this photo"
          className="invisible absolute right-full top-1/2 -translate-y-1/2 pr-2 opacity-0 transition-[opacity,visibility] duration-150 group-hover/like:visible group-hover/like:opacity-100 group-has-focus-visible/like:visible group-has-focus-visible/like:opacity-100 group-data-open/like:visible group-data-open/like:opacity-100"
        >
          <ul className="flex flex-col items-end gap-1.5">
            {things.map((thing, i) => (
              <li
                key={thing.tag}
                style={{ transitionDelay: `${i * 45}ms` }}
                className="translate-x-4 opacity-0 transition duration-200 ease-out group-hover/like:translate-x-0 group-hover/like:opacity-100 group-has-focus-visible/like:translate-x-0 group-has-focus-visible/like:opacity-100 group-data-open/like:translate-x-0 group-data-open/like:opacity-100 motion-reduce:translate-x-0"
              >
                <button
                  type="button"
                  aria-pressed={thing.liked}
                  aria-label={`Like ${tagPhrase(thing.tag)}${thing.count > 0 ? `, ${thing.count} ${thing.count === 1 ? "like" : "likes"}` : ""}`}
                  onClick={thing.toggle}
                  className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/50 px-3 text-[13px] font-semibold text-white backdrop-blur-md hover:bg-black/70 [text-shadow:none]"
                >
                  <Heart
                    aria-hidden
                    size={13}
                    strokeWidth={2.5}
                    className={cn(thing.liked ? "fill-rose-500 text-rose-500" : "text-white")}
                  />
                  {thing.tag}
                  {thing.count > 0 && <span className="tabular-nums opacity-75">{thing.count}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Something in the photo you can like: the floating staircase, the deck. At
// rest just a faint dot, so the photo stays clear. Pointing at it (or the
// first tap on a phone) unfolds what it is; clicking (or a second tap) likes it.
function PhotoSpot({
  spot,
  liked,
  count,
  onToggle,
}: {
  spot: { tag: string; x: number; y: number };
  liked: boolean;
  count: number;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pointer = useRef("mouse");
  // Near the right edge, the label unfolds to the left so it stays on the photo.
  const leftward = spot.x > 0.62;
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={`Like ${tagPhrase(spot.tag)}${count > 0 ? `, ${count} ${count === 1 ? "like" : "likes"}` : ""}`}
      data-open={open || undefined}
      onPointerDown={(event) => {
        pointer.current = event.pointerType;
      }}
      onClick={() => {
        if (pointer.current === "touch" && !open) {
          setOpen(true);
          return;
        }
        onToggle();
      }}
      onBlur={() => setOpen(false)}
      // Anchored on the side it unfolds away from, so the label has room to open.
      style={
        leftward
          ? { right: `${(1 - spot.x) * 100}%`, top: `${spot.y * 100}%`, transform: "translate(14px, -50%)" }
          : { left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, transform: "translate(-14px, -50%)" }
      }
      className={cn(
        "group/spot absolute z-10 flex h-7 items-center rounded-full transition-colors duration-200",
        "hover:bg-black/45 hover:backdrop-blur-md focus-visible:bg-black/45 data-open:bg-black/45 data-open:backdrop-blur-md",
        leftward && "flex-row-reverse",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center">
        {liked ? (
          <Heart aria-hidden size={13} strokeWidth={2.5} className="fill-rose-500 text-rose-500 drop-shadow" />
        ) : (
          <span className="size-2.5 rounded-full bg-white/55 shadow-[0_0_0_4px_rgb(255_255_255/0.18),0_1px_3px_rgb(0_0_0/0.35)] transition-colors group-hover/photo:bg-white/80 group-hover/spot:bg-white" />
        )}
      </span>
      <span className="grid grid-cols-[0fr] opacity-0 transition-all duration-200 ease-out group-hover/spot:grid-cols-[1fr] group-hover/spot:opacity-100 group-focus-visible/spot:grid-cols-[1fr] group-focus-visible/spot:opacity-100 group-data-open/spot:grid-cols-[1fr] group-data-open/spot:opacity-100 motion-reduce:transition-none">
        <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap px-1.5 text-[13px] font-semibold text-white">
          {spot.tag}
          {count > 0 && <span className="tabular-nums opacity-75">{count}</span>}
        </span>
      </span>
    </button>
  );
}
