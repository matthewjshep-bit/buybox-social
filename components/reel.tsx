"use client";

import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Ellipsis,
  Eye,
  Flame,
  Heart,
  ImageIcon,
  MapPin,
  Maximize2,
  MessageCircle,
  Send,
  Share2,
  ThumbsDown,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { loadReel, recordView, reloadReelHome } from "@/app/homes/actions";
import { ActivityTicker, useTicker } from "@/components/activity-ticker";
import { AspectChips, useReactions } from "@/components/like-pass";
import {
  CommentComposer,
  NameGate,
  Timeline,
  type ReplyTarget,
  type SeenBy,
  type SpotRef,
  type ThreadActions,
} from "@/components/listing-thread";
import { usePhotoLikes } from "@/components/photo-likes";
import {
  ReactCard,
  SpotLayer,
  spotThread,
  useFinePointer,
  type Photos,
  type PickedSpot,
  type SpotLight,
} from "@/components/photo-spots";
import { photoFoot, photoPlace, ReelPhotos } from "@/components/reel-photos";
import { ScorecardBody, WhatPeopleThink } from "@/components/scorecard";
import { Sheet } from "@/components/sheet";
import { NudgeHint, useNudges, type Nudge } from "@/components/walkthrough";
import type { FeedPost } from "@/lib/feed";
import { cn, formatPrice } from "@/lib/format";
import { isSampleListing, type Listing, type ListingMedia } from "@/lib/listings/types";
import {
  FACTS,
  isFactTag,
  likeId,
  mediaKeyOf,
  photoTags,
  spotAt,
  spotName,
  tagPhrase,
  tagPosition,
  type FactTag,
  type SpotReaction,
} from "@/lib/photos";
import { eventsFromHeadline, eventsFromTimeline, onFact, onPhoto, type TickerEvent, type TickerTap } from "@/lib/ticker";
import type { TimelineComment, TimelineItem } from "@/lib/timeline";
import { NO_REACTION, publicSideOf, type Aspect, type ReactionState } from "@/lib/reactions";
import type { ScorecardViewer } from "@/lib/scorecard";

// The feed: one home per screen, scrolled up like a reel, for as long as you
// keep going. On a phone the whole photo sits right on top of a block of words
// on the dark ground (who's talking, the price, the facts, the description,
// the comment bar), always the same height, so the photo never jumps from home
// to home and nothing is written over it; the buttons run down the right.
// Wide, side by side: the photo on a stage of its own, the buttons in a column
// beside it, and the same words in a white panel on the right, where the
// comments open too, so the photo is never covered.

// The side-by-side layout on wide screens. Off (false): the words over the
// photo, in a column in the middle, and comments rising from the bottom, as
// before.
const SPLIT_WIDE = true;
// What a wide screen looked like before the side-by-side layout (only with
// SPLIT_WIDE off).
const legacy = (classes: string) => (SPLIT_WIDE ? "" : classes);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// How long after the last like or reaction a home's conversation reloads.
const RELOAD_AFTER_MS = 1500;

// A home, as the rail's Send hands it to the page.
export type SendHome = {
  listingKey: string;
  address: string;
  city: string;
  price: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

const sendHomeOf = ({ listing }: FeedPost): SendHome => ({
  listingKey: listing.ListingKey,
  address: listing.UnparsedAddress,
  city: listing.City,
  price: listing.ListPrice,
  beds: listing.BedroomsTotal ?? null,
  baths: listing.BathroomsTotalInteger ?? null,
  sqft: listing.LivingArea ?? null,
});

// What the rail's fourth button does: share the page, invite someone onto an
// agent's link, or (an agent, on a home for sale) send it to a client.
type ShareKind = "share" | "invite" | "send";

// What can rise over a home.
type SheetKind = "comments" | "more" | "scorecard";

// The agent, in a sentence: their name, or "your agent" when the page
// doesn't know it (it says "Your agent" then).
const agentCalled = (agentName?: string) => (agentName && agentName !== "Your agent" ? agentName : "your agent");
const agentFirstName = (agentName?: string) =>
  agentName && agentName !== "Your agent" ? (agentName.split(" ")[0] ?? agentName) : "your agent";

// "8", "1,204", "10.2K"
const countLabel = (n: number) =>
  n < 10_000 ? n.toLocaleString("en-US") : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

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
  onSend,
  initialPhoto,
  onPhotoSeen,
  suggestedName,
  nameHint,
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
  // Signed-in agents on public pages: the rail's share button sends this home.
  // Called first thing in the tap, with nothing awaited before it.
  onSend?: (home: SendHome) => void;
  // The photo (from 0) the first home opens on.
  initialPhoto?: number;
  // A photo has settled on screen.
  onPhotoSeen?: (listingKey: string, index: number) => void;
  // Fills in the name prompt (selected, to type over).
  suggestedName?: string;
  // One more line in the name prompt, just above the name.
  nameHint?: string;
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

  // On public pages, saving a comment, a like or a reaction reloads just that
  // home's conversation (and the line above its price). After a like or a
  // reaction it waits till the taps stop: the page saves one thing at a time,
  // and a reload queued between a like and the next tap would hold that tap
  // up (the line says what you did at once, meanwhile).
  const { likePhoto } = actions;
  const soon = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = soon.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);
  const reloadSoon = (listingKey: string) => {
    clearTimeout(soon.current.get(listingKey));
    soon.current.set(
      listingKey,
      setTimeout(() => {
        soon.current.delete(listingKey);
        reload(listingKey);
      }, RELOAD_AFTER_MS),
    );
  };
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
          react: async (listingKey, state) => {
            const result = await actions.react(listingKey, state);
            if (result.ok) reloadSoon(listingKey);
            return result;
          },
          ...(likePhoto && {
            likePhoto: async (listingKey: string, mediaKey: string, tag: string, reaction: SpotReaction) => {
              const result = await likePhoto(listingKey, mediaKey, tag, reaction);
              if (result.ok) reloadSoon(listingKey);
              return result;
            },
          }),
        };

  // Who sees a comment, said under every comment box. Everyone on an agent's
  // link reads what's said there, each on a link of their own or not, so
  // "only you" is said only when the page knows nobody else is on it.
  const agent = agentCalled(agentName);
  const alone = (initial[0]?.members?.length ?? 2) <= 1;
  const seenBy: SeenBy =
    mode === "public"
      ? { text: "Everyone can see your comment and first name.", private: false }
      : !canInvite && alone
        ? { text: `Only you and ${agent} see this.`, private: true }
        : { text: `Only ${agent} and people on this link see this.`, private: true };
  // Where the name prompt rises from: side by side, the white panel's foot.
  const nameAnchor = useRef<HTMLElement | null>(null);

  return (
    <NameGate
      actions={threadActions}
      myName={myName}
      prompt={prompt}
      suggestedName={suggestedName}
      nameHint={nameHint}
      seenBy={seenBy}
      anchor={nameAnchor}
    >
      <Feed
        nameAnchorRef={nameAnchor}
        posts={posts}
        mode={mode}
        myName={myName}
        header={header}
        intro={intro}
        end={end}
        embedded={embedded}
        onOpen={onOpen}
        onSend={onSend}
        initialPhoto={initialPhoto}
        onPhotoSeen={onPhotoSeen}
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
  myName,
  header,
  intro,
  end,
  embedded,
  onOpen,
  onSend,
  initialPhoto,
  onPhotoSeen,
  agentName,
  canInvite,
  focus,
  onActiveChange,
  hasMore,
  loading,
  onNearEnd,
  nameAnchorRef,
}: {
  posts: FeedPost[];
  mode: "public" | "share";
  myName: string | null;
  header?: ReactNode;
  intro?: ReactNode;
  end?: ReactNode;
  embedded: boolean;
  onOpen?: (listingKey: string) => void;
  onSend?: (home: SendHome) => void;
  initialPhoto?: number;
  onPhotoSeen?: (listingKey: string, index: number) => void;
  agentName?: string;
  canInvite: boolean;
  focus?: { key: string; n: number } | null;
  onActiveChange?: (listingKey: string | null) => void;
  hasMore: boolean;
  loading: boolean;
  onNearEnd: () => void;
  // Set to where the name prompt should rise from (none: the window's foot).
  nameAnchorRef?: RefObject<HTMLElement | null>;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // A sheet over the home: its comments (all of them, or those about one spot
  // in a photo), its Scorecard, or More. `photoFoot`: where the photo ended
  // when it opened, so the sheet rises to just there.
  const [sheet, setSheet] = useState<{
    kind: SheetKind;
    key: string;
    spot?: SpotRef;
    photoFoot?: number;
    // Opened on one comment (from the line above the price).
    commentId?: string;
    // The Scorecard, opened at a part of it (the description's "more").
    section?: "about";
  } | null>(null);
  // Each sheet closes only itself: one can open another without the first's
  // closing shutting the second. (The comments and the Scorecard are one
  // sheet, which changes in place from one to the other.)
  const closeSheet = (...kinds: SheetKind[]) => setSheet((now) => (now && kinds.includes(now.kind) ? null : now));
  // The comments or the Scorecard, about this home.
  const about = (key: string) => (sheet?.kind === "comments" || sheet?.kind === "scorecard") && sheet.key === key;
  // Side by side (wide): comments open beside the photo, in the white panel's
  // place, and other sheets rise from the panel's foot. `narrow`: a phone's
  // layout (comments rise to the photo's foot), whether or not wide screens
  // are side by side.
  const { wide, narrow } = useWidth(frame);
  const dock = useRef<HTMLElement | null>(null);
  // A home's white panel, side by side.
  const wordsOf = (key: string) =>
    frame.current?.querySelector<HTMLElement>(`[data-home="${CSS.escape(key)}"] [data-words]`) ?? null;
  const [toast, setToast] = useState<string | null>(null);
  // Pressing and holding a home's photo clears everything off it, to see it
  // whole, until you let go.
  const [clear, setClear] = useState<number | null>(null);
  if (clear !== null && clear !== active) setClear(null);
  // "Show the photo only", from More: nothing but the photo on this home,
  // until you move on to another.
  const [bare, setBare] = useState<number | null>(null);
  if (bare !== null && bare !== active) setBare(null);
  // A spot to go to, from a comment about it. `n` counts requests. From the
  // Scorecard by keyboard, the card takes it, and gives it `back` on closing.
  const [goToSpot, setGoToSpot] = useState<{
    key: string;
    spot: SpotRef;
    n: number;
    keyboard?: boolean;
    back?: HTMLElement | null;
  } | null>(null);
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
  // Comments (or the Scorecard) beside the photo belong to the home on
  // screen: moving on to another closes them.
  if (wide && (sheet?.kind === "comments" || sheet?.kind === "scorecard") && sheet.key !== (activePost?.listing.ListingKey ?? null)) {
    setSheet(null);
  }
  // What you've liked and not in each home's photos just now, as its photos
  // have it, for the Scorecard.
  const [yours, setYours] = useState<Record<string, { liked: string[]; disliked: string[] }>>({});
  const tellYours = useCallback((key: string, liked: string[], disliked: string[]) => {
    setYours((now) =>
      JSON.stringify(now[key]) === JSON.stringify({ liked, disliked }) ? now : { ...now, [key]: { liked, disliked } },
    );
  }, []);

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

  // ↑ and ↓ move between homes, unless you're typing, or in a sheet (beside
  // the photo, only while you're in it: from the photo they move on, which
  // puts it away). J and K too, but only while the feed itself has the
  // keyboard (a click on it anywhere but a button gives it the keyboard), so
  // a letter meant for anything else, or a word said to the computer, never
  // jumps homes.
  useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable], dialog") || document.querySelector("dialog[open]:modal")) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const letters =
        Boolean(scroller.current?.contains(target)) && !target.closest("button, a, summary, [role=button], [role=link]");
      if (key === "ArrowDown" || key === "PageDown" || (key === "j" && letters)) goTo(active + 1);
      else if (key === "ArrowUp" || key === "PageUp" || (key === "k" && letters)) goTo(active - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On to another home with the keyboard on a button every home has (the
  // chevrons, More), it moves to the same button on the home now on screen,
  // rather than staying behind, out of sight, on the one before.
  useEffect(() => {
    const now = document.activeElement as HTMLElement | null;
    const follow = now?.dataset.follow;
    const home = scroller.current?.querySelector<HTMLElement>(`[data-panel="${active}"]`);
    if (!now || !follow || !home || home.contains(now) || !scroller.current?.contains(now)) return;
    const same = home.querySelector<HTMLElement>(`[data-follow="${follow}"]:not(:disabled)`);
    (same ?? home.querySelector<HTMLElement>("[data-follow]:not(:disabled), button:not(:disabled)"))?.focus({
      preventScroll: true,
    });
  }, [active]);

  // The name prompt rises where the words are: side by side, from the foot
  // of the white panel of the home on screen.
  useLayoutEffect(() => {
    if (nameAnchorRef) nameAnchorRef.current = wide && activeKey ? wordsOf(activeKey) : null;
  });

  // Beside the photo, the comments take the white panel's place, so Tab
  // finds them there too: from the buttons down the side into them, and out
  // of them on to whatever follows the panel (the panel itself is out of
  // reach under them).
  const dockedKey = wide && (sheet?.kind === "comments" || sheet?.kind === "scorecard") ? sheet.key : null;
  useEffect(() => {
    if (!dockedKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const dialog = frame.current?.querySelector<HTMLDialogElement>(":scope > dialog[open]");
      const panel = wordsOf(dockedKey);
      if (!dialog || !panel || dialog.matches(":modal") || document.querySelector("dialog[open]:modal")) return;
      const next = nextStop(document.activeElement, dialog, panel, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      next.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dockedKey]);

  // Comments rise from the bottom, to the photo's foot, so it stays in view
  // (wide, they open beside it, in the white panel's place). From the comment
  // bar, the cursor goes straight into the comment box, in the same tap, so a
  // phone opens its keyboard (it won't for focus that arrives later). The
  // box is still sliding in then, partly past the edge, and the feed mustn't
  // shift sideways to show it.
  // From the line above the price, about one comment: the comments open on
  // it, tinted for a moment so it's plain which.
  const openComments = (key: string, compose = false, spot?: SpotRef, commentId?: string) => {
    const home = frame.current?.querySelector(`[data-home="${CSS.escape(key)}"]`);
    dock.current = wordsOf(key);
    flushSync(() =>
      setSheet({ kind: "comments", key, spot, commentId, photoFoot: home ? photoFootIn(home, frame.current!) : undefined }),
    );
    if (compose) {
      frame.current?.ownerDocument
        .querySelector<HTMLElement>("dialog[open] [data-composer]")
        ?.focus({ preventScroll: true });
    }
    const said =
      commentId && frame.current?.ownerDocument.querySelector<HTMLElement>(`dialog[open] [data-comment="${CSS.escape(commentId)}"]`);
    if (said) {
      said.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      said.dataset.flash = "";
      setTimeout(() => delete said.dataset.flash, 2000);
    }
  };

  // The Scorecard: up from the bottom like the comments (wide, beside the
  // photo, in the white panel's place), or turned to from them in place.
  const openScorecard = (key: string, section?: "about") => {
    const home = frame.current?.querySelector(`[data-home="${CSS.escape(key)}"]`);
    dock.current = wordsOf(key);
    flushSync(() =>
      setSheet({ kind: "scorecard", key, section, photoFoot: home ? photoFootIn(home, frame.current!) : undefined }),
    );
  };
  // From the comments to the Scorecard, or back: the same sheet, in place.
  const switchSheet = (key: string, kind: "comments" | "scorecard") =>
    setSheet((now) => (now && now.key === key ? { kind, key, photoFoot: now.photoFoot } : now));

  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const isForSale = (post: FeedPost) => post.listing.StandardStatus === "Active";
  const shareKind = (post: FeedPost): ShareKind | null =>
    mode === "share" ? (canInvite ? "invite" : null) : onSend && isForSale(post) ? "send" : "share";

  const share = async (post: FeedPost) => {
    if (onSend && mode === "public" && isForSale(post)) return onSend(sendHomeOf(post));
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
  // You, as you are now on the home the sheet is about, for its Scorecard:
  // the same object until something of yours changes, so the Scorecard isn't
  // worked out again each time anything else on the page does.
  const sheetKey = sheetPost?.listing.ListingKey;
  const sheetState = sheetKey ? reactions.states[sheetKey] : undefined;
  const sheetYours = sheetKey ? yours[sheetKey] : undefined;
  const sheetViewer = useMemo<ScorecardViewer | undefined>(
    () =>
      sheetPost
        ? {
            state: sheetState ?? sheetPost.mine,
            liked: sheetYours?.liked ?? sheetPost.photoLikes.mine,
            disliked: sheetYours?.disliked ?? sheetPost.photoLikes.mineDisliked,
          }
        : undefined,
    [sheetPost, sheetState, sheetYours],
  );
  // On a link known to be one person's: the Scorecard says "only you", as
  // the comment box does.
  const alone = mode === "share" && !canInvite && (posts[0]?.members?.length ?? 2) <= 1;
  // A home's own button on the rail (the Scorecard's, More's), for the
  // keyboard to go back to.
  const railButton = (key: string, which: "scorecard" | "more") =>
    frame.current?.querySelector<HTMLElement>(`[data-home="${CSS.escape(key)}"] [data-follow="${which}"]`) ?? null;
  const reviewed = posts.filter((post) => reactions.states[post.listing.ListingKey]?.reaction).length;

  return (
    <div
      ref={frame}
      data-dark-ground
      className={cn(
        // Its size, not the window's, decides the layout of each home. What
        // runs past its edges (the comments sliding in) is cut off, and it
        // never scrolls sideways to show it.
        "overflow-clip bg-night text-white @container-size/reel",
        // The photo starts just under the header, never beneath it. Side by
        // side, the stage and the panel start a little further down (in a
        // pop-out, below its close button in the corner).
        header
          ? "[--chrome-top:4rem] [--photo-top:calc(56px+env(safe-area-inset-top)+4px)] [--stage-top:72px]"
          : "[--chrome-top:0.75rem] [--photo-top:0.5rem] [--stage-top:64px]",
        embedded ? "relative h-full w-full" : "fixed inset-0 z-30",
      )}
    >
      {mode === "public" && !embedded && !intro && <h1 className="sr-only">Homes for you</h1>}
      <div
        ref={scroller}
        data-reel
        // A click on it (anywhere but a button) gives it the keyboard, for J
        // and K; it's never a stop for Tab.
        tabIndex={-1}
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
          const kind = shareKind(post);
          return (
            <Panel
              key={key}
              index={offset + i}
              post={post}
              mode={mode}
              myName={myName}
              agentName={agentName}
              start={i === 0 ? initialPhoto : undefined}
              onPhotoSeen={onPhotoSeen}
              counter={mode === "share" && posts.length > 1 ? `Home ${i + 1} of ${posts.length}` : undefined}
              active={active === offset + i}
              wide={wide}
              narrow={narrow}
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
              onCommentsAbout={(spot) => openComments(key, false, spot)}
              onCommentAt={(id) => openComments(key, false, undefined, id)}
              onScorecard={(section) => openScorecard(key, section)}
              onYours={tellYours}
              reactedAt={reactions.changedAt[key]}
              // Over the words on a phone; in the white panel's place, wide.
              covered={!wide && about(key)}
              docked={wide && about(key)}
              spotSheet={sheet?.kind === "comments" && sheet.key === key && Boolean(sheet.spot)}
              clear={clear === offset + i}
              onHoldPhoto={(holding) => setClear(holding ? offset + i : null)}
              bare={bare === offset + i}
              onShowEverything={() => setBare(null)}
              pinsShown={pinned.has(key) || (sheet?.kind === "comments" && sheet.key === key)}
              onPins={(on) => pin(key, on)}
              goToSpot={goToSpot?.key === key ? goToSpot : null}
              onOpen={onOpen && (() => onOpen(key))}
              onMore={() => {
                dock.current = wordsOf(key);
                setSheet({ kind: "more", key });
              }}
              shareAs={kind}
              onShare={kind ? () => share(post) : undefined}
              // (Not in a pop-out, which has just the one home.)
              onPrevious={!embedded && offset + i > 0 ? () => goTo(offset + i - 1) : undefined}
              onNext={embedded ? undefined : () => goTo(offset + i + 1)}
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

      {/* Layers over the homes: the header z-30, a card about a spot or a fact
          z-40 (so it can always be closed), a toast z-50. Sheets open in the
          browser's top layer, over all of them. */}
      {header && (
        // Out of the way while a photo is cleared to be seen whole.
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-30 transition-[opacity,visibility] duration-300",
            (clear === active || bare === active) && "invisible opacity-0",
          )}
        >
          {header}
        </div>
      )}
      {/* Which home of the link's few this is: on the photo, and said here. */}
      {mode === "share" && posts.length > 1 && active >= offset && active < offset + posts.length && (
        <p aria-live="polite" className="sr-only">
          Home {active - offset + 1} of {posts.length}
        </p>
      )}
      {toast && (
        <p
          role="status"
          className="absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-lg"
        >
          {toast}
        </p>
      )}

      <HomeSheet
        post={sheet?.kind === "comments" || sheet?.kind === "scorecard" ? (sheetPost ?? null) : null}
        kind={sheet?.kind === "scorecard" ? "scorecard" : "comments"}
        spot={sheet?.kind === "comments" ? sheet.spot : undefined}
        opened={sheet?.kind === "comments" ? sheet.commentId : undefined}
        section={sheet?.kind === "scorecard" ? sheet.section : undefined}
        mode={mode}
        agentName={agentName}
        viewer={sheetViewer}
        alone={alone}
        myName={myName}
        canShare={sheetPost ? reactions.states[sheetPost.listing.ListingKey]?.reaction === "like" : false}
        anchor={wide ? dock : frame}
        docked={wide}
        // (Up to the photo's foot only in a phone's layout.)
        photoFoot={narrow ? sheet?.photoFoot : undefined}
        onClose={() => closeSheet("comments", "scorecard")}
        onSwitch={(key, kind) => switchSheet(key, kind)}
        onCompose={(key) => openComments(key, true)}
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
        // From the Scorecard: to the spot on its photo, with its card open
        // (beside the photo, the Scorecard stays, and the keyboard comes back
        // to the row after). A fact's card opens in the words the sheet is
        // over (or beside the photo, in the white panel it stands in for),
        // so for a fact it goes first, at any width. Gone first, too, so the
        // card can take the keyboard (nothing behind a sheet can).
        onScorecardSpot={(key, spot, keyboard) => {
          const stays = wide && spot.mediaKey !== FACTS;
          const back = stays ? (document.activeElement as HTMLElement | null) : railButton(key, "scorecard");
          if (!stays) flushSync(() => setSheet(null));
          setGoToSpot((current) => ({ key, spot, n: (current?.n ?? 0) + 1, keyboard, back }));
        }}
        onLike={(key) => reactions.choose(key, "like")}
        // "Not for me", then More, to say why.
        onPass={async (key) => {
          if (!(await reactions.choose(key, "dislike"))) return;
          dock.current = wordsOf(key);
          setSheet((now) => (now?.key === key ? { kind: "more", key } : now));
        }}
        onOpenMore={(key) => {
          dock.current = wordsOf(key);
          setSheet({ kind: "more", key });
        }}
      />
      <MoreSheet
        post={sheet?.kind === "more" ? (sheetPost ?? null) : null}
        state={sheetPost ? (reactions.states[sheetPost.listing.ListingKey] ?? NO_REACTION) : NO_REACTION}
        agentName={agentName}
        // Side by side, up from the foot of the white panel, like the comments.
        anchor={wide ? dock : frame}
        // Turned to from the Scorecard ("Change your take"), the keyboard
        // goes back to the Scorecard's button on the rail.
        returnTo={() => (sheetPost ? railButton(sheetPost.listing.ListingKey, "scorecard") : null)}
        onPass={() => sheetPost && reactions.choose(sheetPost.listing.ListingKey, "dislike")}
        onToggle={(aspect) => sheetPost && reactions.toggle(sheetPost.listing.ListingKey, aspect)}
        onNext={() => {
          setSheet(null);
          goTo(active + 1);
        }}
        onPhotoOnly={() => {
          setSheet(null);
          if (sheetPost) setBare(offset + posts.indexOf(sheetPost));
        }}
        onClose={() => closeSheet("more")}
      />
    </div>
  );
}

// Whether the feed is wide enough (64rem) to lay each home out side by side,
// as its own layout decides by the same measure (`wide`), and whether it's
// narrower than that, a phone's layout, side by side or not (`narrow`).
function useWidth(frame: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ wide: false, narrow: true });
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const roomy = el.clientWidth >= 64 * rem;
      setSize((now) =>
        now.wide === (SPLIT_WIDE && roomy) && now.narrow === !roomy ? now : { wide: SPLIT_WIDE && roomy, narrow: !roomy },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame]);
  return size;
}

// Everything Tab can stop on, in the page's order.
function tabStops() {
  return [
    ...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]"),
  ].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest("[inert]") &&
      (el as HTMLInputElement).type !== "hidden" &&
      // (Older browsers: whether it takes up any room at all.)
      (typeof el.checkVisibility === "function"
        ? el.checkVisibility({ visibilityProperty: true })
        : el.getClientRects().length > 0),
  );
}

// Where Tab (or Shift+Tab) goes from `now` with `dialog` read as though it
// stood in `panel`'s place in the page. Undefined: wherever the browser
// would take it.
function nextStop(now: Element | null, dialog: HTMLElement, panel: HTMLElement, back: boolean) {
  const stops = tabStops();
  const inside = stops.filter((el) => dialog.contains(el));
  const outside = stops.filter((el) => !dialog.contains(el));
  const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const after = outside.findIndex((el) => follows(panel, el));
  const at = after === -1 ? outside.length : after;
  const order = [...outside.slice(0, at), ...inside, ...outside.slice(at)];
  const from = now ? order.indexOf(now as HTMLElement) : -1;
  if (from !== -1) return order[from + (back ? -1 : 1)];
  // On something in it that isn't a stop itself (its title): from there.
  if (!now || !dialog.contains(now)) return undefined;
  const first = inside.findIndex((el) => follows(now, el));
  return order[at + (first === -1 ? inside.length : first) - (back ? 1 : 0)];
}

// Where the photo on screen ends, from the top of the feed.
function photoFootIn(home: Element, feed: Element) {
  const box = feed.getBoundingClientRect();
  const shown = [...home.querySelectorAll("[data-photo-frame]")]
    .map((photo) => photo.getBoundingClientRect())
    .find((photo) => photo.width > 0 && photo.left >= box.left - 1 && photo.right <= box.right + 1);
  return shown ? shown.bottom - box.top : undefined;
}

function Panel({
  index,
  post,
  mode,
  myName,
  agentName,
  start,
  onPhotoSeen,
  counter,
  active,
  wide,
  narrow,
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
  onCommentsAbout,
  onCommentAt,
  onScorecard,
  onYours,
  reactedAt,
  covered,
  docked,
  spotSheet,
  clear,
  onHoldPhoto,
  bare,
  onShowEverything,
  pinsShown,
  onPins,
  goToSpot,
  onOpen,
  onMore,
  shareAs,
  onShare,
  onPrevious,
  onNext,
}: {
  index: number;
  post: FeedPost;
  mode: "public" | "share";
  myName: string | null;
  agentName?: string;
  // The photo to open on.
  start?: number;
  onPhotoSeen?: (listingKey: string, index: number) => void;
  // "Home 1 of 3", on an agent's link with several.
  counter?: string;
  active: boolean;
  // The feed is wide enough to lay a home out side by side.
  wide: boolean;
  // A phone's layout (narrower than 64rem), side by side or not.
  narrow: boolean;
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
  // The comments about one spot, from the line above the price.
  onCommentsAbout: (spot: SpotRef) => void;
  // The comments, on one of them.
  onCommentAt: (commentId: string) => void;
  // Its Scorecard (at "About this home", from the description's "more").
  onScorecard: (section?: "about") => void;
  // What you've liked and not in its photos and facts just now (likeIds).
  onYours?: (listingKey: string, liked: string[], disliked: string[]) => void;
  // When you last changed your reaction to it here.
  reactedAt?: string;
  // Its comments (or Scorecard) are open, over the photo: the words and
  // buttons under them step aside.
  covered: boolean;
  // Its comments (or Scorecard) are open in the white panel's place (wide):
  // what's under them is out of reach.
  docked: boolean;
  // The comments about one spot are open (over or beside the photo): its card
  // shows just where.
  spotSheet: boolean;
  // Nothing over the photo, to see it whole.
  clear: boolean;
  onHoldPhoto: (holding: boolean) => void;
  // Just the photo, until "Show everything" or another home.
  bare: boolean;
  onShowEverything: () => void;
  // What people said and liked shows on the photos, where they said it.
  pinsShown: boolean;
  onPins: (on: boolean) => void;
  // Go to this spot, from a comment about it (or the Scorecard).
  goToSpot: { spot: SpotRef; n: number; keyboard?: boolean; back?: HTMLElement | null } | null;
  // Just a look (beside the map): a tap anywhere opens the home full screen.
  onOpen?: () => void;
  onMore: () => void;
  shareAs: ShareKind | null;
  onShare?: () => void;
  // The homes before and after (side by side, the chevrons over the buttons).
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const { listing } = post;
  const [first] = useState(() => Math.max(0, Math.min(listing.Media.length - 1, start ?? 0)));
  const [photo, setPhoto] = useState(first);
  // The photo that has finished sliding into place: what's drawn over it
  // shows then, not while it's moving.
  const [settled, setSettled] = useState(first);
  // The spot whose card is open: on the photo on screen, or one of the facts.
  const [picked, setPicked] = useState<PickedSpot | null>(null);
  const current = listing.Media[photo];
  if (picked && (!active || (picked.mediaKey !== FACTS && picked.mediaKey !== (current && mediaKeyOf(current))))) {
    setPicked(null);
  }
  // When the comments close (posted, or put away), so does the card: what was
  // said now shows on the photo.
  const sheetOver = covered || spotSheet;
  const [wasCovered, setWasCovered] = useState(sheetOver);
  if (sheetOver !== wasCovered) {
    setWasCovered(sheetOver);
    if (!sheetOver) setPicked(null);
  }
  // A card open on the price or a fact, in the white panel, goes when the
  // comments take the panel's place (it would sit over them).
  if (docked && picked?.mediaKey === FACTS) setPicked(null);
  // To a spot from a comment about it: its photo, with its card open (or the
  // fact's card, for one about the price).
  const [show, setShow] = useState<{ index: number; n: number } | null>(null);
  const [went, setWent] = useState(0);
  if (goToSpot && goToSpot.n !== went && goToSpot.spot.mediaKey === FACTS) {
    setWent(goToSpot.n);
    setPicked({ ...goToSpot.spot, x: 0, y: 0, keyboard: goToSpot.keyboard, back: goToSpot.back });
  } else if (goToSpot && goToSpot.n !== went) {
    setWent(goToSpot.n);
    const index = listing.Media.findIndex((m) => mediaKeyOf(m) === goToSpot.spot.mediaKey);
    const target = listing.Media[index];
    const at = target && tagPosition(target, goToSpot.spot.tag);
    // (The photo as a whole, liked: just the photo.)
    if (index >= 0) {
      setShow({ index, n: goToSpot.n });
      setPhoto(index);
      setSettled(index);
      if (at) setPicked({ ...goToSpot.spot, ...at, keyboard: goToSpot.keyboard, back: goToSpot.back });
    }
  }
  // Tell the page which photos have been seen, as each settles on screen.
  const seen = useRef(onPhotoSeen);
  useLayoutEffect(() => {
    seen.current = onPhotoSeen;
  });
  useEffect(() => {
    if (active) seen.current?.(listing.ListingKey, settled);
  }, [active, settled, listing.ListingKey]);
  // The whole description, rather than two lines.
  const [more, setMore] = useState(false);
  // How tall the words at the bottom are, so the photo sits right on top of
  // them. On a phone they're always the same height (so the photo never jumps
  // from home to home); measured anyway, with the description closed: opening
  // it shouldn't move the photo.
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
  // "Show the photo only" puts away any card, and a tap on the photo then is
  // just a look: nothing waits to pop up when everything comes back.
  if (bare && picked) setPicked(null);
  // "Show everything" takes the place of what it hid, so the keyboard stays
  // put; pressing it hands the keyboard back to More, where it started.
  const everything = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backToMore = useRef(false);
  useEffect(() => {
    if (bare) {
      everything.current?.focus();
      return;
    }
    if (!backToMore.current) return;
    backToMore.current = false;
    // As soon as it's back: it fades in, and can't take the keyboard till then.
    let frame = 0;
    let tries = 0;
    const focusMore = () => {
      moreButton.current?.focus({ preventScroll: true });
      if (document.activeElement !== moreButton.current && ++tries < 30) frame = requestAnimationFrame(focusMore);
    };
    focusMore();
    return () => cancelAnimationFrame(frame);
  }, [bare]);
  // Photos load as a home comes close, and stay once loaded.
  const [loaded, setLoaded] = useState(near);
  if (near && !loaded) setLoaded(true);
  const photos = usePhotoLikes(listing.ListingKey, post.photoLikes);
  // The Scorecard (outside the home) counts what you've just done here.
  const { ids: yourIds } = photos;
  const tell = useRef(onYours);
  useLayoutEffect(() => {
    tell.current = onYours;
  });
  const yourKey = JSON.stringify(yourIds);
  useEffect(() => {
    tell.current?.(listing.ListingKey, yourIds.liked, yourIds.disliked);
    // Only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourKey, listing.ListingKey]);
  const viewer = useMemo<ScorecardViewer>(
    () => ({ state, liked: yourIds.liked, disliked: yourIds.disliked }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, yourKey],
  );
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
  // Nothing over the photo: held, or "Show the photo only".
  const hidden = clear || bare;
  const agentFirst = agentFirstName(agentName);
  // Side by side on a wide screen (never beside the map, just a look there).
  const split = SPLIT_WIDE && !onOpen;
  // The whole description opens where it is (side by side, in the panel;
  // before that, wide, over the photo); on a phone, in the Scorecard.
  const inPlace = (split && wide) || (!SPLIT_WIDE && !narrow);
  // Likes on things in a photo, for the strip of photos.
  const likesIn = (shown: ListingMedia) =>
    photos.likedTags(shown).reduce((sum, tag) => sum + photos.count(shown, tag), 0);

  // What people did lately, for the line above the price: the page's, or on
  // an agent's link, from the home's own thread (already only the link's).
  const told = useMemo(
    () => post.events ?? (mode === "share" ? eventsFromTimeline(post.timeline) : eventsFromHeadline(post.headline)),
    [post.events, post.timeline, post.headline, mode],
  );
  // On public pages, what you just did shows there at once, as it will once
  // the page hears it back (keyed the same, so nothing jumps when it does).
  const { unheard } = photos;
  const likedSpot = useMemo<TickerEvent | null>(
    () =>
      mode === "public" && unheard?.reaction === "like"
        ? {
            id: `you:like:${likeId(unheard.mediaKey, unheard.tag)}`,
            kind: unheard.mediaKey === FACTS ? "fact-like" : "spot-like",
            who: { tone: "you", name: null },
            at: unheard.at,
            mediaKey: unheard.mediaKey,
            spot: unheard.tag,
          }
        : null,
    [mode, unheard],
  );
  const likedHome = useMemo<TickerEvent | null>(() => {
    const shown = mode === "public" && reactedAt && JSON.stringify(state) !== JSON.stringify(base) ? publicSideOf(state) : null;
    return shown && reactedAt ? { id: "you:reaction", kind: "reaction", who: { tone: "you", name: null }, at: reactedAt, state: shown } : null;
  }, [mode, reactedAt, state, base]);
  const events = useMemo(() => {
    const yours = [likedSpot, likedHome]
      .filter((event): event is TickerEvent => Boolean(event))
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!yours) return told;
    return [yours, ...told.filter((event) => event.id !== yours.id)].sort((a, b) => b.at.localeCompare(a.at));
  }, [told, likedSpot, likedHome]);
  // Paused while a finger's on the photo, and for two seconds after.
  const [touching, setTouching] = useState(false);
  const letGo = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(letGo.current), []);
  const pressPhoto = (event: { target: EventTarget | null }) => {
    const target = event.target as Element;
    if (!target.closest('[aria-roledescription="carousel"]') || target.closest("button, a")) return;
    clearTimeout(letGo.current);
    setTouching(true);
    const up = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      letGo.current = setTimeout(() => setTouching(false), 2000);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  // A pointer on a spot on the photo (its likeId), and whether the line's
  // spot can be pointed at there.
  const [pinHover, setPinHover] = useState<string | null>(null);
  const [lightPlace, setLightPlace] = useState<{ tag: string; clear: boolean } | null>(null);
  const settledKey = listing.Media[settled] ? mediaKeyOf(listing.Media[settled]) : undefined;
  // The line's box, and the item in it.
  const tickerBox = useRef<HTMLDivElement>(null);
  const tickerLine = useRef<HTMLButtonElement>(null);
  const ticker = useTicker({
    box: tickerBox,
    events,
    listing,
    photoKey: settledKey,
    mode,
    // Beside the map it's just a look: the first, still.
    active: active && !onOpen,
    // (The nudge to swipe through the photos sits over the photo, so the
    // line waits for it; the one for the next home, at the photo's foot,
    // shows beside it.)
    held: Boolean(picked) || sheetOver || docked || nudge === "photos" || hidden || settled !== photo || touching,
    pinHovered: pinHover,
    likes,
    // Side by side, who liked it is said just below, under "Listed by".
    restOnLikes: !(split && wide),
  });
  const shownEvent = ticker.item;
  // Its face on the photo, where they did it: only on the photo at rest, with
  // nothing over it.
  const light: SpotLight | null =
    shownEvent &&
    onPhoto(shownEvent) &&
    shownEvent.mediaKey === settledKey &&
    active &&
    !onOpen &&
    !hidden &&
    !picked &&
    !sheetOver &&
    !docked &&
    nudge !== "photos"
      ? {
          event: shownEvent,
          ripples: ticker.shown.first ? 2 : 1,
          showing: ticker.shown.n,
          emphasis: ticker.looking,
          still: ticker.reduced,
          dim: ticker.running,
        }
      : null;
  // A fact it's about lights up, the same way.
  const litFact = shownEvent && onFact(shownEvent) && active && !onOpen && !hidden && shownEvent.spot && isFactTag(shownEvent.spot) ? shownEvent.spot : null;
  const unseen = Boolean(light && lightPlace && lightPlace.tag === light.event.spot && !lightPlace.clear);

  // A tap on the line: to where it happened. After it, the line stays put on
  // this home until you move on. From the keyboard, a spot's card takes it,
  // and gives it back to the line when it closes.
  const tapActivity = (event: TickerEvent, tap: TickerTap, index: number, keyboard: boolean) => {
    const spot = event.mediaKey && event.spot ? { mediaKey: event.mediaKey, tag: event.spot } : null;
    if (tap === "comment" && event.commentId) return onCommentAt(event.commentId);
    // About the home as a whole: what everyone thinks of it.
    if (tap === "home") return onScorecard();
    if (!spot || tap === "comment") return onComments();
    if (spot.mediaKey === FACTS) {
      if (tap === "spot-comments") return onCommentsAbout(spot);
      return setPicked({ ...spot, x: 0, y: 0, keyboard, fromLine: true });
    }
    const target = listing.Media[index];
    const at = target && tagPosition(target, spot.tag);
    if (!at) return onComments();
    if (index !== photo) {
      setShow((now) => ({ index, n: (now?.n ?? 0) + 1 }));
      setPhoto(index);
      setSettled(index);
    }
    setPicked({ ...spot, ...at, keyboard, fromLine: true });
    if (tap === "spot-comments") onCommentsAbout(spot);
  };
  // A fact's card asked for with a key takes it as soon as it can: on a
  // phone, the words it opens in are still coming back from under the sheet.
  useEffect(() => {
    if (!picked?.keyboard || picked.mediaKey !== FACTS) return;
    let frame = 0;
    let tries = 0;
    const take = () => {
      const card = words.current?.querySelector<HTMLElement>("[data-spot-card]");
      if (!card || card.contains(document.activeElement)) return;
      card.querySelector<HTMLElement>("button[aria-pressed]")?.focus({ preventScroll: true });
      if (!card.contains(document.activeElement) && ++tries < 30) frame = requestAnimationFrame(take);
    };
    frame = requestAnimationFrame(take);
    return () => cancelAnimationFrame(frame);
  }, [picked]);
  // A card opened from the line, closed: the keyboard goes back to the line
  // (unless it's gone somewhere else meanwhile). One opened from the
  // Scorecard goes back there: its row, or (the sheet gone) its button on
  // the rail, as soon as that's back in view.
  const lastPicked = useRef(picked);
  useLayoutEffect(() => {
    const was = lastPicked.current;
    lastPicked.current = picked;
    if (!(was?.fromLine || was?.back) || picked || !active) return;
    let frame = 0;
    let tries = 0;
    const giveBack = () => {
      const now = document.activeElement;
      if (now && now !== document.body) return;
      if (was.back) {
        if (!was.back.isConnected) return;
        was.back.focus({ preventScroll: true });
        if (document.activeElement !== was.back && ++tries < 30) frame = requestAnimationFrame(giveBack);
      } else tickerLine.current?.focus({ preventScroll: true });
    };
    giveBack();
    return () => cancelAnimationFrame(frame);
  }, [picked, active]);

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
      onPointerDownCapture={onOpen ? undefined : pressPhoto}
      // Where the photo goes. On a phone: in the clear space between the
      // header and the words, right on top of them, so the photo and what it
      // is read as one, top to bottom, with a blurred copy of it filling the
      // band above. A phone on its side: the full-screen photo with the
      // words over it. The photo alone, on a phone: whole and centred in the
      // whole screen, its blurred copy all round it, rather than over an
      // empty band where the words were. Side by side, wide: whole, at the
      // top of a stage on the left (level with the white panel), the strip
      // of photos under it (when there are several), clear of the buttons
      // and the panel down the right; held, it stays put; alone, it grows
      // to the whole window, centred. (With SPLIT_WIDE off, wide is the
      // full-screen photo with the words over it, centred.)
      data-split={split || undefined}
      className={cn(
        "relative h-full snap-start snap-always overflow-hidden bg-night",
        "[--photo-fit:1] [--backdrop-shade:0.4]",
        bare
          ? "[--backdrop-bottom:0px] [--backdrop-top:0px] [--photo-align:0.5] [--photo-bottom:env(safe-area-inset-bottom)] [--photo-top:env(safe-area-inset-top)]"
          : "[--backdrop-bottom:var(--photo-bottom)] [--backdrop-top:var(--photo-top)] [--photo-align:1] [--photo-bottom:calc(var(--words-height,calc(308px+env(safe-area-inset-bottom)))+var(--words-gap,0px))]",
        "short:[--backdrop-bottom:0px] short:[--backdrop-shade:0] short:[--backdrop-top:0px] short:[--photo-fit:0] short:[--words-gap:8px]",
        legacy(
          "@5xl:[--backdrop-bottom:0px] @5xl:[--backdrop-shade:0] @5xl:[--backdrop-top:0px] @5xl:[--photo-align:0.5] @5xl:[--photo-fit:0] @5xl:[--photo-top:calc(var(--chrome-top,4rem)+0.5rem)] @5xl:[--words-gap:8px]",
        ),
        "split:[--photo-fit:1] split:[--photo-left:24px]",
        bare
          ? "split:[--photo-align:0.5] split:[--photo-bottom:24px] split:[--photo-right:24px] split:[--photo-top:24px]"
          : cn(
              "split:[--photo-align:0] split:[--photo-right:468px] split:[--photo-top:var(--stage-top)] split-xl:[--photo-right:508px]",
              listing.Media.length > 1 ? "split:[--photo-bottom:120px]" : "split:[--photo-bottom:24px]",
            ),
      )}
      style={wordsHeight ? ({ "--words-height": `${wordsHeight}px` } as CSSProperties) : undefined}
    >
      {loaded && (
        <ReelPhotos
          media={listing.Media}
          address={listing.UnparsedAddress}
          active={active}
          priority={index <= 1}
          start={first}
          counter={counter}
          likesOf={likesIn}
          onIndexChange={(next) => {
            setPhoto(next);
            onSwipe?.();
          }}
          onSettle={setSettled}
          onDoubleTap={onOpen ? undefined : likeWhatsShown}
          onTap={onOpen ? () => onOpen() : photos.enabled && !hidden ? tapPhoto : undefined}
          onHold={onOpen ? undefined : onHoldPhoto}
          controls={!onOpen}
          chrome={!hidden}
          show={show}
          peek={nudge === "photos"}
          overlay={
            <>
              {nudge && <NudgeHint nudge={nudge} />}
              {bare && (
                // Never stuck with nothing to tap: one way back, at the foot
                // of the photo (with the words gone, its own bottom edge).
                <button
                  ref={everything}
                  type="button"
                  onClick={() => {
                    backToMore.current = true;
                    onShowEverything();
                  }}
                  style={{
                    top: `calc(${photoFoot(current)} - 3.25rem)`,
                    left: `calc(${photoPlace(current).left} + ${photoPlace(current).width} / 2)`,
                  }}
                  className="absolute z-10 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-4 text-[15px] font-semibold text-white backdrop-blur-md hover:bg-black/65"
                >
                  <Eye aria-hidden size={18} />
                  Show everything
                </button>
              )}
            </>
          }
        />
      )}
      {/* Before the side-by-side layout, wide screens had the words over
          the photo, centred, with shades to keep the header and the words
          readable; the bottom one deepened to hold the whole description.
          Now a phone's words sit on the dark ground, side by side they're on
          a white panel, and on a phone on its side they carry their own
          shade (below), under the header's own. */}
      {!SPLIT_WIDE && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 hidden h-32 bg-linear-to-b from-black/50 to-transparent transition-opacity duration-300 short:block @5xl:block",
            hidden && "opacity-0",
          )}
        />
      )}
      {!SPLIT_WIDE && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 hidden bg-linear-to-t to-transparent transition-[opacity,height] duration-300 @5xl:block",
            more ? "h-3/4 from-black/85 via-black/55" : "h-1/2 from-black/80 via-black/40",
            (covered || hidden) && "opacity-0",
          )}
        />
      )}

      {/* The words and buttons. Only their links and buttons take a touch: a
          swipe that starts on the words, where a thumb usually is, turns the
          photos, and a tap there clears them off the photo. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          hidden && "invisible opacity-0",
        )}
      >
        {/* The buttons and the words at the bottom are under the comments
            while they're open, so they step aside. */}
        <div
          className={cn(
            "relative mx-auto h-full max-w-5xl transition-[opacity,visibility] duration-300 split:max-w-none",
            covered && "invisible opacity-0",
          )}
        >
          {!onOpen && onNext && (
            // Side by side: to the home before or after, at the top of the
            // buttons' column, for anyone who doesn't think to scroll.
            <div className="pointer-events-auto absolute right-[396px] top-(--stage-top) hidden w-[72px] flex-col items-center gap-2 split:flex split-xl:right-[436px]">
              <button
                type="button"
                aria-label="Go to the previous home"
                data-follow="previous"
                disabled={!onPrevious}
                onClick={onPrevious}
                className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-white/10"
              >
                <ChevronUp aria-hidden size={24} />
              </button>
              <button
                type="button"
                aria-label="Go to the next home"
                data-follow="next"
                onClick={onNext}
                className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-white/20"
              >
                <ChevronDown aria-hidden size={24} />
              </button>
            </div>
          )}
          {!onOpen && (
            <Rail
              address={listing.UnparsedAddress}
              things={things}
              liked={liked}
              likes={likes}
              comments={comments}
              shareAs={shareAs}
              onLike={onLike}
              onComments={onComments}
              onScorecard={() => onScorecard()}
              onShare={onShare}
              onMore={onMore}
              moreRef={moreButton}
            />
          )}
        </div>

        {/* All the words, in one block at the bottom, read top to bottom like
            a listing: who's talking, the price, beds, baths and size, the
            address, the description, who listed it, and the comment bar. On a
            phone a fixed 308px on the dark ground, every row one line (the
            description two) so it never changes height: anything new belongs
            in a sheet, not here. Side by side, the same words in a white
            panel beside the photo, scrolling if they need to, with who liked
            it, and the comment bar at its foot. Beside the map, the phone's,
            with "Open full screen" for the bar. */}
        <div
          ref={words}
          data-words
          inert={docked || undefined}
          className={cn(
            "absolute inset-x-0 bottom-0 flex flex-col bg-night pb-(--words-pad) transition-[opacity,visibility] duration-300 [--words-pad:calc(12px+env(safe-area-inset-bottom))]",
            more ? "h-auto" : "h-[calc(296px+var(--words-pad))]",
            // On its side: over the photo, on a shade of their own that
            // starts a little above the first line, so every line of it reads
            // on the brightest photo.
            "short:h-auto short:bg-transparent short:bg-linear-to-t short:from-black/80 short:to-black/65",
            "short:before:pointer-events-none short:before:absolute short:before:inset-x-0 short:before:bottom-full short:before:h-12 short:before:bg-linear-to-t short:before:from-black/65 short:before:to-transparent",
            legacy(
              "@5xl:h-auto @5xl:items-center @5xl:bg-transparent @5xl:px-6 @5xl:[--words-pad:max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))]",
            ),
            "split:pointer-events-auto split:bottom-6 split:left-auto split:right-6 split:top-(--stage-top) split:h-auto split:w-[360px] split:overflow-hidden split:rounded-2xl split:bg-white split:bg-none split:pb-0 split:text-ink split:shadow-xl split:before:hidden split-xl:w-[400px]",
            // Beside the map on a phone, its Map button floats at the bottom.
            onOpen && "max-lg:[--words-pad:6rem]",
            covered && "invisible opacity-0",
          )}
        >
          <div
            data-keep-clear
            className={cn(
              // Clear of a notch or rounded corner, on a phone on its side.
              "relative w-full pl-[max(1rem,env(safe-area-inset-left))] [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]",
              legacy("@5xl:max-w-xl @5xl:px-0"),
              // Clear of the buttons down the right (two columns of them, on its side).
              onOpen
                ? "pr-[max(1rem,env(safe-area-inset-right))]"
                : "pr-[calc(76px+env(safe-area-inset-right))] short:pr-[calc(140px+env(safe-area-inset-right))]",
              "split:min-h-0 split:flex-1 split:overflow-y-auto split:overscroll-contain split:pb-5 split:pl-5 split:pr-5 split:pt-3 split:[text-shadow:none]",
            )}
          >
            <div className="flex h-12 items-center split:h-[76px]">
              <ActivityTicker
                ticker={ticker}
                box={tickerBox}
                line={tickerLine}
                listing={listing}
                photoKey={settledKey}
                myName={myName}
                liked={{ count: likes, names: post.likers, you: liked || photos.hasAny }}
                unseen={unseen}
                underline={Boolean(
                  shownEvent?.mediaKey &&
                    shownEvent.spot &&
                    shownEvent.mediaKey === settledKey &&
                    pinHover === likeId(shownEvent.mediaKey, shownEvent.spot),
                )}
                // Beside the map, just to read; a tap there opens the home.
                onTap={onOpen ? undefined : tapActivity}
                hint={
                  onOpen
                    ? null
                    : mode === "share"
                      ? `Tap anything in the photo to tell ${agentFirst} what you think`
                      : "Tap anything in the photo to like it or say something"
                }
              />
            </div>
            <Facts
              listing={listing}
              items={post.timeline}
              trending={post.buzz.trending}
              // Beside the map, just a look.
              photos={onOpen || !photos.enabled ? null : photos}
              lit={litFact}
              open={picked?.mediaKey === FACTS && isFactTag(picked.tag) ? picked.tag : null}
              keyboard={picked?.mediaKey === FACTS && picked.keyboard}
              onOpen={(tag) =>
                setPicked((now) => (now?.mediaKey === FACTS && now.tag === tag ? null : { mediaKey: FACTS, tag, x: 0, y: 0 }))
              }
              onClose={() => setPicked(null)}
              onComment={onCommentSpot}
              onPosted={() => setPicked(null)}
            />
            {/* Side by side, a card on the price or a fact opens over these,
                and they step aside for it rather than show round it. */}
            <div className={cn(picked?.mediaKey === FACTS && "split:invisible")}>
              <Caption
                listing={listing}
                greeting={post.greeting}
                note={post.note}
                open={more}
                // On a phone, the rest of it is in the Scorecard, under
                // "About this home"; side by side, it opens in the panel.
                inPlace={inPlace}
                onToggle={onOpen ? undefined : inPlace ? () => setMore(!more) : () => onScorecard("about")}
              />
              {/* Who's selling it runs short before "Sample listing" does: it's
                  the only sign on the home that it isn't real. */}
              <p className="flex h-5 whitespace-nowrap text-[13px] leading-5 text-white/80 split:text-stone-600">
                <span className="min-w-0 truncate">
                  {listing.ListAgentFullName && `Listed by ${listing.ListAgentFullName}`}
                  {listing.ListOfficeName && ` · ${listing.ListOfficeName}`}
                </span>
                {isSampleListing(listing) && <span className="shrink-0">&nbsp;· Sample listing</span>}
              </p>
              {split && likes > 0 && (
                <LikedBy
                  likes={likes}
                  you={liked || photos.hasAny}
                  myName={myName}
                  // Never you: you're said from what you've just done.
                  names={post.likers}
                  onOpen={() => onScorecard()}
                  className="hidden split:block"
                />
              )}
              {/* Side by side, in brief: how people feel and what they say. */}
              {split && wide && (
                <WhatPeopleThink post={post} mode={mode} viewer={viewer} myName={myName} onOpen={() => onScorecard()} />
              )}
            </div>
            {error && (
              <p
                role="alert"
                // Over the photo's foot, and over the comments toggle there
                // (side by side, in the panel, under the words).
                className="absolute bottom-full left-[max(1rem,env(safe-area-inset-left))] z-30 mb-2 rounded-full bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white [text-shadow:none] split:static split:mb-0 split:mt-3 split:w-fit"
              >
                {error}
              </p>
            )}
          </div>
          <div
            className={cn(
              "mt-2 w-full pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
              legacy("@5xl:max-w-xl @5xl:px-0"),
              "split:mt-0 split:border-t split:border-stone-200 split:p-3",
            )}
          >
            {onOpen ? (
              <button
                type="button"
                data-keep-clear
                onClick={onOpen}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-ink shadow-lg transition-colors hover:bg-white/90"
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
                className="flex h-12 w-full items-center gap-3 rounded-full bg-white/12 pl-5 pr-3 text-left text-base text-white/75 ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/18 split:bg-stone-100 split:text-stone-600 split:ring-0 split:backdrop-blur-none split:hover:bg-stone-200"
              >
                <span className="min-w-0 flex-1 truncate">
                  {mode === "share" ? `Tell ${agentFirst} what you think…` : "Add a comment…"}
                </span>
                <Send aria-hidden size={18} className="shrink-0 opacity-70" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Over everything else: where you tapped, and what people said and
          liked where they said it. Not while the photo's moving, or held. */}
      {loaded && photos.enabled && !onOpen && (
        <SpotLayer
          listingKey={listing.ListingKey}
          photo={active && !hidden && settled === photo ? current : undefined}
          items={post.timeline}
          photos={photos}
          picked={picked}
          onPick={setPicked}
          pinsShown={pinsShown}
          onTogglePins={() => onPins(!pinsShown)}
          onComment={onCommentSpot}
          covered={sheetOver}
          onPosted={() => {
            setPicked(null);
            onPins(true);
          }}
          highlight={light}
          myName={myName}
          nudge={nudge}
          onHighlightClear={(tag, clear) =>
            setLightPlace((now) => (now?.tag === tag && now.clear === clear ? now : { tag, clear }))
          }
          onPinHover={setPinHover}
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
  follow,
  ref,
}: {
  label: string;
  count?: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  name: string;
  // The same button on every home: the keyboard follows it to the next.
  follow?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-follow={follow}
      aria-label={name}
      aria-pressed={pressed}
      onClick={onClick}
      className="group flex w-14 flex-col items-center gap-0.5 text-[13px] font-semibold leading-4 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-md transition-transform group-active:scale-90 compact:size-11 motion-reduce:transition-none motion-reduce:group-active:scale-100 split:bg-white/10 split:ring-1 split:ring-white/15 split:group-hover:bg-white/20">
        {children}
      </span>
      <span aria-hidden className="tabular-nums">
        {count ?? label}
      </span>
    </button>
  );
}

type Thing = { tag: string; liked: boolean; count: number; toggle: () => void };

// Down the right, in reach of a thumb, bottom up from just over the comment
// bar: like, comments, the Scorecard, share (or invite, or send), more. Each
// keeps its label.
function Rail({
  address,
  things,
  liked,
  likes,
  comments,
  shareAs,
  onLike,
  onComments,
  onScorecard,
  onShare,
  onMore,
  moreRef,
}: {
  address: string;
  things: Thing[];
  liked: boolean;
  likes: number;
  comments: number;
  shareAs: ShareKind | null;
  onLike: () => void;
  onComments: () => void;
  onScorecard: () => void;
  onShare?: () => void;
  onMore: () => void;
  moreRef?: Ref<HTMLButtonElement>;
}) {
  const icon = { "aria-hidden": true, className: "drop-shadow" } as const;
  return (
    <div
      data-keep-clear
      // Clear of a notch or rounded corner, on a phone on its side. There, in
      // two columns: one would run up under the header.
      // Side by side: a column of its own between the photo and the panel.
      className={cn(
        "pointer-events-auto absolute bottom-[calc(68px+env(safe-area-inset-bottom))] right-[calc(0.5rem+env(safe-area-inset-right))] z-10 flex flex-col items-center gap-1 short:grid short:grid-cols-2 short:gap-x-2",
        legacy("@5xl:bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4.25rem))] @5xl:right-[calc(1rem+env(safe-area-inset-right))]"),
        "split:bottom-6 split:right-[396px] split:flex split:w-[72px] split-xl:right-[436px]",
      )}
    >
      <LikeWithList things={things}>
        <RailButton
          name={`Like ${address}${likes ? `, ${likes} ${likes === 1 ? "like" : "likes"}` : ""}`}
          label="Like"
          count={likes ? countLabel(likes) : "Like"}
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
        count={comments ? countLabel(comments) : "Comment"}
        onClick={onComments}
      >
        <MessageCircle size={28} {...icon} />
      </RailButton>
      <RailButton name="Scorecard" label="Scorecard" onClick={onScorecard} follow="scorecard">
        <ClipboardList size={26} {...icon} />
      </RailButton>
      {onShare && shareAs === "send" && (
        <RailButton name="Send to a client" label="Send" onClick={onShare}>
          <Send size={26} {...icon} />
        </RailButton>
      )}
      {onShare && shareAs === "invite" && (
        <RailButton name="Invite someone" label="Invite" onClick={onShare}>
          <UserPlus size={26} {...icon} />
        </RailButton>
      )}
      {onShare && shareAs === "share" && (
        <RailButton name="Share" label="Share" onClick={onShare}>
          <Share2 size={26} {...icon} />
        </RailButton>
      )}
      <RailButton name="More options" label="More" onClick={onMore} ref={moreRef} follow="more">
        <Ellipsis size={28} {...icon} />
      </RailButton>
    </div>
  );
}

// What the home costs, what it is, and where: one line each, the way listings
// read. Each fact can be liked, disliked or commented on, just like anything in
// the photos: tap the price, and a card opens above it. What people thought of
// each is said to screen readers and shown on its card, not printed here.
function Facts({
  listing,
  items,
  trending,
  photos,
  lit = null,
  open,
  keyboard = false,
  onOpen,
  onClose,
  onComment,
  onPosted,
}: {
  listing: Listing;
  items: TimelineItem[];
  trending: boolean;
  // The open one was asked for with a key (from the Scorecard): its card
  // takes the keyboard.
  keyboard?: boolean;
  // Null where they're just to read (beside the map).
  photos: Photos | null;
  // The one the line above is about just now: it lights up.
  lit?: FactTag | null;
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
        lit={lit === tag}
        onOpen={() => onOpen(tag)}
        className={className}
      >
        {children}
      </FactButton>
    ) : (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>{children}</span>
    );
  const beds = listing.BedroomsTotal;
  const baths = listing.BathroomsTotalInteger;

  // A card opens above the facts. Where there's no room for it there under
  // the header (a phone on its side), it goes as high as it can, beside what
  // was tapped, so its Close is always on screen and the fact stays in view.
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardAt, setCardAt] = useState<{ tag: FactTag; style: CSSProperties | null } | null>(null);
  useLayoutEffect(() => {
    const el = card.current;
    const box = root.current;
    const panel = box?.closest("article");
    if (!open || !el || !box || !panel) return;
    const place = () => {
      // Side by side, in the panel: right under the facts, the panel's width,
      // over the words below them (its round corners above their first line).
      if (sideBySide(panel)) {
        return setCardAt({
          tag: open,
          style: { top: "100%", bottom: "auto", marginTop: 0, marginBottom: 0, left: 0, right: 0, width: "auto" },
        });
      }
      const facts = box.getBoundingClientRect();
      const frame = panel.getBoundingClientRect();
      const height = el.offsetHeight;
      const highest = headerFoot(panel) + 8;
      const above = facts.top - 8 - height;
      if (above >= highest) return setCardAt({ tag: open, style: null });
      const top = Math.max(highest, Math.min(above, frame.bottom - 8 - height));
      const tapped = box.querySelector('[aria-expanded="true"]')?.getBoundingClientRect();
      const left =
        tapped && top + height > tapped.top
          ? Math.max(0, Math.min(tapped.right + 8 - facts.left, facts.width - el.offsetWidth))
          : 0;
      setCardAt({ tag: open, style: { top: top - facts.top, left, bottom: "auto", marginBottom: 0 } });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open]);

  return (
    <div ref={root} className="relative">
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
          keyboard={keyboard}
          onClose={onClose}
          onComment={() => onComment({ mediaKey: FACTS, tag: open })}
          onPosted={onPosted}
          extra={
            open === "Address" && (
              <Link
                href={`/search?home=${encodeURIComponent(listing.ListingKey)}`}
                className="mt-2 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-brand hover:underline"
              >
                <MapPin aria-hidden size={15} />
                See it on the map
              </Link>
            )
          }
          ref={card}
          style={cardAt?.tag === open ? (cardAt.style ?? undefined) : undefined}
          // Above the facts, over the photo, clear of everything else, and no
          // wider than the words (so not over the buttons down the right).
          className="bottom-full left-0 z-40 mb-2 max-w-full"
        />
      )}
      <div className="flex h-11 items-center gap-2.5">
        <p className={cn("font-display text-[30px] font-semibold leading-none tabular-nums split:text-[32px]", legacy("@5xl:text-4xl"))}>
          {fact("Price", formatPrice(listing.ListPrice))}
        </p>
        {trending && (
          // Earned, not decoration: real activity from several people this
          // week, among the busiest homes for sale.
          <span
            className={cn(
              "flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 text-[13px] font-semibold [text-shadow:none] short:bg-black/45 short:backdrop-blur-md",
              legacy("@5xl:bg-black/45 @5xl:backdrop-blur-md"),
              // On the white panel beside the photo.
              "split:bg-rose-50 split:text-rose-700 split:backdrop-blur-none",
            )}
          >
            <Flame aria-hidden size={12} className="text-rose-300 split:text-rose-600" />
            Trending
          </span>
        )}
      </div>
      {/* One line however long: the size runs short first. */}
      <p className="flex h-10 items-center gap-x-1.5 whitespace-nowrap text-base text-white/90 split:text-stone-700">
        {fact("Bedrooms", `${beds} ${beds === 1 ? "bed" : "beds"}`, undefined, "shrink-0")}
        <span aria-hidden className="text-white/60 split:text-stone-400">
          ·
        </span>
        {fact("Bathrooms", `${baths} ${baths === 1 ? "bath" : "baths"}`, undefined, "shrink-0")}
        <span aria-hidden className="text-white/60 split:text-stone-400">
          ·
        </span>
        {fact(
          "Square footage",
          `${listing.LivingArea.toLocaleString("en-US")} sq ft`,
          <span className="min-w-0 truncate">{listing.LivingArea.toLocaleString("en-US")} sq ft</span>,
        )}
      </p>
      <h2 className="flex h-10 min-w-0 items-center text-base font-medium">
        {fact(
          "Address",
          `${listing.UnparsedAddress}, ${listing.City}`,
          <>
            <MapPin aria-hidden size={16} className="shrink-0" />
            <span className="min-w-0 truncate">
              {listing.UnparsedAddress}, {listing.City}
            </span>
          </>,
          "max-w-full",
        )}
      </h2>
    </div>
  );
}

// A home laid out side by side right now (wide, and not beside the map).
function sideBySide(home: HTMLElement) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return SPLIT_WIDE && home.hasAttribute("data-split") && home.clientWidth >= 64 * rem;
}

// Where the header ends over a home (`--photo-top`): nothing that opens over
// the home goes higher, so it can always be closed.
function headerFoot(panel: HTMLElement) {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:var(--photo-top,0px);width:0;height:0;visibility:hidden";
  panel.append(probe);
  const at = probe.getBoundingClientRect().top;
  probe.remove();
  return at;
}

// One fact, to tap. Its name says what people thought of it ("$985,000, 1
// like, 1 comment"); the card it opens shows it.
function FactButton({
  tag,
  name,
  hint,
  photos,
  comments,
  open,
  lit = false,
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
  // What the line above is about just now.
  lit?: boolean;
  onOpen: () => void;
  className?: string;
  children: ReactNode;
}) {
  const likes = photos.count(FACTS, tag);
  const dislikes = photos.dislikes(FACTS, tag);
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
        "-mx-1 inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-md px-1 text-left transition-colors hit-44 hover:bg-white/10 active:bg-white/15 split:hover:bg-stone-100 split:active:bg-stone-200",
        open && "bg-white/15 split:bg-stone-100",
        lit && "bg-white/15 ring-2 ring-white/70 split:bg-stone-100 split:ring-brand",
        className,
      )}
    >
      {children}
    </button>
  );
}

// Side by side, under who listed it: who liked the home, a face or three and
// their names, "Liked by Maya, Sam and 6 others", and a tap to what everyone
// thinks, in the Scorecard. You first (as you are right now), then the people the page names
// (on an agent's link, those on it; elsewhere, the latest few, never you),
// then how many more.
function LikedBy({
  likes,
  you,
  myName,
  names,
  onOpen,
  className,
}: {
  likes: number;
  // You like it (or something in its photos).
  you: boolean;
  myName: string | null;
  names: string[];
  onOpen: () => void;
  className?: string;
}) {
  const named = [...(you ? ["you"] : []), ...names].slice(0, Math.min(2, likes));
  const rest = likes - named.length;
  const text =
    named.length === 0
      ? `Liked by ${likes} ${likes === 1 ? "person" : "people"}`
      : rest > 0
        ? `Liked by ${named.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`
        : `Liked by ${named.join(" and ")}`;
  const faces = [...named.map((name) => (name === "you" ? (myName ?? "") : name)), ...(rest > 0 ? [null] : [])].slice(0, 3);
  return (
    <div className={cn("mt-4 border-t border-stone-200 pt-2", className)}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${text}. See the scorecard`}
        className="-mx-1 flex min-h-11 items-center gap-2.5 rounded-xl px-1 text-left text-sm text-stone-700 hover:bg-stone-50"
      >
        {/* Each face over the next, so every initial reads whole. */}
        <span aria-hidden className="flex shrink-0 pl-1.5">
          {faces.map((name, i) => (
            <span
              key={i}
              style={{ zIndex: faces.length - i }}
              className={cn(
                "relative -ml-1.5 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white",
                name ? "bg-brand text-white" : "bg-stone-200 text-stone-600",
              )}
            >
              {name ? name[0]?.toUpperCase() : <User size={12} />}
            </span>
          ))}
        </span>
        <span className="min-w-0">{text}</span>
      </button>
    </div>
  );
}

// Two lines of the description (or, on an agent's link, their greeting and
// note), then "… more" right after the last word that fits, a fingertip to
// tap. On a phone it opens the Scorecard at "About this home", where all of
// it is; side by side, it reads it all in place, and "less" puts it away (one
// button, which stays where the keyboard is).
function Caption({
  listing,
  greeting,
  note,
  open,
  inPlace = true,
  onToggle,
}: {
  listing: Listing;
  greeting?: string;
  note?: string;
  open: boolean;
  // "more" opens it right here (false: it opens the rest elsewhere, a sheet).
  inPlace?: boolean;
  // Unset beside the map, where it's just a look.
  onToggle?: () => void;
}) {
  const text = note || listing.PublicRemarks || "";
  const row = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // How much of the text fits before "… more" (all of it: no "more"). Until
  // it's measured, the browser cuts it off at two lines.
  const [fits, setFits] = useState<{ text: string; n: number } | null>(null);
  useLayoutEffect(() => {
    const outer = row.current;
    const el = box.current;
    if (!outer || !el || open || !text) return;
    const measure = () => {
      if (el.clientWidth === 0) return;
      const m = captionFit(outer, el, text);
      setFits((now) => (now?.text === text && now.n === m ? now : { text, n: m }));
    };
    measure();
    // Again when the room changes (the window, a phone turning) or the
    // typeface arrives.
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(el);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [open, text, greeting]);
  // (Not measured, or a greeting too long for the lines on its own: cut off.)
  const n = fits && fits.text === text && fits.n >= 0 ? fits.n : null;
  const cut = !open && n !== null && n < text.length;
  return (
    <div
      ref={row}
      className={cn(
        // Side by side: up to ten lines in the panel (a listing's usual
        // description whole), and all of it right there when opened (the
        // panel scrolls).
        "mb-1 text-[15px] leading-[22px] text-white/85 split:mb-2 split:mt-1 split:leading-6 split:text-stone-700",
        open
          ? "pointer-events-auto max-h-[45dvh] overflow-y-auto overscroll-contain split:max-h-none split:overflow-visible"
          : "h-11 short:mb-0 short:h-[22px] split:h-auto split:max-h-60",
      )}
    >
      <div ref={box} className={cn(!open && n === null && "line-clamp-2 short:line-clamp-1 split:line-clamp-10")}>
        {greeting && <h1 className="inline font-semibold text-white split:text-ink">{greeting}</h1>}
        {greeting && text && " "}
        {text && <span>{cut ? clipped(text, n ?? 0) : text}</span>}
        {cut && <span aria-hidden>…</span>}{" "}
        {onToggle && (open || cut) && (
          <button
            type="button"
            aria-expanded={inPlace ? open : undefined}
            aria-haspopup={inPlace ? undefined : "dialog"}
            onClick={onToggle}
            className="font-semibold text-white hit-44 split:text-ink"
          >
            {open ? "less" : "more"}
          </button>
        )}
      </div>
    </div>
  );
}

// The first `n` characters, without a dangling stop, comma or dash before the "…".
const clipped = (text: string, n: number) => text.slice(0, n).replace(/[\s.,;:\u2013\u2014-]+$/, "");

// How many characters of `text` fit in the caption's lines with "… more"
// after them, at the end of a whole word (all of them, when "more" isn't
// needed). Laid out in an unseen copy beside it, with the same type and width.
function captionFit(row: HTMLElement, box: HTMLElement, text: string) {
  // Its lines: a fixed height, or (side by side) as tall as it may grow.
  const most = parseFloat(getComputedStyle(row).maxHeight);
  const limit = (Number.isFinite(most) ? most : row.clientHeight) + 1;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;left:0;top:0;width:${box.clientWidth}px;visibility:hidden;pointer-events:none`;
  const words = document.createTextNode(text);
  const greeting = box.querySelector("h1")?.cloneNode(true);
  probe.append(...(greeting ? [greeting, " "] : []), words);
  row.append(probe);
  try {
    if (probe.offsetHeight <= limit) return text.length;
    const more = document.createElement("button");
    more.className = "font-semibold";
    more.textContent = "more";
    probe.append("… ", more);
    let [low, high] = [0, text.length];
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      words.data = clipped(text, mid);
      if (probe.offsetHeight <= limit) low = mid;
      else high = mid - 1;
    }
    words.data = clipped(text, low);
    if (probe.offsetHeight > limit) return -1;
    const end = /\s/.test(text[low] ?? " ") ? low : text.lastIndexOf(" ", low);
    return end > 0 ? end : low;
  } finally {
    probe.remove();
  }
}

const NO_ITEMS: FeedPost["timeline"] = [];

// The comments and the Scorecard: one sheet, which turns from one to the
// other in place (on a phone, from a link in each; beside the photo, tabs).
function HomeSheet({
  post,
  kind,
  spot,
  opened,
  section,
  mode,
  agentName,
  viewer,
  myName,
  alone,
  canShare,
  anchor,
  docked,
  photoFoot,
  onClose,
  onSwitch,
  onCompose,
  onPostedSpot,
  onShowSpot,
  onScorecardSpot,
  onLike,
  onPass,
  onOpenMore,
}: {
  post: FeedPost | null;
  kind: "comments" | "scorecard";
  // Only the comments about this spot in a photo, and a box to add one.
  spot?: SpotRef;
  // Opened on this comment: if it's a reply, its replies show.
  opened?: string;
  // The Scorecard, opened at this part of it.
  section?: "about";
  mode: "public" | "share";
  agentName?: string;
  viewer?: ScorecardViewer;
  myName: string | null;
  // On an agent's link known to be this person's alone.
  alone: boolean;
  canShare: boolean;
  // The feed (phones), or the white panel it takes the place of (wide).
  anchor: RefObject<HTMLElement | null>;
  // Beside the photo, wide.
  docked: boolean;
  // Where the photo ends, from the top of the feed, when it opened.
  photoFoot?: number;
  onClose: () => void;
  onSwitch: (listingKey: string, kind: "comments" | "scorecard") => void;
  onCompose: (listingKey: string) => void;
  onPostedSpot: (listingKey: string) => void;
  onShowSpot: (listingKey: string, spot: SpotRef) => void;
  // To a spot in the photos, or one of the facts (`keyboard`: pressed with a key).
  onScorecardSpot: (listingKey: string, spot: SpotRef, keyboard?: boolean) => void;
  onLike: (listingKey: string) => void;
  onPass: (listingKey: string) => void;
  onOpenMore: (listingKey: string) => void;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const all = post?.timeline ?? NO_ITEMS;
  const items = post && spot ? spotThread(all, spot) : all;
  const comments = items.filter((item) => item.kind === "comment").length;
  const name = post && spot ? spotName(post.listing, spot) : null;
  const key = post?.listing.ListingKey ?? null;
  const scorecard = kind === "scorecard";
  // Tabs beside the photo (not about one spot, which has its own title).
  const tabbed = docked && !spot;
  const tabsId = useId();

  // A new comment of yours scrolls into view where it lands, after the others
  // (and before who liked what).
  const seen = useRef(items.length);
  useEffect(() => {
    const last = items.at(-1);
    if (items.length > seen.current && last?.kind === "comment" && last.mine) {
      end.current
        ?.closest("dialog")
        ?.querySelector(`[data-comment="${CSS.escape(last.id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    }
    seen.current = items.length;
  }, [items]);

  // The Scorecard opens where you left it on this home (while the page is
  // open), or at the part asked for; the comments, at the top.
  const kept = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !key) return;
    if (!scorecard) {
      el.scrollTop = 0;
      return;
    }
    const part = section && el.querySelector<HTMLElement>(`[data-section="${section}"]`);
    el.scrollTop = part
      ? el.scrollTop + part.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
      : (kept.current.get(key) ?? 0);
    const keep = () => kept.current.set(key, el.scrollTop);
    el.addEventListener("scroll", keep, { passive: true });
    return () => el.removeEventListener("scroll", keep);
  }, [key, scorecard, section]);

  const close = () => {
    setReplyTo(null);
    onClose();
  };

  // Beside the photo: "Comments 9 | Scorecard", arrows move between them.
  const tab = (which: "comments" | "scorecard") => `${tabsId}-${which}`;
  const tabs = tabbed && key && (
    <div role="tablist" aria-label="Comments and scorecard" className="flex gap-1">
      {(["comments", "scorecard"] as const).map((which) => {
        const selected = kind === which;
        return (
          <button
            key={which}
            type="button"
            role="tab"
            id={tab(which)}
            aria-selected={selected}
            aria-controls={`${tabsId}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSwitch(key, which)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const to = event.key === "Home" ? "comments" : event.key === "End" ? "scorecard" : which === "comments" ? "scorecard" : "comments";
              flushSync(() => onSwitch(key, to));
              document.getElementById(tab(to))?.focus();
            }}
            className={cn(
              "flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors",
              // The one showing: filled in ink, plain at a glance.
              selected ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-100 hover:text-ink",
            )}
          >
            {which === "comments" ? "Comments" : "Scorecard"}
            {which === "comments" && comments > 0 && (
              <span className={cn("tabular-nums", selected ? "text-white/80" : "text-stone-600")}>{comments.toLocaleString("en-US")}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <Sheet
      open={Boolean(post)}
      onClose={close}
      label={scorecard ? "Scorecard" : "Comments"}
      title={
        scorecard
          ? "Scorecard"
          : name
            ? `On ${name}`
            : comments
              ? `${comments} ${comments === 1 ? "comment" : "comments"}`
              : "Comments"
      }
      tabs={tabs || undefined}
      anchor={anchor}
      docked={docked}
      bodyRef={body}
      // All of them, or the Scorecard: up to the photo's foot, and taller by
      // dragging. About one spot: just tall enough, so the photo stays in
      // view above it.
      tall={scorecard || !spot}
      detents={(scorecard || !spot) && photoFoot !== undefined ? { minTop: photoFoot } : undefined}
      // (What's typed in the box stays, over at the Scorecard and back.)
      footerHidden={scorecard}
      footer={
        post && (
          <CommentComposer
            key={spot ? `${spot.mediaKey}:${spot.tag}` : "all"}
            listingKey={post.listing.ListingKey}
            canShare={mode === "share" && canShare}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            spot={spot}
            placeholder={
              name
                ? `Comment on ${name}…`
                : mode === "share"
                  ? `Tell ${agentFirstName(agentName)} what you think…`
                  : undefined
            }
            label={name ? undefined : "Add a comment"}
            // At a phone's two heights, the emoji wait for the box, so the
            // comments get the room until you go to say something.
            quickOnFocus={!spot && photoFoot !== undefined}
            onPosted={() => {
              setReplyTo(null);
              if (spot) onPostedSpot(post.listing.ListingKey);
            }}
          />
        )
      }
    >
      {post && (
        <div
          role={tabbed ? "tabpanel" : undefined}
          id={tabbed ? `${tabsId}-panel` : undefined}
          aria-labelledby={tabbed ? tab(kind) : undefined}
        >
          {scorecard ? (
            <ScorecardBody
              post={post}
              mode={mode}
              agentName={agentName}
              viewer={viewer}
              myName={myName}
              alone={alone}
              onShowSpot={(at, keyboard) => onScorecardSpot(post.listing.ListingKey, at, keyboard)}
              onOpenFact={(tag, keyboard) => onScorecardSpot(post.listing.ListingKey, { mediaKey: FACTS, tag }, keyboard)}
              onAllComments={() => onSwitch(post.listing.ListingKey, "comments")}
              onCompose={() => onCompose(post.listing.ListingKey)}
              onLike={() => onLike(post.listing.ListingKey)}
              onPass={() => onPass(post.listing.ListingKey)}
              onOpenMore={() => onOpenMore(post.listing.ListingKey)}
            />
          ) : (
            <>
              {!spot && !tabbed && (
                // What everyone thinks of the home: at the top, where it shows
                // at either height, then what people said.
                <div className="-mt-1 mb-3 border-b border-stone-100 pb-1">
                  <button
                    type="button"
                    onClick={() => onSwitch(post.listing.ListingKey, "scorecard")}
                    aria-label="See the scorecard: what people think of this home"
                    className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2.5 rounded-xl px-2 py-1 text-left hover:bg-stone-50"
                  >
                    <ClipboardList aria-hidden size={18} className="shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-5 text-ink">See the scorecard</span>
                      <span className="block truncate text-[13px] leading-[18px] text-stone-600">What people think of this home</span>
                    </span>
                    <ChevronRight aria-hidden size={18} className="shrink-0 text-stone-400" />
                  </button>
                </div>
              )}
              <Timeline
                listingKey={post.listing.ListingKey}
                items={items}
                opened={opened}
                canShare={canShare}
                onReply={(target) => {
                  setReplyTo(target);
                  // In the same tap, so a phone shows its keyboard.
                  end.current?.ownerDocument
                    .querySelector<HTMLElement>("dialog[open] [data-composer]")
                    ?.focus({ preventScroll: true });
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
                <p className="mt-6 text-center text-xs text-stone-500">
                  Comments here are public. Buyers&apos; private chats with their agents stay private unless they choose to
                  share.
                </p>
              )}
              <div ref={end} />
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function MoreSheet({
  post,
  state,
  agentName,
  onPass,
  onToggle,
  onNext,
  onPhotoOnly,
  onClose,
  anchor,
  returnTo,
}: {
  post: FeedPost | null;
  state: ReactionState;
  agentName?: string;
  anchor: RefObject<HTMLElement | null>;
  returnTo?: () => HTMLElement | null;
  onPass: () => void;
  onToggle: (aspect: Aspect) => void;
  onNext: () => void;
  onPhotoOnly: () => void;
  onClose: () => void;
}) {
  const passed = state.reaction === "dislike";
  return (
    <Sheet open={Boolean(post)} onClose={onClose} label="More" title="More" anchor={anchor} returnTo={returnTo}>
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
              {agentName ? `, and ${agentCalled(agentName)} will know` : ""}. Either way, your picks get better.
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
          <button
            type="button"
            onClick={onPhotoOnly}
            className="-mt-1 flex min-h-11 items-center gap-2 self-start rounded-lg text-sm font-semibold text-ink hover:text-stone-600"
          >
            <ImageIcon aria-hidden size={17} />
            Show the photo only
          </button>
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
                  className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/50 px-3 text-[13px] font-semibold text-white backdrop-blur-md hit-44 hover:bg-black/70 [text-shadow:none]"
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
