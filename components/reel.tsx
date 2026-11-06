"use client";

import {
  ArrowUp,
  Heart,
  MapPin,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Sparkles,
  ThumbsDown,
  User,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { loadReel, recordView, reloadReelHome } from "@/app/homes/actions";
import { AspectSummary } from "@/components/aspect-summary";
import { AspectChips, useReactions } from "@/components/like-pass";
import {
  CommentComposer,
  NameGate,
  Timeline,
  type ReplyTarget,
  type SpotRef,
  type ThreadActions,
} from "@/components/listing-thread";
import { usePhotoLikes } from "@/components/photo-likes";
import {
  ReactCard,
  SpotLayer,
  spotName,
  spotThread,
  useFinePointer,
  type Photos,
  type PickedSpot,
} from "@/components/photo-spots";
import { ReelPhotos } from "@/components/reel-photos";
import { Sheet } from "@/components/sheet";
import { NudgeHint, useNudges, type Nudge } from "@/components/walkthrough";
import type { FeedPost, Headline } from "@/lib/feed";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { isSampleListing, type Listing, type ListingMedia } from "@/lib/listings/types";
import {
  FACTS,
  isFactTag,
  mediaKeyOf,
  photoTags,
  spotAt,
  tagPhrase,
  tagPosition,
  type FactTag,
} from "@/lib/photos";
import type { TimelineComment, TimelineItem } from "@/lib/timeline";
import { describeReaction, NO_REACTION, type Aspect, type ReactionState } from "@/lib/reactions";

// The feed: one home per screen, scrolled up like a reel, for as long as you
// keep going. Photos fill the screen; the price, the facts, who's talking and
// the description sit together at the bottom, read top to bottom, with the
// buttons down the right-hand side.

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
  loadMore,
  onOpen,
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
  // Where more homes come from, given those shown: the home page's feed, by
  // default, or a map search's.
  loadMore?: (shown: string[]) => Promise<FeedPost[]>;
  // Just a look at each home (beside the map): a tap anywhere opens it here,
  // and nothing on it can be liked, said or tapped.
  onOpen?: (listingKey: string) => void;
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
          comment: async (listingKey, body, sharePublicly, parentId, spot) => {
            const result = await actions.comment(listingKey, body, sharePublicly, parentId, spot);
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
        onOpen={onOpen}
        agentName={agentName}
        canInvite={canInvite}
        focus={focus}
        onActiveChange={onActiveChange}
        hasMore={hasMore}
        loading={loading}
        onNearEnd={async () => {
          if (!hasMore || loading) return;
          setLoading(true);
          const next = await (loadMore ?? loadReel)(posts.map((post) => post.listing.ListingKey)).catch(() => []);
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
  onOpen,
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
  onOpen?: (listingKey: string) => void;
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
  // A sheet over the home: its comments (all of them, or those about one spot
  // in a photo), or More.
  const [sheet, setSheet] = useState<{ kind: "comments" | "more"; key: string; spot?: SpotRef } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Pressing and holding a home's photo clears everything off it, to see it
  // whole, until you let go.
  const [clear, setClear] = useState<number | null>(null);
  if (clear !== null && clear !== active) setClear(null);
  // A spot to go to, from a comment about it. `n` counts requests.
  const [goToSpot, setGoToSpot] = useState<{ key: string; spot: SpotRef; n: number } | null>(null);
  // Homes whose photos show what people said and liked where they said it.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const pin = (key: string, on: boolean) =>
    setPinned((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
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
  const openComments = (key: string, compose = false, spot?: SpotRef) => {
    flushSync(() => setSheet({ kind: "comments", key, spot }));
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
      {mode === "public" && !embedded && !intro && <h1 className="sr-only">Homes for you</h1>}
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
              onCommentSpot={(spot) => openComments(key, true, spot)}
              covered={sheet?.kind === "comments" && sheet.key === key}
              clear={clear === offset + i}
              onHoldPhoto={(holding) => setClear(holding ? offset + i : null)}
              pinsShown={pinned.has(key) || (sheet?.kind === "comments" && sheet.key === key)}
              onPins={(on) => pin(key, on)}
              goToSpot={goToSpot?.key === key ? goToSpot : null}
              onOpen={onOpen && (() => onOpen(key))}
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
              {/* Each `relative`, to stay over a backdrop photo the end screen may have. */}
              {mode === "share" && posts.length > 0 && (
                <p className="relative mb-3 text-sm text-white/80">
                  You&apos;ve reacted to {reviewed} of {posts.length} {posts.length === 1 ? "home" : "homes"}.
                </p>
              )}
              {end}
              {!embedded && (
                <button
                  type="button"
                  onClick={() => goTo(0)}
                  className="relative mt-6 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  <ArrowUp aria-hidden size={16} /> Back to the top
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {header && (
        // Out of the way while a photo is cleared to be seen whole.
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-20 transition-[opacity,visibility] duration-300",
            clear === active && "invisible opacity-0",
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
        spot={sheet?.kind === "comments" ? sheet.spot : undefined}
        mode={mode}
        canShare={sheetPost ? reactions.states[sheetPost.listing.ListingKey]?.reaction === "like" : false}
        anchor={frame}
        onClose={() => setSheet(null)}
        // Posted about a spot: back to the photo, where it now shows.
        onPostedSpot={(key) => {
          setSheet(null);
          pin(key, true);
        }}
        // From a comment about a spot: to that photo, with the spot open.
        onShowSpot={(key, spot) => {
          setSheet(null);
          pin(key, true);
          setGoToSpot((current) => ({ key, spot, n: (current?.n ?? 0) + 1 }));
        }}
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
  onCommentSpot,
  covered,
  clear,
  onHoldPhoto,
  pinsShown,
  onPins,
  goToSpot,
  onOpen,
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
  // Comment on a spot in a photo, in the sheet below (touchscreens).
  onCommentSpot: (spot: SpotRef) => void;
  // Its comments are open, over the photo: the words and buttons under them step aside.
  covered: boolean;
  // Nothing over the photo, to see it whole.
  clear: boolean;
  onHoldPhoto: (holding: boolean) => void;
  // What people said and liked shows on the photos, where they said it.
  pinsShown: boolean;
  onPins: (on: boolean) => void;
  // Go to this spot, from a comment about it.
  goToSpot: { spot: SpotRef; n: number } | null;
  // Just a look (beside the map): a tap anywhere opens the home full screen.
  onOpen?: () => void;
  onMore: () => void;
  onShare?: () => void;
}) {
  const { listing } = post;
  const [photo, setPhoto] = useState(0);
  // The photo that has finished sliding into place: what's drawn over it
  // shows then, not while it's moving.
  const [settled, setSettled] = useState(0);
  // The spot whose card is open: on the photo on screen, or one of the facts.
  const [picked, setPicked] = useState<PickedSpot | null>(null);
  const current = listing.Media[photo];
  if (picked && (!active || (picked.mediaKey !== FACTS && picked.mediaKey !== (current && mediaKeyOf(current))))) {
    setPicked(null);
  }
  // When the comments close (posted, or put away), so does the card: what was
  // said now shows on the photo.
  const [wasCovered, setWasCovered] = useState(covered);
  if (covered !== wasCovered) {
    setWasCovered(covered);
    if (!covered) setPicked(null);
  }
  // To a spot from a comment about it: its photo, with its card open (or the
  // fact's card, for one about the price).
  const [show, setShow] = useState<{ index: number; n: number } | null>(null);
  const [went, setWent] = useState(0);
  if (goToSpot && goToSpot.n !== went && goToSpot.spot.mediaKey === FACTS) {
    setWent(goToSpot.n);
    setPicked({ ...goToSpot.spot, x: 0, y: 0 });
  } else if (goToSpot && goToSpot.n !== went) {
    setWent(goToSpot.n);
    const index = listing.Media.findIndex((m) => mediaKeyOf(m) === goToSpot.spot.mediaKey);
    const target = listing.Media[index];
    const at = target && tagPosition(target, goToSpot.spot.tag);
    if (index >= 0 && at) {
      setShow({ index, n: goToSpot.n });
      setPhoto(index);
      setSettled(index);
      setPicked({ ...goToSpot.spot, ...at });
    }
  }
  // The whole description, rather than two lines.
  const [more, setMore] = useState(false);
  // How tall the words at the bottom are, so a photo that fits sits right on
  // top of them, however many lines they take. Measured with the description
  // closed: opening it shouldn't move the photo.
  const words = useRef<HTMLDivElement>(null);
  const [wordsHeight, setWordsHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = words.current;
    if (!el || more) return;
    const measure = () => setWordsHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [more]);
  // Photos load as a home comes close, and stay once loaded.
  const [loaded, setLoaded] = useState(near);
  if (near && !loaded) setLoaded(true);
  const photos = usePhotoLikes(listing.ListingKey, post.photoLikes);
  const liked = state.reaction === "like";
  // Everyone who liked the home or anything in its photos, once each; yours
  // counts the moment you tap.
  const likes =
    post.likes - (base.reaction === "like" || photos.hadAny ? 1 : 0) + (liked || photos.hasAny ? 1 : 0);
  // Everything in the photo on screen, for the list that slides out of the heart.
  const things =
    current && photos.enabled
      ? photoTags(current).map((tag) => ({
          tag,
          liked: photos.isLiked(current, tag),
          count: photos.count(current, tag),
          toggle: () => photos.set(current, tag, photos.isLiked(current, tag) ? null : "like"),
        }))
      : [];
  const comments = post.timeline.filter((item) => item.kind === "comment").length;

  const likeWhatsShown = (shown: ListingMedia) => {
    onDoubleTapLike();
    const subject = photoTags(shown)[0];
    if (subject && photos.enabled && !photos.isLiked(shown, subject)) photos.set(shown, subject, "like");
  };

  // A tap on the photo: what's there, with a card to like it or say something.
  // Tapping around the photo, or the same spot again, puts the card away.
  const tapPhoto = (
    shown: ListingMedia,
    point: { x: number; y: number } | null,
    size: { width: number; height: number } | null,
  ) => {
    if (!point || !shown.ImageWidth) return setPicked(null);
    const used = [
      ...photos.likedTags(shown),
      ...post.timeline.flatMap((item) =>
        item.kind === "comment" && item.spot?.mediaKey === mediaKeyOf(shown) ? [item.spot.tag] : [],
      ),
    ];
    // Right on a heart already there (about a fingertip) is that heart.
    const spot = spotAt(shown, point.x, point.y, used, size ? 20 / size.width : undefined);
    setPicked((now) => (now?.tag === spot.tag && now.mediaKey === spot.mediaKey ? null : spot));
  };

  return (
    <article
      data-panel={index}
      data-home={listing.ListingKey}
      aria-label={listing.UnparsedAddress}
      // The clear space between the header and the words at the bottom. A
      // photo that fits sits there: when narrow, right on top of the words, so
      // the photo and what it is read as one, top to bottom; when wide,
      // centred. A wide screen has room for more, so there the photo grows on
      // under the words.
      className="relative h-full snap-start snap-always overflow-hidden bg-stone-950 [--photo-align:1] [--photo-bottom:21rem] [--photo-top:calc(var(--chrome-top,4rem)_+_0.5rem)] @5xl:[--photo-align:0.5]"
      style={wordsHeight ? ({ "--photo-bottom": `${wordsHeight + 8}px` } as CSSProperties) : undefined}
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
          onSettle={setSettled}
          onDoubleTap={onOpen ? undefined : likeWhatsShown}
          onTap={onOpen ? () => onOpen() : photos.enabled ? tapPhoto : undefined}
          onHold={onOpen ? undefined : onHoldPhoto}
          controls={!onOpen}
          show={show}
          peek={nudge === "photos"}
          overlay={nudge && <NudgeHint nudge={nudge} />}
        />
      )}
      {/* Shades keep the header and the words readable over any photo; the
          bottom one deepens to hold the whole description. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-black/50 to-transparent transition-opacity duration-300",
          clear && "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t to-transparent transition-[opacity,height] duration-300",
          more ? "h-3/4 from-black/85 via-black/55" : "h-1/2 from-black/80 via-black/40",
          (covered || clear) && "opacity-0",
        )}
      />

      {/* The words and buttons. Only their links and buttons take a touch: a
          swipe that starts on the words, where a thumb usually is, turns the
          photos, and a tap there clears them off the photo. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          clear && "invisible opacity-0",
        )}
      >
        {/* The buttons and the words at the bottom are under the comments
            while they're open, so they step aside. */}
        <div
          className={cn(
            "relative mx-auto h-full max-w-5xl transition-[opacity,visibility] duration-300",
            covered && "invisible opacity-0",
          )}
        >
          {!onOpen && (
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
          )}
        </div>

        {/* All the words, in one block at the bottom, read top to bottom like
            a listing: who's talking, then the price, beds, baths and size, the
            address, the description, and the comment bar right under it. When
            the feed is wide, a column in the middle, over the photo, its words
            starting at its left edge; narrower (a phone, or the pane beside the
            map), the words sit beside the buttons, like a reel. */}
        <div
          ref={words}
          className={cn(
            "absolute inset-x-0 bottom-0 flex flex-col px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)_+_0.75rem))] transition-[opacity,visibility] duration-300 sm:px-6 @5xl:items-center",
            // Beside the map on a phone, its Map button floats at the bottom.
            onOpen && "max-lg:pb-24",
            covered && "invisible opacity-0",
          )}
        >
          <div
            data-keep-clear
            className={cn(
              "w-full [text-shadow:0_1px_3px_rgb(0_0_0/0.45)] @5xl:max-w-xl @5xl:pr-0",
              !onOpen && "pr-20 sm:pr-24",
            )}
          >
            <ActivityLine headline={post.headline} trending={post.buzz.trending} onOpen={onOpen ?? onComments} />
            <Facts
              listing={listing}
              items={post.timeline}
              // Beside the map, just a look.
              photos={onOpen || !photos.enabled ? null : photos}
              open={picked?.mediaKey === FACTS && isFactTag(picked.tag) ? picked.tag : null}
              onOpen={(tag) =>
                setPicked((now) => (now?.mediaKey === FACTS && now.tag === tag ? null : { mediaKey: FACTS, tag, x: 0, y: 0 }))
              }
              onClose={() => setPicked(null)}
              onComment={onCommentSpot}
              onPosted={() => setPicked(null)}
            />
            <Description
              listing={post.listing}
              reasons={post.reasons}
              open={more}
              onToggle={onOpen ? undefined : () => setMore(!more)}
            />
            {error && (
              <p role="alert" className="mt-1 text-sm font-semibold text-rose-200">
                {error}
              </p>
            )}
          </div>
          {onOpen ? (
            <button
              type="button"
              data-keep-clear
              onClick={onOpen}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-ink shadow-lg transition-colors hover:bg-white/90 @5xl:max-w-xl"
            >
              <Maximize2 aria-hidden size={17} />
              Open full screen
              <span className="sr-only">: {listing.UnparsedAddress}</span>
            </button>
          ) : (
            <button
              type="button"
              data-keep-clear
              onClick={onCompose}
              className="mt-3 flex h-11 w-full items-center gap-3 rounded-full @5xl:max-w-xl border border-white/15 bg-white/10 pl-5 pr-3 text-left text-[15px] text-white/75 backdrop-blur-md transition-colors hover:bg-white/15"
            >
              <span className="min-w-0 flex-1 truncate">Add a comment…</span>
              <Send aria-hidden size={18} className="shrink-0 opacity-70" />
            </button>
          )}
        </div>
      </div>

      {/* Over everything else: where you tapped, and what people said and
          liked where they said it. Not while the photo's moving, or held. */}
      {loaded && photos.enabled && !onOpen && (
        <SpotLayer
          listingKey={listing.ListingKey}
          photo={active && !clear && settled === photo ? current : undefined}
          items={post.timeline}
          photos={photos}
          picked={picked}
          onPick={setPicked}
          pinsShown={pinsShown}
          onTogglePins={() => onPins(!pinsShown)}
          onComment={onCommentSpot}
          covered={covered}
          onPosted={() => {
            setPicked(null);
            onPins(true);
          }}
        />
      )}
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
    <div
      data-keep-clear
      className="pointer-events-auto absolute bottom-[max(5rem,calc(env(safe-area-inset-bottom)_+_4.25rem))] right-2 z-10 flex flex-col items-center gap-4 sm:right-4">
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
    <div className="flex flex-wrap items-center gap-x-2">
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

// What the home costs, what it is, and where: one line each, the way listings
// read. Each fact can be liked, disliked or commented on, just like anything in
// the photos: tap the price, and a card opens above it.
function Facts({
  listing,
  items,
  photos,
  open,
  onOpen,
  onClose,
  onComment,
  onPosted,
}: {
  listing: Listing;
  items: TimelineItem[];
  // Null where they're just to read (beside the map).
  photos: Photos | null;
  open: FactTag | null;
  onOpen: (tag: FactTag) => void;
  onClose: () => void;
  // Comment on one in the sheet below (touchscreens).
  onComment: (spot: SpotRef) => void;
  onPosted: () => void;
}) {
  const fine = useFinePointer();
  // What tapping one does, said once for all of them.
  const hint = useId();
  const said = (tag: FactTag) =>
    items.filter(
      (item): item is TimelineComment =>
        item.kind === "comment" && !item.parentId && item.spot?.mediaKey === FACTS && item.spot.tag === tag,
    );
  // `name`: what it says, in words.
  const fact = (tag: FactTag, name: string, children: ReactNode = name, className?: string) =>
    photos ? (
      <FactButton
        tag={tag}
        name={name}
        hint={hint}
        photos={photos}
        comments={said(tag).length}
        open={open === tag}
        onOpen={() => onOpen(tag)}
        className={className}
      >
        {children}
      </FactButton>
    ) : (
      <span className={cn("inline-flex min-h-8 items-center gap-1.5", className)}>{children}</span>
    );
  const beds = listing.BedroomsTotal;
  const baths = listing.BathroomsTotalInteger;
  return (
    <div className="relative mt-1">
      {photos && (
        <span id={hint} hidden>
          Like, dislike or comment on it
        </span>
      )}
      {open && photos && (
        <ReactCard
          listingKey={listing.ListingKey}
          where={FACTS}
          spot={{ mediaKey: FACTS, tag: open }}
          label={open}
          phrase={tagPhrase(open)}
          comments={said(open)}
          photos={photos}
          inline={fine}
          onClose={onClose}
          onComment={() => onComment({ mediaKey: FACTS, tag: open })}
          onPosted={onPosted}
          extra={
            open === "Address" && (
              <Link
                href={`/search?home=${encodeURIComponent(listing.ListingKey)}`}
                className="mt-2 flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-brand hover:underline"
              >
                <MapPin aria-hidden size={15} />
                See it on the map
              </Link>
            )
          }
          // Above the facts, over the photo, clear of everything else.
          className="bottom-full left-0 z-30 mb-2"
        />
      )}
      <p className="font-display text-3xl font-semibold leading-none tabular-nums @5xl:text-4xl">
        {fact("Price", formatPrice(listing.ListPrice))}
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-medium">
        {fact("Bedrooms", `${beds} ${beds === 1 ? "bed" : "beds"}`)}
        <span aria-hidden className="text-white/60">
          ·
        </span>
        {fact("Bathrooms", `${baths} ${baths === 1 ? "bath" : "baths"}`)}
        <span aria-hidden className="text-white/60">
          ·
        </span>
        {fact("Square footage", `${listing.LivingArea.toLocaleString("en-US")} sq ft`)}
      </p>
      <h2 className="text-sm font-semibold leading-snug">
        {fact(
          "Address",
          `${listing.UnparsedAddress}, ${listing.City}`,
          <>
            <MapPin aria-hidden size={15} className="shrink-0" />
            {listing.UnparsedAddress}, {listing.City}
          </>,
        )}
      </h2>
    </div>
  );
}

// One fact, to tap; with a quiet count of what people thought of it, if anything.
function FactButton({
  tag,
  name,
  hint,
  photos,
  comments,
  open,
  onOpen,
  className,
  children,
}: {
  tag: FactTag;
  name: string;
  // The id of what tapping it does.
  hint: string;
  photos: Photos;
  comments: number;
  open: boolean;
  onOpen: () => void;
  className?: string;
  children: ReactNode;
}) {
  const likes = photos.count(FACTS, tag);
  const dislikes = photos.dislikes(FACTS, tag);
  const mine = photos.reactionOf(FACTS, tag);
  const counts = [
    likes > 0 && `${likes} ${likes === 1 ? "like" : "likes"}`,
    dislikes > 0 && `${dislikes} ${dislikes === 1 ? "dislike" : "dislikes"}`,
    comments > 0 && `${comments} ${comments === 1 ? "comment" : "comments"}`,
  ].filter(Boolean);
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${name}${counts.length > 0 ? `, ${counts.join(", ")}` : ""}`}
      aria-describedby={hint}
      onClick={onOpen}
      className={cn(
        "-mx-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-white/10 active:bg-white/15",
        open && "bg-white/15",
        className,
      )}
    >
      {children}
      {counts.length > 0 && (
        <span
          aria-hidden
          className="inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold leading-none tabular-nums text-white/75"
        >
          {likes > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Heart size={10} strokeWidth={0} className={mine === "like" ? "fill-rose-400" : "fill-white/80"} />
              {likes}
            </span>
          )}
          {dislikes > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <ThumbsDown size={10} className={mine === "dislike" ? "text-amber-300" : undefined} />
              {dislikes}
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle size={10} />
              {comments}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

// The listing's description, two lines until you ask for more, then who listed
// it. All of it can run long over the photo, so past a point it scrolls.
function Description({
  listing,
  reasons,
  open,
  onToggle,
}: {
  listing: FeedPost["listing"];
  reasons: string[];
  open: boolean;
  // Unset beside the map, where it's just a look.
  onToggle?: () => void;
}) {
  return (
    <div className="mt-1 text-sm leading-relaxed text-white/85">
      {reasons.length > 0 && (
        <p className="mb-1 flex flex-wrap items-center gap-1 font-semibold text-white">
          <Sparkles aria-hidden size={13} />
          For you: {reasons.join(" · ")}
        </p>
      )}
      {listing.PublicRemarks && (
        <p
          className={cn(
            "mt-0.5",
            open ? "pointer-events-auto max-h-[45dvh] overflow-y-auto overscroll-contain" : "line-clamp-2",
          )}
        >
          {listing.PublicRemarks}
        </p>
      )}
      {onToggle && listing.PublicRemarks && listing.PublicRemarks.length > 110 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
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
  spot,
  mode,
  canShare,
  anchor,
  onClose,
  onPostedSpot,
  onShowSpot,
}: {
  post: FeedPost | null;
  // Only the comments about this spot in a photo, and a box to add one.
  spot?: SpotRef;
  mode: "public" | "share";
  canShare: boolean;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  onPostedSpot: (listingKey: string) => void;
  onShowSpot: (listingKey: string, spot: SpotRef) => void;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const all = post?.timeline ?? NO_ITEMS;
  const items = post && spot ? spotThread(all, spot) : all;
  const comments = items.filter((item) => item.kind === "comment").length;
  const name = post && spot ? spotName(post.listing, spot) : null;

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
      title={
        name
          ? `On ${name}`
          : comments
            ? `${comments} ${comments === 1 ? "comment" : "comments"}`
            : "Comments"
      }
      anchor={anchor}
      // About one spot: just tall enough, so the photo stays in view above it.
      tall={!spot}
      footer={
        post && (
          <CommentComposer
            key={spot ? `${spot.mediaKey}:${spot.tag}` : "all"}
            listingKey={post.listing.ListingKey}
            canShare={mode === "share" && canShare}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            spot={spot}
            placeholder={name ? `Comment on ${name}…` : undefined}
            onPosted={() => {
              setReplyTo(null);
              if (spot) onPostedSpot(post.listing.ListingKey);
            }}
          />
        )
      }
    >
      {post && (
        <>
          {mode === "public" && !spot && (
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
            spots={
              spot
                ? undefined
                : {
                    name: (s) => spotName(post.listing, s),
                    show: (s) => onShowSpot(post.listing.ListingKey, s),
                  }
            }
            empty={
              name ? (
                <p className="px-2 py-3 text-center text-sm text-stone-600">Be the first to say something about {name}.</p>
              ) : undefined
            }
          />
          {mode === "public" && !spot && (
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
