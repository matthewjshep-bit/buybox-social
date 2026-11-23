"use client";

import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ChevronDown,
  ClipboardList,
  ChevronUp,
  Bookmark,
  Ellipsis,
  Eye,
  Flame,
  Heart,
  ImageIcon,
  Link2,
  LoaderCircle,
  MapPin,
  Maximize2,
  MessageCircle,
  Send,
  Share2,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
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
import { createPortal, flushSync } from "react-dom";
import { loadReel, recordView, reloadReelHome } from "@/app/homes/actions";
import { CommentThread } from "@/components/comment-thread";
import { AspectChips, useReactions } from "@/components/like-pass";
import { useNotesMode } from "@/components/agent-notes";
import {
  CommentComposer,
  NameGate,
  useThread,
  type ReplyTarget,
  type SeenBy,
  type SpotRef,
  type ThreadActions,
} from "@/components/listing-thread";
import { usePhotoLikes } from "@/components/photo-likes";
import { SpotLayer, type PickedSpot } from "@/components/photo-spots";
import { photoFoot, photoHead, photoPlace, ReelPhotos, STAGE_BAND, stageBlock, stageFoot } from "@/components/reel-photos";
import { TakeCard, type TakeEyebrow } from "@/components/reel-take";
import { ScorecardBody } from "@/components/scorecard";
import { useSignedIn } from "@/components/session";
import { Sheet } from "@/components/sheet";
import { NudgeHint, useNudges, type Nudge } from "@/components/walkthrough";
import { Tour, tourSteps, useTour, type TourKind } from "@/components/tour";
import type { FeedPost } from "@/lib/feed";
import { cn, formatPrice } from "@/lib/format";
import { isSampleListing, type Listing, type ListingMedia } from "@/lib/listings/types";
import { FACTS, mediaKeyOf, photoTags, spotAt, spotName, tagPhrase, tagPosition, type SpotReaction } from "@/lib/photos";
import { placeIn, type HomeContext, type ReelContext } from "@/lib/reel-context";
import { NO_REACTION, type Aspect, type ReactionState, type Sentiment } from "@/lib/reactions";
import { homeDetails, type ScorecardViewer } from "@/lib/scorecard";
import { button, glass } from "@/lib/ui";

// The feed: one home per screen, scrolled up like a reel, for as long as you
// keep going. On a phone each home reads like a post: a head above the photo
// (the price, the size, the address; a tap opens the description and the
// details over the photo), the photo in a fixed four-by-three box under it,
// and under the photo the latest comments themselves, then the comment bar.
// The photo never jumps from home to home and nothing is written over it.
// Wide, side by side: the photo on a stage of its own, and the same words in
// a panel on the right, where the comments open too, so the photo is never
// covered.

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
// agent's link, or, on a home for sale, send it. An agent's Send ("send")
// makes a client's link there and then ("sending": between one send and the
// new link for the next); anyone else signed in goes on to the three steps
// for sending homes, with this one picked ("steps").
type ShareKind = "share" | "invite" | "send" | "sending" | "steps";

// What can rise over a home.
type SheetKind = "more" | "scorecard";

// The agent, in a sentence: their name, or "your agent" when the page
// doesn't know it (it says "Your agent" then).
const agentCalled = (agentName?: string) => (agentName && agentName !== "Your agent" ? agentName : "your agent");
const agentFirstName = (agentName?: string) =>
  agentName && agentName !== "Your agent" ? (agentName.split(" ")[0] ?? agentName) : "your agent";

// The arrows to the homes before and after, side by side: just the chevron,
// faint until pointed at, in the middle of the window.
const stageArrow =
  "absolute left-1/2 z-30 hidden h-8 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white split:flex";

// In the pop-out, wide: the homes before and after, in the gutter beside the
// stage, round and plain to see.
const gutterButton =
  "flex size-12 items-center justify-center rounded-full bg-white/10 text-white/85 ring-1 ring-white/15 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/10";

// The first of these that's showing: of two copies of a button (the rail's
// on a phone, the panel's side by side), the one on screen.
const visibleIn = (root: ParentNode | null | undefined, selector: string) =>
  [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])].find((el) => el.getClientRects().length > 0) ?? null;

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
  introLabel = "Welcome",
  end,
  endBackdrop,
  infinite = false,
  embedded = false,
  lean = false,
  contained = false,
  agentName,
  canInvite = true,
  alone = false,
  onProfile = false,
  focus,
  onActiveChange,
  loadMore,
  onOpen,
  onSend,
  sendBusy = false,
  initialPhoto,
  initialComment,
  onPhotoSeen,
  suggestedName,
  nameHint,
  tour,
  context,
  stageBar,
  porchcard = false,
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
  // What that first screen is, for a screen reader.
  introLabel?: string;
  // The last screen, after the homes.
  end?: ReactNode;
  // Behind the last screen, edge to edge (a link's wash of colour, as its first screen has).
  endBackdrop?: ReactNode;
  // Loads more homes as you near the end.
  infinite?: boolean;
  // One home inside a pop-out rather than filling the screen.
  embedded?: boolean;
  // Beside the map, wide: the room goes to the photo. No row of round
  // buttons: the comment bar says how many comments and opens them, with
  // Save and More beside it. (Sending it is the map page's own button.)
  lean?: boolean;
  // A whole feed of homes inside a pop-out: everything the full-screen feed
  // does (on to the next home, the keys, more as you go, the end), in its box.
  contained?: boolean;
  agentName?: string;
  // On an agent's link: whether its share button invites others onto it.
  canInvite?: boolean;
  // On an agent's link: the page knows nobody but you and the agent can read
  // what's said on it (so "only you" can be said).
  alone?: boolean;
  // On an agent's link: what they like, pass on and say about a home there
  // shows on their own profile too (unless they've switched that off), so the
  // link says so rather than "only you".
  onProfile?: boolean;
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
  // Called first thing in the tap, with nothing awaited before it. Side by
  // side, `panel` is the home's white panel, for what follows to rise over.
  // (Without it, anyone else signed in still has Send: on to Send homes.)
  onSend?: (home: SendHome, panel?: HTMLElement | null) => void;
  // Send's next link is on its way: the button waits, and says so.
  sendBusy?: boolean;
  // The photo (from 0) the home it opens on opens on: the first, or `focus`'s.
  initialPhoto?: number;
  // A comment to open the comments on, once the feed is at the home it opens
  // on (the first, or `focus`'s): a link to what someone said. Ignored unless
  // it's a comment on that home that's yours to see.
  initialComment?: string;
  // A photo has settled on screen.
  onPhotoSeen?: (listingKey: string, index: number) => void;
  // Fills in the name prompt (selected, to type over).
  suggestedName?: string;
  // One more line in the name prompt, just above the name.
  nameHint?: string;
  // A quick look at how it works, the first time (see tour.tsx).
  tour?: TourKind;
  // What these homes are (someone's highlights, your feed, a client's) and
  // the take on each: said on every home, which opens on its own photo.
  context?: ReelContext | null;
  // In the pop-out, wide: across the top of the photo's column, whose homes
  // these are and the way to the full page.
  stageBar?: ReactNode;
  // The Porchcard (what everyone thinks of a home) is an agent's, for seeing
  // what their clients make of it. Everyone else gets Save in its place.
  porchcard?: boolean;
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
  // "only you" is said only when the page knows nobody else can read it.
  const agent = agentCalled(agentName);
  // The agent on their own link: what they write is their note, for everyone on it.
  const notes = useNotesMode();
  const seenBy: SeenBy =
    mode === "public"
      ? { text: "Public, with your first name.", private: false }
      : notes
        ? { text: "Everyone on this link sees your feedback.", private: true }
        : onProfile
          ? {
              text: alone ? `Shown to ${agent} and on your profile.` : "Shown to everyone on this link and on your profile.",
              private: false,
            }
          : alone
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
        introLabel={introLabel}
        end={end}
        endBackdrop={endBackdrop}
        embedded={embedded}
        lean={lean}
        contained={contained}
        onOpen={onOpen}
        onSend={onSend}
        sendBusy={sendBusy}
        initialPhoto={initialPhoto}
        initialComment={initialComment}
        context={context}
        stageBar={stageBar}
        porchcard={porchcard}
        save={actions.save}
        onPhotoSeen={onPhotoSeen}
        agentName={agentName}
        canInvite={canInvite}
        alone={mode === "share" && alone}
        focus={focus}
        onActiveChange={onActiveChange}
        hasMore={hasMore}
        loading={loading}
        tour={tour}
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
  introLabel = "Welcome",
  end,
  endBackdrop,
  embedded,
  lean,
  contained,
  onOpen,
  onSend,
  sendBusy,
  initialPhoto,
  initialComment,
  context,
  stageBar,
  onPhotoSeen,
  agentName,
  canInvite,
  alone,
  focus,
  onActiveChange,
  hasMore,
  loading,
  onNearEnd,
  nameAnchorRef,
  tour,
  porchcard,
  save,
}: {
  posts: FeedPost[];
  porchcard: boolean;
  save?: ThreadActions["save"];
  mode: "public" | "share";
  myName: string | null;
  header?: ReactNode;
  intro?: ReactNode;
  // What that first screen is, for a screen reader.
  introLabel?: string;
  end?: ReactNode;
  // Behind the last screen, edge to edge (a link's wash of colour, as its first screen has).
  endBackdrop?: ReactNode;
  embedded: boolean;
  lean: boolean;
  contained: boolean;
  onOpen?: (listingKey: string) => void;
  onSend?: (home: SendHome, panel?: HTMLElement | null) => void;
  sendBusy: boolean;
  initialPhoto?: number;
  initialComment?: string;
  context?: ReelContext | null;
  stageBar?: ReactNode;
  onPhotoSeen?: (listingKey: string, index: number) => void;
  agentName?: string;
  canInvite: boolean;
  alone: boolean;
  focus?: { key: string; n: number } | null;
  onActiveChange?: (listingKey: string | null) => void;
  hasMore: boolean;
  loading: boolean;
  onNearEnd: () => void;
  // Set to where the name prompt should rise from (none: the window's foot).
  nameAnchorRef?: RefObject<HTMLElement | null>;
  tour?: TourKind;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // A sheet over the home: its Porchcard, or More. `photoFoot`: where the
  // photo ended when it opened, so the sheet rises to just there.
  const [sheet, setSheet] = useState<{
    kind: SheetKind;
    key: string;
    photoFoot?: number;
    // The Porchcard, opened at a part of it (the description's "more").
    section?: "about";
  } | null>(null);
  // Each sheet closes only itself: one can open another without the first's
  // closing shutting the second.
  const closeSheet = (...kinds: SheetKind[]) => setSheet((now) => (now && kinds.includes(now.kind) ? null : now));
  // The Porchcard, about this home.
  const about = (key: string) => sheet?.kind === "scorecard" && sheet.key === key;
  // A home's comments, unfurled where the latest of them are (under the
  // photo on a phone, growing up over it; in the panel beside it, wide): all
  // of them, or those about one spot in a photo; opened on one of them.
  const [thread, setThread] = useState<{ key: string; spot?: SpotRef; commentId?: string } | null>(null);
  // Side by side (wide): the Porchcard opens beside the photo, in the white
  // panel's place, and other sheets rise from the panel's foot. `narrow`: a
  // phone's layout (sheets rise to the photo's foot), whether or not wide
  // screens are side by side.
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
  // "Photo only", from More: nothing but the photo on this home,
  // until you move on to another.
  const [bare, setBare] = useState<number | null>(null);
  if (bare !== null && bare !== active) setBare(null);
  // A spot to go to, from a comment about it. `n` counts requests. From the
  // Porchcard by keyboard, the card takes it, and gives it `back` on closing.
  const [goToSpot, setGoToSpot] = useState<{
    key: string;
    spot: SpotRef;
    n: number;
    keyboard?: boolean;
    back?: HTMLElement | null;
    // Just its photo, no card (see `toSpot`).
    look?: boolean;
  } | null>(null);
  // To a spot from a comment about it, or from the take over the photo. For
  // someone who can't like or say anything yet: its photo, then signing up,
  // and only once they're in, its card (never a card to like or comment on
  // first). Not now: just the photo.
  const { canReact, ensureName } = useThread();
  const toSpot = (key: string, spot: SpotRef) => {
    const go = (look?: boolean) => setGoToSpot((current) => ({ key, spot, n: (current?.n ?? 0) + 1, look }));
    if (canReact) return go();
    go(true);
    void ensureName().then((joined) => joined && go());
  };
  const reactions = useReactions(Object.fromEntries(posts.map((post) => [post.listing.ListingKey, post.mine])));
  // Homes saved or taken back since the page arrived: at once, and put back
  // if it doesn't hold (signed out: on to signing in, and back here after).
  const [savedNow, setSavedNow] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const signedIn = useSignedIn();
  const saves = {
    now: savedNow,
    toggle: (key: string, to: boolean) => {
      if (!save) return;
      setSavedNow((now) => ({ ...now, [key]: to }));
      void save(key, to).then((result) => {
        if (result.ok) return;
        setSavedNow((now) => ({ ...now, [key]: !to }));
        if (/sign/i.test(result.error)) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }
      });
    },
  };
  const offset = intro ? 1 : 0;
  const panelCount = offset + posts.length + 1;
  const activePost = posts[active - offset];
  // The Porchcard beside the photo belongs to the home on screen: moving on
  // to another closes it.
  if (wide && sheet?.kind === "scorecard" && sheet.key !== (activePost?.listing.ListingKey ?? null)) {
    setSheet(null);
  }
  // The comments stay with the home they're about: seeing the photo alone
  // (held, or "Photo only") closes them, and so does moving on to another
  // home (below, once the move is known: a tap on a home still gliding into
  // view opens its comments, and they stay).
  if (thread && (bare !== null || clear !== null)) setThread(null);
  const activeKey = activePost?.listing.ListingKey ?? null;
  const [wasActive, setWasActive] = useState(activeKey);
  if (activeKey !== wasActive) {
    setWasActive(activeKey);
    if (thread && thread.key !== activeKey) setThread(null);
  }
  // What you've liked and not in each home's photos just now, as its photos
  // have it, for the Porchcard.
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

  const goTo = (index: number, instant = false, tries = 0) => {
    const root = scroller.current;
    if (!root) return;
    // Not laid out yet (a pop-out still opening, with no size): again on the
    // next frame, a few times, rather than staying on the first home.
    if (root.clientHeight === 0) {
      if (tries < 10) requestAnimationFrame(() => goTo(index, instant, tries + 1));
      return;
    }
    const target = Math.max(0, Math.min(panelCount - 1, index));
    root.scrollTo({ top: target * root.clientHeight, behavior: instant || reducedMotion() ? "auto" : "smooth" });
  };

  // A mouse's wheel, a notch at a time, never gets a whole screen past where
  // the feed snaps back to: left to the browser, a wheel can't reach the next
  // home at all (a trackpad's glide can). So once a turn of the wheel stops,
  // if the feed hasn't already gone most of the way there itself, it goes on
  // one screen the way the wheel turned. One screen for each turn, however
  // many notches. Not over something that scrolls on its own and still has
  // further to go (the words beside the photo), nor for a pinch or a sideways swipe.
  const wheelTo = useRef(goTo);
  useLayoutEffect(() => {
    wheelTo.current = goTo;
  });
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let turned = 0;
    let from = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scrollsOn = (target: Element, down: boolean) => {
      for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        const overflow = getComputedStyle(el).overflowY;
        if (overflow !== "auto" && overflow !== "scroll") continue;
        if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
      }
      return false;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || root.clientHeight === 0) return;
      if (event.target instanceof Element && scrollsOn(event.target, event.deltaY > 0)) return;
      if (turned === 0) from = Math.round(root.scrollTop / root.clientHeight);
      // (Counted in pixels, whether the wheel reports those or lines.)
      turned += event.deltaY * (event.deltaMode === 1 ? 32 : 1);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const way = Math.sign(turned);
        const far = Math.abs(turned);
        turned = 0;
        // (One slow notch of some mice is only a few pixels: that still counts.)
        if (far < 4) return;
        // Already most of the way to the next one (or past it): it gets there itself.
        if (way * (root.scrollTop / root.clientHeight - from) > 0.5) return;
        wheelTo.current(from + way);
      }, 140);
    };
    root.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      root.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, []);

  // Tell the page which home is showing.
  const report = useRef(onActiveChange);
  useLayoutEffect(() => {
    report.current = onActiveChange;
  });
  useEffect(() => {
    report.current?.(activeKey);
  }, [activeKey]);

  // The first time: a quick look at how it works, once the first home is on
  // screen with nothing open over it. The nudges below wait for it.
  const notes = useNotesMode();
  const tourNow = useTour(tour ?? null, !embedded && !sheet && Boolean(activePost) && !onOpen);
  const tourWith = activePost
    ? tourSteps(tour ?? "home", {
        agent: agentFirstName(agentName),
        notesFor: notes?.for,
        agentTake: activePost.timeline.some((item) => (item.kind === "comment" ? item.isAgent && !item.parentId : item.isAgent)),
      })
    : [];

  // On an agent's link, the first time: how to see more photos, then more homes.
  const nudges = useNudges({
    // (Not for the agent writing notes on their own link.)
    enabled: mode === "share" && !embedded && !sheet && tourNow.done && !notes,
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

  // In a pop-out, the keyboard starts on the homes themselves, so ↑ ↓ (and
  // J, K, ← →) work straight away. (After the pop-out has opened: its own
  // effect, which knows what opened it, runs first.)
  useEffect(() => {
    if (contained) scroller.current?.focus({ preventScroll: true });
  }, [contained]);

  // In the pop-out, wide: the gutter beside the stage, for the buttons to the
  // homes before and after (outside this box, which nothing in it can leave).
  const [gutter, setGutter] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!contained) return;
    setGutter(frame.current?.closest("dialog")?.querySelector<HTMLElement>("[data-stage-nav]") ?? null);
  }, [contained]);

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
      // In a pop-out, the pop-out it's in doesn't count as something open over it.
      const own = contained ? (scroller.current?.closest("dialog") ?? null) : null;
      const over = [...document.querySelectorAll("dialog[open]:modal")].some((dialog) => dialog !== own);
      if (target.closest("input, textarea, select, [contenteditable]") || (target.closest("dialog") ?? own) !== own || over) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const letters =
        Boolean(scroller.current?.contains(target)) && !target.closest("button, a, summary, [role=button], [role=link]");
      if (key === "ArrowDown" || key === "PageDown" || (key === "j" && letters)) goTo(active + 1);
      else if (key === "ArrowUp" || key === "PageUp" || (key === "k" && letters)) goTo(active - 1);
      // In the pop-out, ← and → turn the photos of the home on screen (not
      // while something that takes arrows of its own has the keyboard).
      else if (contained && (key === "ArrowLeft" || key === "ArrowRight")) {
        if (target.closest("[data-spot-card], [role=slider], [role=tablist], [role=radiogroup], [role=menu], [role=listbox]")) return;
        const home = scroller.current?.querySelector<HTMLElement>(`[data-panel="${active}"]`);
        const turn = home?.querySelector<HTMLButtonElement>(
          `button[aria-label="${key === "ArrowLeft" ? "Previous photo" : "Next photo"}"]`,
        );
        if (!turn || turn.disabled) return;
        turn.click();
      } else return;
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
    const same = visibleIn(home, `[data-follow="${follow}"]:not(:disabled)`);
    (same ?? visibleIn(home, "[data-follow]:not(:disabled), button:not(:disabled)"))?.focus({
      preventScroll: true,
    });
  }, [active]);

  // The name prompt rises where the words are: side by side, from the foot
  // of the white panel of the home on screen.
  useLayoutEffect(() => {
    if (nameAnchorRef) nameAnchorRef.current = wide && activeKey ? wordsOf(activeKey) : null;
  });

  // Beside the photo, the Porchcard takes the white panel's place, so Tab
  // finds it there too: from the buttons down the side into it, and out of
  // it on to whatever follows the panel (the panel itself is out of reach
  // under it).
  const dockedKey = wide && sheet?.kind === "scorecard" ? sheet.key : null;
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

  // The comments unfurl where the latest of them are: under the photo on a
  // phone (growing up over it, to just under the head), in the panel beside
  // it on a wide screen. From the comment bar, the cursor goes straight into
  // the comment box, in the same tap, so a phone opens its keyboard (it
  // won't for focus that arrives later). From a row of the latest comments,
  // about one comment: open on it, tinted for a moment so it's plain which.
  // About one spot in a photo: just those, and a box to add one.
  const openThread = (
    key: string,
    { compose = false, spot, commentId }: { compose?: boolean; spot?: SpotRef; commentId?: string } = {},
  ) => {
    flushSync(() => {
      // (The Porchcard gives way: the comments are in the panel it covers.)
      closeSheet("scorecard");
      setThread({ key, spot, commentId });
    });
    const home = frame.current?.querySelector<HTMLElement>(`[data-home="${CSS.escape(key)}"]`);
    if (!home) return;
    if (compose) home.querySelector<HTMLElement>("[data-composer]")?.focus({ preventScroll: true });
    const said = commentId ? home.querySelector<HTMLElement>(`[data-comment="${CSS.escape(commentId)}"]`) : null;
    if (said) {
      showIn(said, "center");
      said.dataset.flash = "";
      setTimeout(() => delete said.dataset.flash, 2000);
    } else if (!compose) {
      // At the top of the thread (wide, the panel scrolls up to it).
      const list = home.querySelector<HTMLElement>("[data-comment-list]");
      if (list) showIn(list, "start");
    }
  };

  // Opened on one comment (a link to what someone said): once the feed is at
  // the home it opens on, its comments open there, on that comment, if it's
  // on that home and this viewer may see it. Otherwise, nothing.
  const commentHome = focus?.key ?? posts[0]?.listing.ListingKey ?? null;
  const commentDone = useRef(false);
  useEffect(() => {
    if (!initialComment || commentDone.current || !activeKey || activeKey !== commentHome) return;
    commentDone.current = true;
    const post = posts.find((p) => p.listing.ListingKey === activeKey);
    if (!post?.timeline.some((item) => item.kind === "comment" && item.id === initialComment)) return;
    // (Once the frame it arrived in is drawn; a render meanwhile mustn't stop it.)
    requestAnimationFrame(() => openThread(activeKey, { commentId: initialComment }));
  });

  // The Porchcard: up from the bottom, to the photo's foot (wide, beside the
  // photo, in the white panel's place).
  const openScorecard = (key: string, section?: "about") => {
    const home = frame.current?.querySelector(`[data-home="${CSS.escape(key)}"]`);
    dock.current = wordsOf(key);
    flushSync(() =>
      setSheet({ kind: "scorecard", key, section, photoFoot: home ? photoFootIn(home, frame.current!) : undefined }),
    );
  };

  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const isForSale = (post: FeedPost) => post.listing.StandardStatus === "Active";
  // On a public page, a home for sale is sent by anyone signed in; signed
  // out, or once it's sold, there's only its page to share.
  const shareKind = (post: FeedPost): ShareKind | null =>
    mode === "share"
      ? canInvite
        ? "invite"
        : null
      : !isForSale(post)
        ? "share"
        : onSend
          ? sendBusy
            ? "sending"
            : "send"
          : signedIn
            ? "steps"
            : "share";

  // The link to this page (a home's public page, or the agent's link you're
  // on): handed to the phone's share sheet where there is one, or else copied.
  const shareLink = async (post: FeedPost) => {
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

  const share = (post: FeedPost) => {
    if (mode === "public" && isForSale(post)) {
      if (onSend) return onSend(sendHomeOf(post), wide ? wordsOf(post.listing.ListingKey) : null);
      // (Anyone else signed in: Send homes, which finds this one picked.)
      if (signedIn) return router.push(`/send?home=${encodeURIComponent(post.listing.ListingKey)}`);
    }
    return shareLink(post);
  };

  const sheetPost = sheet && posts.find((post) => post.listing.ListingKey === sheet.key);
  // You, as you are now on the home the sheet is about, for its Porchcard:
  // the same object until something of yours changes, so the Porchcard isn't
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
  // A home's own button on the rail (the Porchcard's, More's), for the
  // keyboard to go back to.
  const railButton = (key: string, which: "scorecard" | "more") =>
    visibleIn(frame.current, `[data-home="${CSS.escape(key)}"] [data-follow="${which}"]`);
  // The homes you've had your say on, as the Porchcard counts it: liked or
  // passed on, something in it liked or not, or a word about it.
  const reviewed = posts.filter((post) => {
    const key = post.listing.ListingKey;
    const photos = yours[key] ?? { liked: post.photoLikes.mine, disliked: post.photoLikes.mineDisliked };
    return (
      Boolean(reactions.states[key]?.reaction) ||
      photos.liked.length + photos.disliked.length > 0 ||
      post.timeline.some((item) => item.kind === "comment" && item.mine)
    );
  }).length;

  return (
    <div
      ref={frame}
      data-dark-ground
      className={cn(
        // Its size, not the window's, decides the layout of each home. What
        // runs past its edges (the comments sliding in) is cut off, and it
        // never scrolls sideways to show it.
        "overflow-clip bg-night text-white @container-size/reel",
        // Where the chrome over the top ends (`--chrome-foot`): each home's
        // head starts there, never beneath it. On a phone, under the header,
        // or under the one row that may sit below it (the way back, whose
        // homes these are), or under a pop-out's close button. Side by side,
        // the stage and the panel start a little further down (in a pop-out,
        // below its close button in the corner).
        header
          ? "[--chrome-top:4rem] [--chrome-foot:calc(60px+env(safe-area-inset-top))] has-[[data-reel-bar]]:[--chrome-foot:calc(104px+env(safe-area-inset-top))] [--stage-top:72px]"
          : cn(
              "[--chrome-top:0.75rem] [--stage-top:64px]",
              // Beside the map (`lean`) there's nothing over it; a pop-out
              // (the whole feed, or one home) has its close button.
              embedded && lean ? "[--chrome-foot:0.5rem]" : "[--chrome-foot:calc(3.75rem+env(safe-area-inset-top))]",
            ),
        embedded || contained ? "relative h-full w-full" : "fixed inset-0 z-30",
      )}
    >
      {mode === "public" && !embedded && !intro && <h1 className="sr-only">Homes for you</h1>}
      {/* Layers over the homes: the header z-30, a card about a spot or a fact
          z-40 (so it can always be closed), a toast z-50. Sheets open in the
          browser's top layer, over all of them. The header comes first in the
          page, as it reads and as Tab goes, though it floats over the homes. */}
      {tourNow.showing && activePost && (
        <Tour key={tour} root={() => frame.current} steps={tourWith} onDone={tourNow.finish} />
      )}
      {header && (
        // Out of the way while a photo is cleared to be seen whole. Side by
        // side, what the page adds to it can line up with the stage (`split:`).
        <div
          data-split={SPLIT_WIDE || undefined}
          // The page's skip link goes past it, to the homes just after.
          data-reel-header
          className={cn(
            "absolute inset-x-0 top-0 z-30 transition-[opacity,visibility] duration-300",
            (clear === active || bare === active) && "invisible opacity-0",
          )}
        >
          {header}
        </div>
      )}
      {stageBar && (
        // In the pop-out, wide: across the top of the photo's column, never
        // over the panel beside it. Out of the way while a photo is seen alone.
        <div
          data-split={SPLIT_WIDE || undefined}
          data-stage-bar
          className={cn(
            "absolute inset-x-0 top-0 z-30 hidden h-16 items-center gap-3 pl-16 pr-3 transition-[opacity,visibility] duration-300 split:flex split:right-[384px] split-xl:right-[424px]",
            (clear === active || bare === active) && "invisible opacity-0",
          )}
        >
          {stageBar}
        </div>
      )}
      {gutter &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Previous home"
              title="Previous home"
              disabled={active <= 0}
              onClick={() => goTo(active - 1)}
              className={gutterButton}
            >
              <ChevronUp aria-hidden size={24} />
            </button>
            <button
              type="button"
              aria-label="Next home"
              title="Next home"
              disabled={active >= panelCount - 1}
              onClick={() => goTo(active + 1)}
              className={gutterButton}
            >
              <ChevronDown aria-hidden size={24} />
            </button>
          </>,
          gutter,
        )}
      <div
        ref={scroller}
        data-reel
        // A click on it (anywhere but a button) gives it the keyboard, for J
        // and K; it's never a stop for Tab.
        tabIndex={-1}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {intro && (
          <section data-panel={0} aria-label={introLabel} className="relative h-full snap-start snap-always">
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
              agentName={agentName}
              // (On the home it opens on, the first or the one it goes to, the
              // photo asked for; on every home, the photo its take is about.)
              start={((focus ? key === focus.key : i === 0) ? initialPhoto : undefined) ?? context?.homes[key]?.photo ?? undefined}
              take={context?.homes[key]}
              host={context?.host}
              eyebrow={context ? { title: context.title, place: placeIn(context, key) } : null}
              // (The facts aren't things to tap any more: what was said
              // about one opens in the comments about it.)
              onGoToSpot={(spot) => (spot.mediaKey === FACTS ? openThread(key, { spot }) : toSpot(key, spot))}
              onPhotoSeen={onPhotoSeen}
              counter={mode === "share" && posts.length > 1 ? `Home ${i + 1} of ${posts.length}` : undefined}
              active={active === offset + i}
              wide={wide}
              near={Math.abs(active - (offset + i)) <= 1}
              // (In the pop-out, the gutter beside it has these.)
              onPrevious={!embedded && !contained && offset + i > 0 ? () => goTo(offset + i - 1) : undefined}
              onNext={embedded || contained ? undefined : () => goTo(offset + i + 1)}
              nudge={active === offset + i ? nudges.showing : null}
              onSwipe={active === offset + i ? nudges.onSwipe : undefined}
              state={state}
              base={reactions.base[key] ?? NO_REACTION}
              error={reactions.errors[key]}
              onLike={() => reactions.choose(key, "like")}
              // Passed with the X: on to the next home (or, after the last, the
              // end). Tapped again on a home already passed on, it's taken back.
              // (The agent, looking at their own link, sees the X as their
              // client will; it's the client's to tap.)
              onPass={
                notes
                  ? () => say(THEIRS_TO_TAP)
                  : async () => {
                      const was = state.reaction === "dislike";
                      if ((await reactions.choose(key, "dislike")) && !was) goTo(offset + i + 1);
                    }
              }
              onDoubleTapLike={() => reactions.like(key)}
              // (Wide, the panel's Comments button folds them away again.)
              onComments={() => (wide && thread?.key === key && !thread.spot ? setThread(null) : openThread(key))}
              onCompose={() => openThread(key, { compose: true })}
              onCommentSpot={(spot) => openThread(key, { compose: true, spot })}
              onCommentAt={(id) => openThread(key, { commentId: id })}
              onScorecard={porchcard ? (section) => openScorecard(key, section) : undefined}
              saved={saves.now[key] ?? Boolean(post.saved)}
              onSave={save ? () => saves.toggle(key, !(saves.now[key] ?? Boolean(post.saved))) : undefined}
              onYours={tellYours}
              // Over the words on a phone; in the white panel's place, wide.
              covered={!wide && about(key)}
              docked={wide && about(key)}
              thread={thread?.key === key ? thread : null}
              onCloseThread={() => setThread(null)}
              onAllComments={() => openThread(key)}
              // From a comment about a spot: to that photo, with the spot
              // open. (One about a fact, the price: the comments about it.)
              onShowSpot={(spot) => {
                if (spot.mediaKey === FACTS) return openThread(key, { spot });
                setThread(null);
                toSpot(key, spot);
              }}
              clear={clear === offset + i}
              onHoldPhoto={(holding) => setClear(holding ? offset + i : null)}
              bare={bare === offset + i}
              onShowEverything={() => setBare(null)}
              goToSpot={goToSpot?.key === key ? goToSpot : null}
              onOpen={onOpen && (() => onOpen(key))}
              lean={lean && !onOpen}
              onMore={() => {
                dock.current = wordsOf(key);
                setSheet({ kind: "more", key });
              }}
              shareAs={kind}
              onShare={kind ? () => share(post) : undefined}
              // (Not in a pop-out, which has just the one home.)
            />
          );
        })}
        <section
          data-panel={offset + posts.length}
          aria-label="The end"
          className="relative h-full snap-start snap-always overflow-hidden"
        >
          {/* What's behind it, if anything: the whole screen, staying put
              while what's on it scrolls over it. */}
          {endBackdrop}
          {/* (What scrolls, when it's taller than the screen.) */}
          <div className="relative flex h-full flex-col items-center overflow-y-auto px-6 py-24 text-center">
          {/* Centred when it fits; taller than the screen (a short phone), it
              starts under the header and scrolls, rather than running up
              out of reach behind it. */}
          <div className="my-auto flex w-full flex-col items-center">
            {hasMore || loading ? (
              <p role="status" className="text-white/80">
                Finding more homes…
              </p>
            ) : (
              <>
                {/* Each `relative`, to stay over a backdrop photo the end screen may have. */}
                {/* How far through a few homes you are (one home has nothing to count). */}
                {mode === "share" && posts.length > 1 && reviewed > 0 && (
                  <p className="relative mb-3 text-sm text-white/80">
                    {reviewed} of {posts.length} rated
                  </p>
                )}
                <EndHomes
                  value={{
                    homes: posts.map((post) => ({
                      key: post.listing.ListingKey,
                      address: post.listing.UnparsedAddress,
                      city: post.listing.City,
                      price: post.listing.ListPrice,
                      photo: post.listing.Media[0]?.MediaURL ?? null,
                      reaction: reactions.states[post.listing.ListingKey]?.reaction ?? null,
                    })),
                    choose: (key, sentiment) => (notes ? say(THEIRS_TO_TAP) : void reactions.choose(key, sentiment)),
                  }}
                >
                  {end}
                </EndHomes>
                {!embedded && posts.length > 0 && (
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
          </div>
          </div>
        </section>
      </div>

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

      <ScorecardSheet
        post={sheet?.kind === "scorecard" ? (sheetPost ?? null) : null}
        section={sheet?.kind === "scorecard" ? sheet.section : undefined}
        mode={mode}
        agentName={agentName}
        viewer={sheetViewer}
        alone={alone}
        myName={myName}
        anchor={wide ? dock : frame}
        docked={wide}
        // (Up to the photo's foot only in a phone's layout.)
        photoFoot={narrow ? sheet?.photoFoot : undefined}
        onClose={() => closeSheet("scorecard")}
        // From the Porchcard to the comments (they take its place), or to the box to add one.
        onAllComments={(key) => openThread(key)}
        onCompose={(key) => openThread(key, { compose: true })}
        // From the Porchcard: to the spot on its photo, with its card open
        // (beside the photo, the Porchcard stays, and the keyboard comes back
        // to the row after). Gone first otherwise, so the card can take the
        // keyboard (nothing behind a sheet can). A fact (the price) is just
        // words now: the comments about it.
        onScorecardSpot={(key, spot, keyboard) => {
          if (spot.mediaKey === FACTS) return openThread(key, { spot });
          const back = wide ? (document.activeElement as HTMLElement | null) : railButton(key, "scorecard");
          if (!wide) flushSync(() => setSheet(null));
          setGoToSpot((current) => ({ key, spot, n: (current?.n ?? 0) + 1, keyboard, back }));
        }}
      />
      <MoreSheet
        post={sheet?.kind === "more" ? (sheetPost ?? null) : null}
        state={sheetPost ? (reactions.states[sheetPost.listing.ListingKey] ?? NO_REACTION) : NO_REACTION}
        agentName={agentName}
        // On a public page, for everyone (an agent too, whose Send makes a
        // client's private link): the link to the home's public page.
        onShareLink={
          mode === "public" && sheetPost
            ? () => {
                // (Gone first, so "Link copied" isn't said behind it.)
                closeSheet("more");
                void shareLink(sheetPost);
              }
            : undefined
        }
        // On an agent's link, a phone's row under the photo has no room for
        // Invite: it's here.
        onInvite={
          !wide && sheetPost && shareKind(sheetPost) === "invite"
            ? () => {
                closeSheet("more");
                void shareLink(sheetPost);
              }
            : undefined
        }
        // Side by side, up from the foot of the white panel, like the comments.
        anchor={wide ? dock : frame}
        // Turned to from the Porchcard ("Change your take"), the keyboard
        // goes back to the Porchcard's button on the rail.
        returnTo={() => (sheetPost ? railButton(sheetPost.listing.ListingKey, "scorecard") : null)}
        onToggle={(aspect) => sheetPost && reactions.toggle(sheetPost.listing.ListingKey, aspect)}
        onPhotoOnly={() => {
          setSheet(null);
          if (sheetPost) setBare(offset + posts.indexOf(sheetPost));
        }}
        onClose={() => closeSheet("more")}
      />
    </div>
  );
}

// What an agent is told when they tap, on their own link, something that's their client's to answer.
const THEIRS_TO_TAP = "That's for your client to tap.";

// The feed's homes, for whatever is on its last screen: each with what the
// one looking made of it (liked, passed on, or nothing yet), and a way to say
// so from there.
export type EndHome = {
  key: string;
  address: string;
  city: string;
  price: number;
  photo: string | null;
  reaction: Sentiment | null;
};
type EndHomesValue = { homes: EndHome[]; choose: (key: string, sentiment: Sentiment) => void };
const EndHomesContext = createContext<EndHomesValue | null>(null);
const EndHomes = EndHomesContext.Provider;
export const useEndHomes = () => useContext(EndHomesContext);

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

// Brings something in the thread into view: the box the thread scrolls in
// moves, never the feed of homes (which snaps from one to the next).
function showIn(el: HTMLElement, block: "start" | "center") {
  const box = el.closest<HTMLElement>("[data-thread-scroll]");
  if (!box) return;
  const room = box.getBoundingClientRect();
  const at = el.getBoundingClientRect();
  const to = block === "center" ? at.top - room.top - (room.height - at.height) / 2 : at.top - room.top - 8;
  box.scrollTo({ top: box.scrollTop + to, behavior: reducedMotion() ? "auto" : "smooth" });
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
  agentName,
  start,
  onPhotoSeen,
  counter,
  active,
  wide,
  near,
  onPrevious,
  onNext,
  nudge,
  onSwipe,
  state,
  base,
  error,
  onLike,
  onPass,
  onDoubleTapLike,
  onComments,
  onCompose,
  onCommentSpot,
  onCommentAt,
  onScorecard,
  saved,
  onSave,
  onYours,
  covered,
  docked,
  thread,
  onCloseThread,
  onAllComments,
  onShowSpot,
  clear,
  onHoldPhoto,
  bare,
  onShowEverything,
  goToSpot,
  onOpen,
  lean,
  onMore,
  shareAs,
  onShare,
  take,
  host,
  eyebrow,
  onGoToSpot,
}: {
  index: number;
  post: FeedPost;
  mode: "public" | "share";
  agentName?: string;
  // The photo to open on.
  start?: number;
  onPhotoSeen?: (listingKey: string, index: number) => void;
  // "Home 1 of 3", on an agent's link with several.
  counter?: string;
  active: boolean;
  // The feed is wide enough to lay a home out side by side.
  wide: boolean;
  // Close enough to load its photos.
  // Side by side, the homes before and after: small arrows above and below.
  onPrevious?: () => void;
  onNext?: () => void;
  near: boolean;
  nudge: Nudge | null;
  // Moved on to another photo.
  onSwipe?: () => void;
  state: ReactionState;
  base: ReactionState;
  error?: string;
  onLike: () => void;
  // The X on the photo: pass on the home and go on to the next (taken back, it stays put).
  onPass: () => void;
  onDoubleTapLike: () => void;
  onComments: () => void;
  // The comment bar: comments open with the cursor in the box.
  onCompose: () => void;
  // Comment on a spot in a photo, in the sheet below (touchscreens).
  onCommentSpot: (spot: SpotRef) => void;
  // The comments, on one of them (from the latest under the photo, or the take).
  onCommentAt: (commentId: string) => void;
  // Its Porchcard (at "About this home", from the description's "more").
  // (None but for an agent: everyone else saves the home in its place.)
  onScorecard?: (section?: "about") => void;
  // Saved by you, and the way to save it (or take it back).
  saved: boolean;
  onSave?: () => void;
  // What you've liked and not in its photos and facts just now (likeIds).
  onYours?: (listingKey: string, liked: string[], disliked: string[]) => void;
  // Its Porchcard is open, over the photo: the words and buttons under it
  // step aside.
  covered: boolean;
  // Its Porchcard is open in the white panel's place (wide): what's under it
  // is out of reach.
  docked: boolean;
  // Its comments are unfurled (all of them, or those about one spot, whose
  // card then shows just where), opened on one of them.
  thread: { spot?: SpotRef; commentId?: string } | null;
  onCloseThread: () => void;
  // About one spot: back to all of them.
  onAllComments: () => void;
  // A comment about a spot: that photo, with the spot open.
  onShowSpot: (spot: SpotRef) => void;
  // Nothing over the photo, to see it whole.
  clear: boolean;
  onHoldPhoto: (holding: boolean) => void;
  // Just the photo, until "Show everything" or another home.
  bare: boolean;
  onShowEverything: () => void;
  // Go to this spot, from a comment about it (or the Porchcard).
  // (`look`: just its photo, no card: someone not signed up yet.)
  goToSpot: { spot: SpotRef; n: number; keyboard?: boolean; back?: HTMLElement | null; look?: boolean } | null;
  // Just a look (beside the map): a tap anywhere opens the home full screen.
  onOpen?: () => void;
  // Beside the map, wide: no row of round buttons (see ReelFeed's `lean`).
  lean: boolean;
  onMore: () => void;
  shareAs: ShareKind | null;
  onShare?: () => void;
  // Why it's here: whose take on it, what they picked out and said.
  take?: HomeContext;
  // An agent's own listings: their page id, so their words lead the comments.
  host?: string;
  // Whose homes these are, and which of them this is ("Maya's highlights · 2 of 7").
  eyebrow?: TakeEyebrow | null;
  // To a spot they picked out, from the take: its photo, with its card open.
  onGoToSpot?: (spot: SpotRef) => void;
}) {
  const { listing } = post;
  // Someone who can't like or say anything yet (signed out, or new on an
  // agent's link) is asked to sign up first, whatever they tap: the photo, a
  // spot, the comment bar. Nothing to like or comment on opens before that;
  // once they're in, what they tapped goes on.
  const { canReact, ensureName } = useThread();
  const signUpThen = (then: () => void) => {
    // (Back on what was tapped first, so what opens next gives the keyboard
    // back there when it closes, rather than to the sign-up sheet.)
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void ensureName().then((joined) => {
      if (!joined) return;
      from?.focus({ preventScroll: true });
      then();
    });
  };
  const [first] = useState(() => Math.max(0, Math.min(listing.Media.length - 1, start ?? 0)));
  const [photo, setPhoto] = useState(first);
  // The photo that has finished sliding into place: what's drawn over it
  // shows then, not while it's moving.
  const [settled, setSettled] = useState(first);
  // The spot whose card is open: on the photo on screen, or one of the facts.
  const [picked, setPicked] = useState<PickedSpot | null>(null);
  const current = listing.Media[photo];
  const threadOpen = Boolean(thread);
  if (picked && (!active || (picked.mediaKey !== FACTS && picked.mediaKey !== (current && mediaKeyOf(current))))) {
    setPicked(null);
  }
  // The comments unfurling puts any card away (about one spot, its card
  // stays, to show where); the thread and the Porchcard cover what's under
  // the photo and the band over it.
  const sheetOver = covered || threadOpen;
  const [wasOpen, setWasOpen] = useState(threadOpen);
  if (threadOpen !== wasOpen) {
    setWasOpen(threadOpen);
    if (threadOpen && !thread?.spot) setPicked(null);
  }
  // When the comments about a spot close (posted, or put away), so does its
  // card: what was said now shows on the photo.
  const cardOver = covered || Boolean(thread?.spot);
  const [wasCovered, setWasCovered] = useState(cardOver);
  if (cardOver !== wasCovered) {
    setWasCovered(cardOver);
    if (!cardOver) setPicked(null);
  }
  // To a spot from a comment about it: its photo, with its card open (just
  // the photo while someone not signed up yet is asked to). (One about a
  // fact never comes here: the page opens its comments instead.)
  const [show, setShow] = useState<{ index: number; n: number } | null>(null);
  const [went, setWent] = useState(0);
  if (goToSpot && goToSpot.n !== went) {
    setWent(goToSpot.n);
    const index = listing.Media.findIndex((m) => mediaKeyOf(m) === goToSpot.spot.mediaKey);
    const target = listing.Media[index];
    const at = target && tagPosition(target, goToSpot.spot.tag);
    // (The photo as a whole, liked: just the photo.)
    if (index >= 0) {
      setShow({ index, n: goToSpot.n });
      setPhoto(index);
      setSettled(index);
      if (at && !goToSpot.look) setPicked({ ...goToSpot.spot, ...at, keyboard: goToSpot.keyboard, back: goToSpot.back });
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
  // The whole description, rather than its first lines (side by side).
  const [more, setMore] = useState(false);
  // On a phone, what the home is, opened from the head over the photo: the
  // description whole, who listed it, every detail. Until another home, a tap
  // on the head again, Escape, or a tap anywhere else.
  const [about, setAbout] = useState(false);
  const aboutId = useId();
  const aboutBox = useRef<HTMLDivElement>(null);
  const headBox = useRef<HTMLDivElement>(null);
  const headButton = useRef<HTMLButtonElement>(null);
  // (Gone when the home is, when the photo's alone, under a sheet, or when
  // the layout goes side by side, where the words are in the panel instead.)
  if (about && (!active || bare || sheetOver || (SPLIT_WIDE && !onOpen && wide))) setAbout(false);
  useEffect(() => {
    if (!about) return;
    // Escape closes just this: heard first, before the page (an ordered reel
    // going back, a pop-out closing) can take the key. A key pressed inside a
    // dialog open over it is that dialog's.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if ((event.target as Element | null)?.closest?.("dialog[open]")) return;
      event.preventDefault();
      event.stopPropagation();
      setAbout(false);
      headButton.current?.focus({ preventScroll: true });
    };
    const onDown = (event: PointerEvent) => {
      const at = event.target as Node;
      if (aboutBox.current?.contains(at) || headBox.current?.contains(at)) return;
      setAbout(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [about]);
  const home = useRef<HTMLElement>(null);
  // The block under the photo: the latest comments and the comment bar, or
  // (unfurled) the whole thread and the comment box; the panel, wide.
  const words = useRef<HTMLDivElement>(null);
  // The comment the box answers, while the thread is open.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Folding the comments away: the keyboard goes back to the Comments button
  // when it was in them (from out on the photo, it stays where it is).
  const closeThread = (giveBack = true) => {
    const now = document.activeElement;
    const inside = now instanceof HTMLElement && Boolean(words.current?.contains(now)) && !now.closest("[data-actions]");
    flushSync(() => {
      setReplyTo(null);
      onCloseThread();
    });
    if (!giveBack || !(inside || !now || now === document.body || !now.isConnected)) return;
    visibleIn(home.current, 'button[aria-label^="Comments"]')?.focus({ preventScroll: true });
  };
  const closeThreadNow = useRef(closeThread);
  useLayoutEffect(() => {
    closeThreadNow.current = closeThread;
  });
  useEffect(() => {
    if (!threadOpen) return;
    // Escape folds the comments away: heard first, before the page (an
    // ordered reel going back, a pop-out closing) can take the key. A spot's
    // card over them, or a dialog, takes its own Escape.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if ((event.target as Element | null)?.closest?.("dialog[open], [data-spot-card]")) return;
      event.preventDefault();
      event.stopPropagation();
      closeThreadNow.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [threadOpen]);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const el = home.current;
    if (!el) return;
    const measure = () => setShort(el.clientHeight > 0 && el.clientHeight < 520);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // On a phone on its side the buttons reach up over the photo: where they
  // start, so the photo's arrows stay above them. (Upright they're in a row
  // under the words, and side by side in the panel: the rail isn't drawn
  // then, and a rail that isn't drawn measures as nothing at the very top,
  // which would put the arrows off the photo, so then there's no limit.)
  const [railTop, setRailTop] = useState<number | null>(null);
  const sideBySide = SPLIT_WIDE && !onOpen && wide;
  useLayoutEffect(() => {
    const el = home.current;
    const rail = el?.querySelector<HTMLElement>("[data-rail]");
    if (!el || !rail || sideBySide) return setRailTop(null);
    // (Turning the phone shows or hides it: the home's size changes then, so
    // it's measured again.)
    const measure = () =>
      setRailTop(
        rail.getClientRects().length === 0
          ? null
          : Math.round(rail.getBoundingClientRect().top - el.getBoundingClientRect().top),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [sideBySide]);
  // On a phone, with the comments open over the photo, the comment box at
  // their foot stays above the keyboard: a phone doesn't shrink the window
  // for it, so the block's foot is lifted by however much of the window the
  // keyboard (and a toolbar over the page's foot) covers.
  useEffect(() => {
    const el = words.current;
    const view = window.visualViewport;
    if (!threadOpen || sideBySide || !el || !view) return;
    const place = () => {
      const lift = Math.max(0, Math.round(window.innerHeight - (view.offsetTop + view.height)));
      el.style.bottom = lift > 0 ? `${lift}px` : "";
    };
    place();
    view.addEventListener("resize", place);
    view.addEventListener("scroll", place);
    return () => {
      view.removeEventListener("resize", place);
      view.removeEventListener("scroll", place);
      el.style.bottom = "";
    };
  }, [threadOpen, sideBySide]);
  // "Photo only" puts away any card, and a tap on the photo then is
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
      // (The rail's on a phone; side by side, the one in the panel's row.)
      const more = visibleIn(moreButton.current?.closest("article"), '[data-follow="more"]') ?? moreButton.current;
      more?.focus({ preventScroll: true });
      if (document.activeElement !== more && ++tries < 30) frame = requestAnimationFrame(focusMore);
    };
    focusMore();
    return () => cancelAnimationFrame(frame);
  }, [bare]);
  // Photos load as a home comes close, and stay once loaded.
  const [loaded, setLoaded] = useState(near);
  // Side by side, where the block of photos and panel sits on the stage.
  const block = useMemo(() => stageBlock(listing.Media), [listing.Media]);
  if (near && !loaded) setLoaded(true);
  const photos = usePhotoLikes(listing.ListingKey, post.photoLikes);
  // The Porchcard (outside the home) counts what you've just done here.
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
  // Nothing over the photo: held, or "Photo only".
  const hidden = clear || bare;
  const agentFirst = agentFirstName(agentName);
  const notes = useNotesMode();
  // Side by side on a wide screen (never beside the map, just a look there).
  const split = SPLIT_WIDE && !onOpen;
  // Likes on things in a photo, for the strip of photos.
  const likesIn = (shown: ListingMedia) =>
    photos.likedTags(shown).reduce((sum, tag) => sum + photos.count(shown, tag), 0);

  // A card opened from the Porchcard, closed: the keyboard goes back there:
  // its row, or (the sheet gone) its button on the rail, as soon as that's
  // back in view.
  const lastPicked = useRef(picked);
  useLayoutEffect(() => {
    const was = lastPicked.current;
    lastPicked.current = picked;
    if (!was?.back || picked || !active) return;
    let frame = 0;
    let tries = 0;
    const giveBack = () => {
      const now = document.activeElement;
      if (now && now !== document.body) return;
      if (!was.back?.isConnected) return;
      was.back.focus({ preventScroll: true });
      if (document.activeElement !== was.back && ++tries < 30) frame = requestAnimationFrame(giveBack);
    };
    giveBack();
    return () => cancelAnimationFrame(frame);
  }, [picked, active]);

  const likeIt = (shown: ListingMedia) => {
    onDoubleTapLike();
    const subject = photoTags(shown)[0];
    if (subject && photos.enabled && !photos.isLiked(shown, subject)) photos.set(shown, subject, "like");
  };
  // (Not signed up: once, after signing up, rather than asking twice. Never
  // back through here: this render's `canReact` is still false then, and it
  // would ask again, forever, as joining now answers at once.)
  const likeWhatsShown = (shown: ListingMedia) => (canReact ? likeIt(shown) : signUpThen(() => likeIt(shown)));

  // A spot on the photo picked (a tap, or the keyboard): its card, to like it
  // or say something. Not signed up yet: signing up first, then the card.
  const pick = (spot: PickedSpot | null) => {
    if (spot && !canReact) return signUpThen(() => setPicked(spot));
    setPicked(spot);
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
    if (!canReact) return pick(spot);
    setPicked((now) => (now?.tag === spot.tag && now.mediaKey === spot.mediaKey ? null : spot));
  };
  // The comment bar: the comments, the cursor in the box (signed up first).
  const compose = () => (canReact ? onCompose() : signUpThen(onCompose));
  // Save too: signing up first, in place, then saved (rather than off to
  // sign in, and back with nothing saved).
  const saveIt = onSave && (() => (canReact ? onSave() : signUpThen(onSave)));

  // Yes or no to the home itself, in a tap: an X at the photo's bottom left
  // (pass, and on to the next home), a heart at its bottom right (like: the
  // one heart a home has; held, or under a pointer, it lists what's in the
  // photo to like). Small and see-through, in the corners, so the photo stays
  // the photo. There from the start, before the photos themselves load, so a
  // home further down has them too. Not on a phone on its side, where the
  // words sit over the photo's foot: there, both are on the rail instead. An
  // agent on their own link sees both, as their client will; the X there is
  // the client's to tap, and says so.
  const yesNo = !hidden && !bare && !onOpen && (
    <>
      <button
        type="button"
        data-keep-clear
        aria-label="Pass on this home"
        aria-pressed={state.reaction === "dislike"}
        onClick={onPass}
        style={{ top: `calc(${photoFoot(current)} - 0.75rem)`, left: `calc(${photoPlace(current).left} + 0.75rem)` }}
        className={cn(
          "absolute z-10 flex size-12 -translate-y-full items-center justify-center rounded-full ring-1 ring-white/25 backdrop-blur-md transition-colors short:hidden",
          state.reaction === "dislike" ? "bg-amber-600 text-white" : "bg-black/45 text-white hover:bg-black/65",
        )}
      >
        <X aria-hidden size={24} strokeWidth={2.5} />
      </button>
      <LikeWithList
        things={things}
        corner
        style={{
          top: `calc(${photoFoot(current)} - 0.75rem)`,
          left: `calc(${photoPlace(current).left} + ${photoPlace(current).width} - 0.75rem)`,
        }}
        className="absolute z-10 -translate-x-full -translate-y-full short:hidden"
      >
        <button
          type="button"
          data-keep-clear
          aria-label={`Like ${listing.UnparsedAddress}${likes ? `, ${likes} ${likes === 1 ? "like" : "likes"}` : ""}`}
          aria-pressed={liked}
          data-tour="heart"
          onClick={onLike}
          className={cn(
            "flex size-12 items-center justify-center rounded-full ring-1 ring-white/25 backdrop-blur-md transition-colors",
            liked ? "bg-rose-600 text-white" : "bg-black/45 text-white hover:bg-black/65",
          )}
        >
          <Heart aria-hidden size={24} strokeWidth={2.5} className={liked ? "fill-white" : undefined} />
        </button>
      </LikeWithList>
    </>
  );

  // Sending it on, in a tap, from the photo's top left corner, wherever a
  // home is shown: to a client (an agent), on to Send homes with it picked
  // (anyone else signed in), or its link (anyone else, or a home that's sold).
  // On a wide screen it says so; on a phone it's the paper plane alone.
  // (Beside the map, the page has its own; on a client's link, Invite is on
  // the rail.)
  const sendCorner = !hidden && !bare && !onOpen && !lean && onShare && shareAs && shareAs !== "invite" && (
    <button
      type="button"
      data-keep-clear
      data-send-corner
      aria-label={
        shareAs === "share"
          ? `Share ${listing.UnparsedAddress}`
          : shareAs === "sending"
            ? "Send this home, getting a new link…"
            : `Send ${listing.UnparsedAddress}`
      }
      aria-disabled={shareAs === "sending" || undefined}
      onClick={() => {
        if (shareAs !== "sending") onShare();
      }}
      style={{ top: `calc(${photoHead(current)} + 0.75rem)`, left: `calc(${photoPlace(current).left} + 0.75rem)` }}
      className={cn(
        "absolute z-10 flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-white px-3.5 font-semibold text-ink shadow-lg ring-1 ring-stone-200 hover:bg-stone-50 split:px-5",
        shareAs === "sending" && "cursor-progress text-muted",
      )}
    >
      {shareAs === "sending" ? (
        <LoaderCircle aria-hidden size={19} className="animate-spin motion-reduce:animate-none" />
      ) : shareAs === "share" ? (
        <Share2 aria-hidden size={19} />
      ) : (
        <Send aria-hidden size={19} />
      )}
      <span aria-hidden className="hidden split:inline">
        {shareAs === "share" ? "Share this home" : "Send this home"}
      </span>
    </button>
  );

  // On a phone, why it's here, in a band over the photo's top left corner
  // (under the head), one line until it's tapped open. (Side by side, it's
  // in the panel.)
  const band = !onOpen && Boolean(take || eyebrow);
  // The head above the photo: on a phone, upright, with the photo showing.
  // (Side by side the panel has the same words; on a phone on its side
  // they're over the photo's foot.) What it opens, over the photo: not
  // beside the map, where a tap on anything opens the home itself.
  const headShown = !bare && !sideBySide && !short;
  const aboutShown = !bare && !sideBySide && !onOpen;
  const listedBy = listedByOf(listing);
  // From the latest comments under the photo: the comments, on that one.
  // (Beside the map, just a look: a tap opens the home.)
  const openComment = onOpen ? () => onOpen() : (id?: string) => (id ? onCommentAt(id) : onComments());
  // About one spot: what it's called ("the front door").
  const spotCalled = thread?.spot ? spotName(listing, thread.spot) : null;
  // The comments themselves, folded or unfurled, the same on a phone and in the panel.
  const threadProps = {
    post,
    mode,
    host,
    likes,
    mineLiked: liked || photos.hasAny,
    open: threadOpen,
    spot: thread?.spot,
    opened: thread?.commentId,
    canShare: mode === "share" && liked,
    onOpen: openComment,
    onClose: () => closeThread(),
    onAllComments,
    onGoToSpot: onShowSpot,
    // Reply points the box at that comment, the cursor in it in the same
    // tap, so a phone shows its keyboard.
    onReply: (target: ReplyTarget) => {
      setReplyTo(target);
      words.current?.querySelector<HTMLElement>("[data-composer]")?.focus({ preventScroll: true });
    },
  };

  return (
    <article
      ref={home}
      data-panel={index}
      data-home={listing.ListingKey}
      aria-label={listing.UnparsedAddress}
      // Where the photo goes. On a phone: under the head (4rem under the
      // chrome's foot), as wide as the screen, in a space four wide by three
      // tall with nothing on it, never taller than leaves room for the
      // comment bar under it; a blurred copy of it fills what a wider photo
      // leaves of that space. Under it the latest comments, then the bar. A
      // phone on its side: the full-screen photo with the words over it. The
      // photo alone, on a phone: whole and centred in the whole screen, its
      // blurred copy all round it. Side by side, wide: whole, at the top of
      // a stage on the left (level with the panel), the strip of photos
      // under it (when there are several), clear of the panel down the
      // right; held, it stays put; alone, it grows to the whole window,
      // centred. (With SPLIT_WIDE off, wide is the full-screen photo with
      // the words over it, centred.)
      data-split={split || undefined}
      className={cn(
        "relative h-full snap-start snap-always overflow-hidden bg-night",
        "[--photo-fit:1] [--backdrop-shade:0.4] [--words-pad:calc(12px+env(safe-area-inset-bottom))]",
        // (The photo's label steps down, clear of Send in its corner, or of
        // the band saying why the home is here.)
        sendCorner ? "[--photo-label-drop:3.5rem]" : band && "[--photo-label-drop:3.5rem] split:[--photo-label-drop:0px]",
        // Beside the map on a phone, its Map button floats at the bottom.
        onOpen && "max-lg:[--words-pad:6rem]",
        bare
          ? "[--backdrop-bottom:0px] [--backdrop-top:0px] [--photo-align:0.5] [--photo-bottom:env(safe-area-inset-bottom)] [--photo-top:env(safe-area-inset-top)]"
          : cn(
              // The head right under the chrome, the photo's space right
              // under the head, and the words at least tall enough for the
              // comment bar (and, beside the map, the Map button) under it.
              "[--head-top:var(--chrome-foot)] [--photo-top:calc(var(--head-top)+4rem)] [--photo-align:0]",
              "[--words-min:max(5.5rem,calc(3.5rem+var(--words-pad)))]",
              "[--stage-height:min(75cqw,calc(100cqh-var(--photo-top)-var(--words-min)-env(safe-area-inset-bottom)))]",
              "[--photo-bottom:calc(100cqh-var(--photo-top)-var(--stage-height))]",
              "[--backdrop-top:var(--photo-top)] [--backdrop-bottom:var(--photo-bottom)]",
              // On its side there's no head: the photo starts at the chrome's
              // foot and runs on under the words.
              "short:[--photo-top:var(--chrome-foot)] short:[--photo-bottom:0px]",
            ),
        "short:[--backdrop-bottom:0px] short:[--backdrop-shade:0] short:[--backdrop-top:0px] short:[--photo-fit:0]",
        legacy(
          "@5xl:[--backdrop-bottom:0px] @5xl:[--backdrop-shade:0] @5xl:[--backdrop-top:0px] @5xl:[--photo-align:0.5] @5xl:[--photo-fit:0] @5xl:[--photo-top:calc(var(--chrome-top,4rem)+0.5rem)]",
        ),
        "split:[--photo-fit:1] split:[--photo-left:24px]",
        bare
          ? "split:[--photo-align:0.5] split:[--photo-bottom:24px] split:[--photo-right:24px] split:[--photo-top:24px]"
          : cn(
              // The photos at the top of a block centred between the header
              // and the window's foot, with the strip under them (stageBlock).
              "split:[--photo-align:0] split:[--photo-right:400px] split:[--photo-top:var(--block-top)] split:[--photo-bottom:var(--block-bottom)] split-xl:[--photo-right:440px]",
            ),
      )}
      style={
        {
          ...(railTop !== null && { "--rail-top": `${railTop}px` }),
          "--block-top": block.top,
          "--block-bottom": block.bottom,
          // (Inside a photo's own slide, which is just the stage; a photo
          // alone, at the whole window, is placed the same either way.)
          "--stage-photo-top": bare ? "24px" : block.stageTop,
          "--stage-photo-bottom": bare ? "24px" : block.stageBottom,
        } as CSSProperties
      }
    >
      {!loaded && yesNo}
      {loaded && (
        <ReelPhotos
          media={listing.Media}
          address={listing.UnparsedAddress}
          active={active}
          priority={index <= 1}
          start={first}
          counter={counter}
          likesOf={likesIn}
          beside={split && !bare}
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
              {yesNo}
              {sendCorner}
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
                  className={cn(glass, "absolute z-10 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-body font-semibold hover:bg-black/75")}
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
          a panel, and on a phone on its side they carry their own shade
          (below), under the header's own. */}
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

      {/* The head, the words and the buttons. Only their links and buttons
          take a touch: a swipe that starts on the words, where a thumb
          usually is, turns the photos, and a tap there clears them off the
          photo. All of it steps aside while the photo is held. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          hidden && "invisible opacity-0",
        )}
      >
        {/* Above the photo, on the dark ground, the way a post is headed:
            the price, the size and the address, always the same height
            (4rem), and one tap from the rest of what the home is. The
            button is the whole row; it says what it opens. */}
        {headShown && (
          <div
            ref={headBox}
            data-home-head
            data-keep-clear
            className="absolute inset-x-0 top-(--head-top) z-20 h-16 short:hidden split:hidden"
          >
            <div className="flex h-16 items-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(3.5rem,calc(2.75rem+env(safe-area-inset-right)))]">
              <Facts listing={listing} trending={post.buzz.trending} />
            </div>
            <button
              ref={headButton}
              type="button"
              aria-expanded={onOpen ? undefined : about}
              aria-controls={onOpen ? undefined : aboutId}
              aria-label="About this home"
              // (A card open on the photo goes away, as it does for a tap anywhere else.)
              onClick={onOpen ? () => onOpen() : () => { setPicked(null); setAbout(!about); }}
              className="absolute inset-0 flex items-center justify-end pr-[max(1rem,env(safe-area-inset-right))] transition-colors hover:bg-white/[0.04]"
            >
              <ChevronDown
                aria-hidden
                size={22}
                className={cn("text-white/70 transition-transform motion-reduce:transition-none", about && "rotate-180")}
              />
            </button>
          </div>
        )}
        {/* What the home is, opened from the head, over the photo (which
            stays put under it): the description whole, who listed it, the
            details. Always in the page, so the home reads whole to a search
            or a screen reader going through it; shown only when opened. */}
        {aboutShown && (
          <div
            ref={aboutBox}
            id={aboutId}
            role="region"
            aria-label="About this home"
            data-keep-clear
            hidden={!about}
            className={cn(
              "pointer-events-auto absolute inset-x-0 z-[35] max-h-[60cqh] overflow-y-auto overscroll-contain rounded-b-2xl bg-night/95 px-4 pb-4 pt-2 text-white shadow-[0_16px_40px_rgb(0_0_0/0.45)] backdrop-blur-md",
              "animate-[nudge-in_200ms_ease-out_both] motion-reduce:animate-none",
              // Under the head; on a phone on its side (no head), under the chrome.
              "top-[calc(var(--head-top)+4rem)] short:top-(--head-top)",
            )}
          >
            <About listing={listing} greeting={post.greeting} note={post.note} agentName={agentName} mode={mode} listedBy={listedBy} />
          </div>
        )}

        {/* The buttons down the right (a phone on its side) are under the
            comments while they're open, so they step aside. */}
        <div
          className={cn(
            "relative mx-auto h-full max-w-5xl transition-[opacity,visibility] duration-300 split:max-w-none",
            (covered || threadOpen) && "invisible opacity-0",
          )}
        >
          {!onOpen && (
            // Only on a phone on its side, down the right, over the photo.
            // Upright, the comment bar's row has what's needed (the rest is
            // in More and on the photo); side by side, a row in the panel
            // (PanelActions).
            <Rail
              address={listing.UnparsedAddress}
              things={things}
              liked={liked}
              likes={likes}
              comments={comments}
              shareAs={shareAs}
              onLike={onLike}
              passed={state.reaction === "dislike"}
              onPass={onPass}
              onComments={onComments}
              onScorecard={onScorecard && (() => onScorecard())}
              saved={saved}
              onSave={saveIt}
              onShare={onShare}
              onMore={onMore}
            />
          )}
        </div>

        {/* Under the photo, on the dark ground: the latest comments
            themselves, then the comment bar at the foot, the same on every
            home. On a phone on its side: the facts and a line of the
            description over the photo's foot, then the bar. Side by side,
            the panel beside the photo: why it's here, the facts, the
            description (two lines, or all of it with who listed it and the
            details), the latest comments, and at its foot the row of things
            to do and the comment bar; the comments open in its place. Beside
            the map, a phone's, with "Open full screen" for the bar. */}
        <div
          ref={words}
          data-words
          inert={docked || undefined}
          // Unfurled, the block is the comments: a landmark of its own.
          role={threadOpen ? "region" : undefined}
          aria-label={threadOpen ? "Comments" : undefined}
          // Side by side, it ends level with the photos beside it, the strip
          // under them included: never so short there's no room to read,
          // never past the window's foot.
          style={
            {
              "--panel-height": `min(max(${stageFoot(listing.Media)} - var(--photo-top), 30rem), 100cqh - var(--photo-top) - ${STAGE_BAND})`,
            } as CSSProperties
          }
          className={cn(
            "absolute inset-x-0 bottom-0 flex flex-col bg-night transition-[opacity,visibility] duration-300",
            threadOpen && !sideBySide
              ? // Unfurled on a phone: up over the photo, to just under the
                // head (on its side, to the chrome), everything in it to be
                // tapped and scrolled.
                "pointer-events-auto top-[calc(var(--head-top)+4rem)] z-30 short:top-(--head-top)"
              : cn(
                  "top-[calc(var(--photo-top)+var(--stage-height))]",
                  // On its side: over the photo, on a shade of their own that
                  // starts a little above the first line, so every line of it reads
                  // on the brightest photo.
                  "short:top-auto short:h-auto short:bg-transparent short:bg-linear-to-t short:from-black/80 short:to-black/65",
                  "short:before:pointer-events-none short:before:absolute short:before:inset-x-0 short:before:bottom-full short:before:h-12 short:before:bg-linear-to-t short:before:from-black/65 short:before:to-transparent",
                ),
            legacy("@5xl:h-auto @5xl:items-center @5xl:bg-transparent @5xl:px-6"),
            // Side by side: on the same dark as the photo's stage (a shade
            // lighter, to hold together), so the photo and what it is read as one.
            "split:pointer-events-auto split:bottom-auto split:left-auto split:right-6 split:top-(--photo-top) split:h-(--panel-height) split:w-[360px] split:overflow-hidden split:rounded-2xl split:bg-white/[0.04] split:bg-none split:ring-1 split:ring-inset split:ring-white/[0.08] split:before:hidden split-xl:w-[400px]",
            covered && "invisible opacity-0",
          )}
        >
          {short && !sideBySide && !threadOpen && (
            <div
              data-keep-clear
              className={cn(
                // Clear of a notch or rounded corner, on a phone on its side.
                "relative w-full pl-[max(1rem,env(safe-area-inset-left))] [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]",
                // Clear of the buttons down the right (two columns of them).
                "pr-[max(1rem,env(safe-area-inset-right))]",
                !onOpen && "short:pr-[calc(140px+env(safe-area-inset-right))]",
              )}
            >
              <Facts listing={listing} trending={post.buzz.trending} look="lines" />
              <Caption
                listing={listing}
                greeting={post.greeting}
                note={post.note}
                open={false}
                // "more" opens what the home is, over the photo.
                expanded={about}
                controls={aboutId}
                onToggle={onOpen ? undefined : () => { setPicked(null); setAbout(!about); }}
              />
              {error && (
                <p
                  role="alert"
                  className="absolute bottom-full left-[max(1rem,env(safe-area-inset-left))] z-30 mb-2 rounded-full bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white [text-shadow:none]"
                >
                  {error}
                </p>
              )}
            </div>
          )}
          {sideBySide && (
            <div
              data-keep-clear
              data-thread-scroll
              className={cn(
                "relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3",
                // What runs on below fades out, so it reads as more to scroll to.
                "[mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]",
              )}
            >
              {/* Why it's here, above the price. */}
              <TakeCard
                look="panel"
                home={take}
                onSpot={(spot) => onGoToSpot?.(spot)}
                onComment={onCommentAt}
                onAll={onComments}
              />
              <Facts listing={listing} trending={post.buzz.trending} />
              <Caption
                listing={listing}
                greeting={post.greeting}
                note={post.note}
                open={more}
                // (Even a short description has who listed it and the details to open.)
                always={Boolean(listedBy) || homeDetails(listing).length > 0}
                // "more" opens it right here, in the panel.
                onToggle={() => setMore(!more)}
              />
              {/* Opened: the panel is the home's own page, with who listed it and the details. */}
              {more && (
                <>
                  {listedBy && <p className="text-meta leading-5 text-white/70">{listedBy}</p>}
                  <HomeDetails listing={listing} />
                </>
              )}
              {/* The latest comments, or (unfurled) all of them, right here in the panel. */}
              <CommentThread {...threadProps} look="panel" className="mt-3" />
              {error && (
                <p role="alert" className="mt-3 w-fit rounded-full bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">
                  {error}
                </p>
              )}
            </div>
          )}
          {!sideBySide && threadOpen && (
            // Unfurled on a phone: a header with the way back, the thread
            // scrolling under it, and the comment box at the foot (below).
            <CommentThread {...threadProps} look="cover" />
          )}
          {!short && !sideBySide && !threadOpen && (
            <div className="relative min-h-0 flex-1">
              {error && (
                <p
                  role="alert"
                  className="absolute left-[max(1rem,env(safe-area-inset-left))] top-2 z-30 rounded-full bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  {error}
                </p>
              )}
              <CommentThread
                {...threadProps}
                look="cover"
                className="h-full overflow-hidden pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-1"
              />
            </div>
          )}
          <div
            className={cn(
              "w-full pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
              // At the foot, under the comments (far enough under them that
              // the last is a fingertip to tap, clear of the row's buttons),
              // and clear of a phone's home bar.
              "mt-auto pb-(--words-pad) pt-2.5 short:mt-2 short:pt-0",
              legacy("@5xl:max-w-xl @5xl:px-0"),
              "split:mt-0 split:border-t split:border-white/[0.08] split:p-3",
            )}
          >
            {!onOpen && (
              <PanelActions
                address={listing.UnparsedAddress}
                comments={comments}
                shareAs={shareAs}
                onComments={onComments}
                onScorecard={onScorecard && (() => onScorecard())}
                saved={saved}
                onSave={saveIt}
                onShare={onShare}
                onMore={onMore}
              />
            )}
            {onOpen ? (
              <button
                type="button"
                data-keep-clear
                onClick={onOpen}
                // (Wide, the search page has it as a button in the photo's
                // corner: this one is only for a phone.)
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-body font-semibold text-ink shadow-lg transition-colors hover:bg-white/90 lg:hidden"
              >
                <Maximize2 aria-hidden size={17} />
                Open full screen
                <span className="sr-only">: {listing.UnparsedAddress}</span>
              </button>
            ) : threadOpen || sideBySide ? (
              // The comment box itself: with the thread open over the photo,
              // and always in the panel, where there's room for it.
              <div data-keep-clear className="pointer-events-auto">
                {error && threadOpen && (
                  <p role="alert" className="mb-2 w-fit rounded-full bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">
                    {error}
                  </p>
                )}
                <CommentComposer
                  key={thread?.spot ? `${thread.spot.mediaKey}:${thread.spot.tag}` : "all"}
                  dark
                  listingKey={listing.ListingKey}
                  canShare={mode === "share" && liked}
                  replyTo={replyTo}
                  onCancelReply={() => setReplyTo(null)}
                  spot={thread?.spot}
                  placeholder={
                    spotCalled
                      ? notes
                        ? `Add a note on ${spotCalled}…`
                        : `Comment on ${spotCalled}…`
                      : notes
                        ? `Add a note for ${notes.for}…`
                        : mode === "share"
                          ? `Tell ${agentFirst} what you think…`
                          : undefined
                  }
                  label={spotCalled ? undefined : notes ? "Add a note" : "Add a comment"}
                  // In the panel, the emoji wait for the box, so the words get
                  // the room until you go to say something.
                  quickOnFocus={sideBySide && !threadOpen}
                  onPosted={() => {
                    setReplyTo(null);
                    // Said about a spot: back to the photo, where it now shows.
                    if (thread?.spot) closeThread(false);
                  }}
                />
              </div>
            ) : (
              // One row, as beside the map: the comment bar, which says how
              // many comments there are (a tap there reads them), then Save
              // (an agent: Feedback) and More. Nothing else under the photo.
              // (Side by side, the row above has those; on a phone on its
              // side, the buttons down the right.)
              <div data-bar-row className="flex items-center gap-2">
                <div
                  data-keep-clear
                  className="flex h-12 min-w-0 flex-1 items-center rounded-full bg-white/12 ring-1 ring-white/20 backdrop-blur-md"
                >
                  <button
                    type="button"
                    onClick={compose}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full pl-5 pr-2 text-left text-base text-white/75 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {notes
                        ? `Add a note for ${notes.for}…`
                        : mode === "share"
                          ? `Tell ${agentFirst} what you think…`
                          : "Add a comment…"}
                    </span>
                    {/* (Not the paper plane: that only ever means sending homes.) */}
                    <ArrowUp aria-hidden size={18} className="hidden shrink-0 opacity-70 split:block short:block" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Comments${comments ? `, ${comments}` : ""}`}
                    onClick={onComments}
                    className="flex h-full min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-full pl-2 pr-4 text-sm font-semibold text-white/90 tabular-nums transition-colors hover:bg-white/[0.06] split:hidden short:hidden"
                  >
                    <MessageCircle aria-hidden size={19} />
                    {comments > 0 && countLabel(comments)}
                  </button>
                </div>
                {onScorecard ? (
                  <button
                    type="button"
                    data-keep-clear
                    data-follow="scorecard"
                    aria-label="Feedback"
                    title="Feedback"
                    onClick={() => onScorecard()}
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/18 split:hidden short:hidden"
                  >
                    <ClipboardList aria-hidden size={20} />
                  </button>
                ) : (
                  onSave && (
                    <button
                      type="button"
                      data-keep-clear
                      aria-label={saved ? `Saved ${listing.UnparsedAddress}` : `Save ${listing.UnparsedAddress}`}
                      title={saved ? "Saved" : "Save"}
                      aria-pressed={saved}
                      onClick={saveIt}
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/18 split:hidden short:hidden"
                    >
                      <Bookmark aria-hidden size={20} className={cn(saved && "fill-white")} />
                    </button>
                  )
                )}
                <button
                  ref={moreButton}
                  type="button"
                  data-keep-clear
                  data-follow="more"
                  aria-label="More options"
                  title="More"
                  onClick={onMore}
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/18 split:hidden short:hidden"
                >
                  <Ellipsis aria-hidden size={20} />
                </button>
              </div>
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
          onPick={pick}
          onComment={onCommentSpot}
          covered={cardOver}
          onPosted={() => setPicked(null)}
          nudge={nudge}
        />
      )}
      {/* On a phone, why it's here, in a band over the photo's top left
          corner, under the head: one line until it's tapped open. (Side by
          side, it's in the panel.) */}
      {band && (
        <div className="split:hidden">
          <TakeCard
            look="band"
            home={take}
            eyebrow={eyebrow}
            // (After the Send pill: its left edge, its width, and a gap.)
            beside={sendCorner ? `calc(${photoPlace(current).left} + 0.75rem + 3rem + 0.5rem)` : null}
            hidden={hidden || sheetOver || !active}
            onSpot={(spot) => onGoToSpot?.(spot)}
            onComment={onCommentAt}
            onAll={onComments}
          />
        </div>
      )}
      {/* Side by side, the homes before and after: a small arrow centred in
          the band above the block, and one in the band below it, each
          bobbing gently. Never on a phone, which swipes. */}
      {!onOpen && !bare && onPrevious && (
        <button
          type="button"
          aria-label="Go to the previous home"
          title="Previous home"
          data-follow="previous"
          onClick={onPrevious}
          style={{ top: `calc((var(--stage-top) - 1rem + var(--photo-top)) / 2)` }}
          className={stageArrow}
        >
          <ChevronUp aria-hidden size={22} strokeWidth={2.25} className="animate-[nudge-up_2.4s_ease-in-out_infinite]" />
        </button>
      )}
      {!onOpen && !bare && onNext && (
        <button
          type="button"
          aria-label="Go to the next home"
          title="Next home"
          data-follow="next"
          onClick={onNext}
          style={{ top: `calc((${stageFoot(listing.Media)} + 100cqh) / 2)` }}
          className={stageArrow}
        >
          <ChevronDown aria-hidden size={22} strokeWidth={2.25} className="animate-[nudge-down_2.4s_ease-in-out_infinite]" />
        </button>
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
  busy = false,
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
  // Waiting on something: it stays put for the keyboard, faded, and a tap does nothing.
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-follow={follow}
      aria-label={name}
      aria-pressed={pressed}
      aria-disabled={busy || undefined}
      onClick={busy ? undefined : onClick}
      className={cn(
        "group flex w-14 flex-col items-center gap-0.5 text-meta font-semibold leading-4 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]",
        busy && "cursor-progress opacity-60",
      )}
    >
      {/* (On the dark ground under a phone's words, a faint disc with an
          edge, so each reads as a button; over a photo, glass.) */}
      <span className="flex size-12 items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-inset ring-white/[0.12] transition-[transform,background-color] group-active:scale-90 squat:size-9 short:size-11 short:bg-black/35 short:ring-0 short:backdrop-blur-md motion-reduce:transition-none motion-reduce:group-active:scale-100 split:ring-1 split:ring-white/15 split:group-hover:bg-black/55">
        {children}
      </span>
      {/* On a backing of the dark ground's own colour: it reads over a
          bright photo, and on the dark ground it isn't there at all. */}
      <span aria-hidden className="rounded-full bg-night/70 px-1.5 tabular-nums">
        {count ?? label}
      </span>
    </button>
  );
}

type Thing = { tag: string; liked: boolean; count: number; toggle: () => void };

// On a phone on its side, where the words lie over the photo's foot: down
// the right in two columns, clear of the words, like, pass, comments, the
// Porchcard (or Save), share (or invite, or send) and more. Each keeps its
// label. Upright, the comment bar's row and the photo's corners have these;
// side by side, a row in the panel (PanelActions).
function Rail({
  address,
  things,
  liked,
  likes,
  comments,
  shareAs,
  onLike,
  passed,
  onPass,
  onComments,
  onScorecard,
  saved,
  onSave,
  onShare,
  onMore,
}: {
  address: string;
  things: Thing[];
  liked: boolean;
  likes: number;
  comments: number;
  shareAs: ShareKind | null;
  onLike: () => void;
  // The X, here beside the heart (elsewhere it's on the photo).
  passed: boolean;
  onPass?: () => void;
  onComments: () => void;
  // The Porchcard (an agent's), or else Save.
  onScorecard?: () => void;
  saved: boolean;
  onSave?: () => void;
  onShare?: () => void;
  onMore: () => void;
}) {
  const icon = { "aria-hidden": true, className: "drop-shadow" } as const;
  return (
    <div
      data-keep-clear
      data-rail
      // Clear of a notch or rounded corner. In two columns: one would run up
      // under the header.
      className={cn(
        "pointer-events-auto absolute bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 hidden",
        "short:left-auto short:right-[calc(0.5rem+env(safe-area-inset-right))] short:grid short:grid-cols-2 short:items-center short:justify-normal short:gap-x-2 short:gap-y-1",
        legacy("@5xl:bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4.25rem))] @5xl:right-[calc(1rem+env(safe-area-inset-right))]"),
        "split:hidden",
      )}
    >
      {/* (Upright, the heart and the X are in the photo's corners.) */}
      <div>
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
      </div>
      {onPass && (
        <div>
          <RailButton name="Pass on this home" label="Pass" pressed={passed} onClick={onPass}>
            <X size={28} {...icon} />
          </RailButton>
        </div>
      )}
      <RailButton
        name={`Comments${comments ? `, ${comments}` : ""}`}
        label="Comments"
        count={comments ? countLabel(comments) : "Comment"}
        onClick={onComments}
      >
        <MessageCircle size={28} {...icon} />
      </RailButton>
      {onScorecard && (
        <RailButton name="Feedback" label="Feedback" onClick={onScorecard} follow="scorecard">
          <ClipboardList size={26} {...icon} />
        </RailButton>
      )}
      {!onScorecard && onSave && (
        <RailButton name={saved ? `Saved ${address}` : `Save ${address}`} label={saved ? "Saved" : "Save"} pressed={saved} onClick={onSave}>
          <Bookmark aria-hidden size={27} className={cn(saved ? "fill-white text-white" : "text-white", "drop-shadow")} />
        </RailButton>
      )}
      {/* For a moment after each send, while the link for the next is made,
          it waits, turning, and says so (the same button, so the keyboard
          comes back to it). */}
      {onShare && (shareAs === "send" || shareAs === "sending") && (
        <RailButton
          name={shareAs === "sending" ? "Send to a client, getting a new link…" : "Send to a client"}
          label="Send"
          onClick={onShare}
          busy={shareAs === "sending"}
        >
          {shareAs === "sending" ? (
            <LoaderCircle size={26} aria-hidden className="animate-spin drop-shadow motion-reduce:animate-none" />
          ) : (
            <Send size={26} {...icon} />
          )}
        </RailButton>
      )}
      {/* Anyone else signed in: on to Send homes, with this one picked. */}
      {onShare && shareAs === "steps" && (
        <RailButton name="Send to someone" label="Send" onClick={onShare}>
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
      <RailButton name="More options" label="More" onClick={onMore} follow="more">
        <Ellipsis size={28} {...icon} />
      </RailButton>
    </div>
  );
}

// What the home costs, what it is, and where, in plain words, the way
// listings read: the price, big; "3 bd · 2 ba · 1,500 sq ft" (what's missing
// or none left out: a lot has no "0 bd"); the address. Just to read: what
// someone thinks of any of it, they say in the comments. As the head above
// the photo (and the same block in the panel, side by side): two lines, the
// price and the size on one, the address under them, always 3.5rem tall
// ("head"). On a phone on its side, over the photo's foot: one line each
// ("lines").
function Facts({ listing, trending, look = "head" }: { listing: Listing; trending: boolean; look?: "head" | "lines" }) {
  const beds = listing.BedroomsTotal;
  const baths = listing.BathroomsTotalInteger;
  const size = listing.LivingArea;
  // Short on screen, in full for a screen reader.
  const parts = [
    beds > 0 && { short: `${beds} bd`, long: `${beds} ${beds === 1 ? "bedroom" : "bedrooms"}` },
    baths > 0 && { short: `${baths} ba`, long: `${baths} ${baths === 1 ? "bathroom" : "bathrooms"}` },
    size > 0 && { short: `${size.toLocaleString("en-US")} sq ft`, long: `${size.toLocaleString("en-US")} square feet` },
  ].filter((part): part is { short: string; long: string } => Boolean(part));
  const seen = parts.map((part) => part.short).join(" · ");
  const said = parts.map((part) => part.long).join(", ");
  // Earned, not decoration: real activity from several people this week,
  // among the busiest homes for sale.
  const chip = trending && (
    <span className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2.5 text-meta font-semibold text-rose-100 [text-shadow:none] short:bg-black/45 short:backdrop-blur-md">
      <Flame aria-hidden size={12} className="text-rose-300" />
      Trending
    </span>
  );
  // "Sample listing" stays when the address runs short: it's the only sign
  // on the home that it isn't real.
  const address = (
    <>
      <h2 data-fact="Address" className="min-w-0 truncate font-normal">
        {listing.UnparsedAddress}, {listing.City}
      </h2>
      {isSampleListing(listing) && <span className="shrink-0 text-meta">&nbsp;· Sample listing</span>}
    </>
  );
  if (look === "head") {
    return (
      <div data-tour="facts" className="min-w-0 flex-1">
        <div className="flex h-8 min-w-0 items-center gap-2.5">
          <p data-fact="Price" className="shrink-0 font-display text-[22px] font-semibold leading-none tabular-nums">
            {formatPrice(listing.ListPrice)}
          </p>
          {chip}
          <p data-fact="Size" className="min-w-0 truncate text-meta leading-5 text-white/90">
            <span aria-hidden>{seen}</span>
            <span className="sr-only">{said}</span>
          </p>
        </div>
        <div className="flex h-6 min-w-0 items-center text-body leading-5 text-white/80">{address}</div>
      </div>
    );
  }
  return (
    <div data-tour="facts">
      {/* (Each row a fixed height: the words never change height.) */}
      <div className="flex h-9 items-center gap-2.5">
        <p data-fact="Price" className="font-display text-[28px] font-semibold leading-none tabular-nums">
          {formatPrice(listing.ListPrice)}
        </p>
        {chip}
      </div>
      <p data-fact="Size" className="h-6 truncate text-body leading-6 text-white/90">
        <span aria-hidden>{seen}</span>
        <span className="sr-only">{said}</span>
      </p>
      <div className="flex h-6 min-w-0 items-center text-body leading-6 text-white/70">{address}</div>
    </div>
  );
}

// Who listed the home, in a line, when it's known: "Listed by Lena Marsh · Sample Realty".
const listedByOf = (listing: Listing) =>
  listing.ListAgentFullName
    ? `Listed by ${listing.ListAgentFullName}${listing.ListOfficeName ? ` · ${listing.ListOfficeName}` : ""}`
    : listing.ListOfficeName
      ? `Listed by ${listing.ListOfficeName}`
      : null;

// Every fact there is about the home, as label and value: the price, beds,
// baths and size first, then the rest (homeDetails).
const factRows = (listing: Listing) => [
  { label: "Price", value: formatPrice(listing.ListPrice) },
  ...(listing.BedroomsTotal > 0 ? [{ label: "Bedrooms", value: String(listing.BedroomsTotal) }] : []),
  ...(listing.BathroomsTotalInteger > 0 ? [{ label: "Bathrooms", value: String(listing.BathroomsTotalInteger) }] : []),
  ...(listing.LivingArea > 0 ? [{ label: "Square feet", value: listing.LivingArea.toLocaleString("en-US") }] : []),
  ...homeDetails(listing),
];

// What the home is, on a phone, opened from the head over the photo: the
// description whole (on an agent's link, their greeting and note first), who
// listed it, every fact, and (on a link) who sent it. Just to read.
function About({
  listing,
  greeting,
  note,
  agentName,
  mode,
  listedBy,
}: {
  listing: Listing;
  greeting?: string;
  note?: string;
  agentName?: string;
  mode: "public" | "share";
  listedBy: string | null;
}) {
  // The note never hides the description: it follows, from a new line.
  const text = [note, listing.PublicRemarks].filter(Boolean).join("\n");
  // Who sent it, on an agent's link, when that's someone other than who listed it.
  const sentBy =
    mode === "share" && agentName && agentName !== "Your agent" && agentName !== listing.ListAgentFullName
      ? `Sent by ${agentName}`
      : null;
  return (
    <>
      {(greeting || text) && (
        <p className="whitespace-pre-line text-body leading-6 text-white/85">
          {/* The greeting ends with a stop, seen, so it doesn't run into the note. */}
          {greeting && <strong className="font-semibold text-white">{greeting}</strong>}
          {greeting && <span aria-hidden>.</span>}
          {greeting && text && " "}
          {text}
        </p>
      )}
      {listedBy && <p className="mt-3 text-meta leading-5 text-white/70">{listedBy}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {factRows(listing).map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-meta leading-4 text-white/55">{row.label}</dt>
            <dd className="break-words text-body font-medium leading-5 text-white">{row.value}</dd>
          </div>
        ))}
      </dl>
      {(sentBy || isSampleListing(listing)) && (
        <div className="mt-3 text-meta leading-5 text-white/60">
          {sentBy && <p>{sentBy}</p>}
          {isSampleListing(listing) && <p>Sample listing</p>}
        </div>
      )}
    </>
  );
}

// Side by side, everything there is to do with the home, in one row at the
// panel's foot, just over the comment box: like it, the comments, the
// Porchcard, then share (or invite, or send) and more. (On a phone these run
// down the rail instead, and this row isn't there.) The same names, so the
// keyboard and screen readers meet the same buttons either way.
function PanelActions({
  address,
  comments,
  shareAs,
  onComments,
  onScorecard,
  saved,
  onSave,
  onShare,
  onMore,
}: {
  address: string;
  comments: number;
  shareAs: ShareKind | null;
  onComments: () => void;
  // The Porchcard (an agent's), or else Save.
  onScorecard?: () => void;
  saved: boolean;
  onSave?: () => void;
  onShare?: () => void;
  onMore: () => void;
}) {
  // Each a fingertip tall (44px), and all but More with its word beside it.
  const action =
    "flex h-11 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 active:bg-white/15";
  const iconOnly = "flex size-11 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15";
  const sending = shareAs === "sending";
  return (
    <div data-actions className="-mx-1 mb-2 hidden items-center gap-0.5 split:flex">
      {/* (The heart is on the photo, opposite the X.) */}
      <button type="button" aria-label={`Comments${comments ? `, ${comments}` : ""}`} onClick={onComments} className={action}>
        <MessageCircle aria-hidden size={21} />
        {comments > 0 && <span className="tabular-nums">{countLabel(comments)}</span>}
      </button>
      {onScorecard && (
        <button type="button" aria-label="Feedback" data-follow="scorecard" onClick={onScorecard} className={action}>
          <ClipboardList aria-hidden size={20} />
          Feedback
        </button>
      )}
      {!onScorecard && onSave && (
        <button
          type="button"
          aria-label={saved ? `Saved ${address}` : `Save ${address}`}
          aria-pressed={saved}
          onClick={onSave}
          className={action}
        >
          <Bookmark aria-hidden size={20} className={cn("transition-transform active:scale-90", saved && "fill-white")} />
          {saved ? "Saved" : "Save"}
        </button>
      )}
      <span className="ml-auto" />
      {onShare && (shareAs === "send" || sending) && (
        <button
          type="button"
          aria-label={sending ? "Send to a client, getting a new link…" : "Send to a client"}
          title="Send to a client"
          aria-disabled={sending || undefined}
          onClick={sending ? undefined : onShare}
          className={cn(action, sending && "cursor-progress opacity-60")}
        >
          {sending ? (
            <LoaderCircle aria-hidden size={20} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Send aria-hidden size={20} />
          )}
          Send
        </button>
      )}
      {onShare && shareAs === "steps" && (
        <button type="button" aria-label="Send to someone" title="Send to someone" onClick={onShare} className={action}>
          <Send aria-hidden size={20} />
          Send
        </button>
      )}
      {onShare && shareAs === "invite" && (
        <button type="button" aria-label="Invite someone" title="Invite someone" onClick={onShare} className={action}>
          <UserPlus aria-hidden size={20} />
          Invite
        </button>
      )}
      {onShare && shareAs === "share" && (
        <button type="button" aria-label="Share" title="Share" onClick={onShare} className={action}>
          <Share2 aria-hidden size={20} />
          Share
        </button>
      )}
      <button
        type="button"
        aria-label="More options"
        title="More"
        data-follow="more"
        onClick={onMore}
        className={iconOnly}
      >
        <Ellipsis aria-hidden size={22} />
      </button>
    </div>
  );
}

// What the home is, beyond the price, beds, baths and size, side by side in
// the panel: the details that used to be down in the Porchcard. Just to read.
function HomeDetails({ listing }: { listing: Listing }) {
  const rows = homeDetails(listing);
  if (rows.length === 0) return null;
  return (
    <ul aria-label="The details" className="mt-4 grid grid-cols-2 gap-2">
      {rows.map((row) => (
        <li key={row.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-white/[0.05] px-3 py-2.5">
          <span className="text-meta leading-4 text-white/55">{row.label}</span>
          <span className="break-words text-body font-medium leading-5 text-white">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

// The description cut short (or, on an agent's link, their greeting and
// note, then the description), then "… more" right after the last word that
// fits, a fingertip to tap. Side by side, two lines in the panel, and "more"
// reads it all in place, with who listed it and the details; "less" puts it
// away (one button, which stays where the keyboard is). On a phone on its
// side, one line over the photo, and "more" opens what the home is over the
// photo (`controls`). Just to read: the words themselves aren't something to tap.
function Caption({
  listing,
  greeting,
  note,
  open,
  expanded = open,
  controls,
  always = false,
  onToggle,
}: {
  listing: Listing;
  greeting?: string;
  note?: string;
  // All of it, right here.
  open: boolean;
  // What "more" has opened, when that's elsewhere (what the home is, over
  // the photo), and its id.
  expanded?: boolean;
  controls?: string;
  // "more" even when the description fits: there's more to open than it
  // (who listed it, the details).
  always?: boolean;
  // Unset beside the map, where it's just a look.
  onToggle?: () => void;
}) {
  // The note never hides the description: it follows, from a new line.
  const text = [note, listing.PublicRemarks].filter(Boolean).join("\n");
  const row = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // How much of the text fits before "… more" (all of it: no "more"). Until
  // it's measured, the browser cuts it off at a line (side by side, ten).
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
        // Side by side: two lines in the panel, and all of it right there
        // when opened (the panel scrolls).
        "text-body leading-6 text-white/80 split:mb-2 split:mt-1",
        open
          ? "pointer-events-auto max-h-[45dvh] overflow-y-auto overscroll-contain split:max-h-none split:overflow-visible"
          : "h-6 split:h-auto split:max-h-12",
      )}
    >
      <div
        ref={box}
        // (With a note, its own lines and the description's are kept.)
        className={cn(note && "whitespace-pre-line", !open && n === null && "line-clamp-1 split:line-clamp-2")}
      >
        {/* The greeting ends with a stop, seen, so it doesn't run into the note. */}
        {greeting && <h1 className="inline font-semibold text-white">{greeting}</h1>}
        {greeting && <span aria-hidden>.</span>}
        {greeting && text && " "}
        {text && <span>{cut ? clipped(text, n ?? 0) : text}</span>}
        {cut && <span aria-hidden>…</span>}{" "}
        {onToggle && (open || cut || always) && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={controls}
            onClick={onToggle}
            className="font-semibold text-white hit-44"
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
  probe.style.cssText = `position:absolute;left:0;top:0;width:${box.clientWidth}px;visibility:hidden;pointer-events:none;white-space:${getComputedStyle(box).whiteSpace}`;
  const words = document.createTextNode(text);
  const greeting = box.querySelector("h1")?.cloneNode(true);
  probe.append(...(greeting ? [greeting, ". "] : []), words);
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

// The Porchcard (an agent's): what everyone thinks of a home, in a sheet up
// from the bottom (beside the photo, wide, in the white panel's place).
function ScorecardSheet({
  post,
  section,
  mode,
  agentName,
  viewer,
  myName,
  alone,
  anchor,
  docked,
  photoFoot,
  onClose,
  onAllComments,
  onCompose,
  onScorecardSpot,
}: {
  post: FeedPost | null;
  // Opened at this part of it.
  section?: "about";
  mode: "public" | "share";
  agentName?: string;
  viewer?: ScorecardViewer;
  myName: string | null;
  // On an agent's link known to be this person's alone.
  alone: boolean;
  // The feed (phones), or the white panel it takes the place of (wide).
  anchor: RefObject<HTMLElement | null>;
  // Beside the photo, wide.
  docked: boolean;
  // Where the photo ends, from the top of the feed, when it opened.
  photoFoot?: number;
  onClose: () => void;
  // To the comments (which take its place), or straight to the box to add one.
  onAllComments: (listingKey: string) => void;
  onCompose: (listingKey: string) => void;
  // To a spot in the photos, or one of the facts (`keyboard`: pressed with a key).
  onScorecardSpot: (listingKey: string, spot: SpotRef, keyboard?: boolean) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const key = post?.listing.ListingKey ?? null;

  // It opens where you left it on this home (while the page is open), or at
  // the part asked for.
  const kept = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !key) return;
    const part = section && el.querySelector<HTMLElement>(`[data-section="${section}"]`);
    el.scrollTop = part
      ? el.scrollTop + part.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
      : (kept.current.get(key) ?? 0);
    const keep = () => kept.current.set(key, el.scrollTop);
    el.addEventListener("scroll", keep, { passive: true });
    return () => el.removeEventListener("scroll", keep);
  }, [key, section]);

  return (
    <Sheet
      open={Boolean(post)}
      onClose={onClose}
      label="Feedback"
      title="Feedback"
      anchor={anchor}
      docked={docked}
      bodyRef={body}
      // Up to the photo's foot, and taller by dragging.
      tall
      detents={photoFoot !== undefined ? { minTop: photoFoot } : undefined}
    >
      {post && (
        <ScorecardBody
          post={post}
          mode={mode}
          agentName={agentName}
          viewer={viewer}
          myName={myName}
          alone={alone}
          // Beside the photo, the panel under it says what the home is.
          details={!docked}
          onShowSpot={(at, keyboard) => onScorecardSpot(post.listing.ListingKey, at, keyboard)}
          onOpenFact={(tag, keyboard) => onScorecardSpot(post.listing.ListingKey, { mediaKey: FACTS, tag }, keyboard)}
          onAllComments={() => onAllComments(post.listing.ListingKey)}
          onCompose={() => onCompose(post.listing.ListingKey)}
        />
      )}
    </Sheet>
  );
}

function MoreSheet({
  post,
  state,
  agentName,
  onToggle,
  onPhotoOnly,
  onClose,
  anchor,
  returnTo,
  onShareLink,
  onInvite,
}: {
  post: FeedPost | null;
  state: ReactionState;
  // Set on an agent's link (where there's no map to see the home on).
  agentName?: string;
  // On a public page it offers "Share link": the home's public page, to pass on.
  onShareLink?: () => void;
  // On an agent's link, on a phone: invite someone onto it.
  onInvite?: () => void;
  anchor: RefObject<HTMLElement | null>;
  returnTo?: () => HTMLElement | null;
  onToggle: (aspect: Aspect) => void;
  onPhotoOnly: () => void;
  onClose: () => void;
}) {
  const listing = post?.listing;
  // (What the home is, its description whole and every detail, opens from
  // the head above the photo; side by side, it's in the panel.)
  return (
    <Sheet open={Boolean(post)} onClose={onClose} label="More" title="More" anchor={anchor} returnTo={returnTo}>
      {post && listing && (
        <div className="flex flex-col gap-5">
          {/* Liked, or passed on with the X on the photo: what about it, if they'd like to say. */}
          {state.reaction && <AspectChips state={state} onToggle={onToggle} />}
          <div className="flex flex-col gap-1">
            {onInvite && (
              <button type="button" onClick={onInvite} className={cn(button({ kind: "ghost", flush: true }), "self-start text-ink")}>
                <UserPlus aria-hidden size={17} />
                Invite someone
              </button>
            )}
            {onShareLink && (
              <button
                type="button"
                onClick={onShareLink}
                className={cn(button({ kind: "ghost", flush: true }), "self-start text-ink")}
              >
                <Link2 aria-hidden size={17} />
                Share link
              </button>
            )}
            <button
              type="button"
              onClick={onPhotoOnly}
              className={cn(button({ kind: "ghost", flush: true }), "self-start text-ink")}
            >
              <ImageIcon aria-hidden size={17} />
              Photo only
            </button>
            {!agentName && (
              // (This home, on the map among the others: the address is
              // only words now, so this is the way there.)
              <Link
                href={`/search?${new URLSearchParams({ home: listing.ListingKey })}`}
                className={cn(button({ kind: "ghost", flush: true }), "self-start text-brand")}
              >
                <MapPin aria-hidden size={17} />
                See it on the map
              </Link>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// Hovering the heart (or pressing and holding it on a phone) slides out
// everything in the photo on screen, each with its own heart.
function LikeWithList({
  things,
  children,
  corner = false,
  className,
  style,
}: {
  things: Thing[];
  children: ReactNode;
  // In the photo's bottom right corner: the list opens up from it, along the
  // right edge, rather than from the left of a row.
  corner?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
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
      style={style}
      className={cn("group/like", className ?? "relative")}
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
          // Up from the heart, at the left of a phone's row (on its side, out to its left).
          className={cn(
            "invisible absolute bottom-full pb-2 opacity-0 short:bottom-auto short:left-auto short:right-full short:top-1/2 short:-translate-y-1/2 short:pb-0 short:pr-2 transition-[opacity,visibility] duration-150 group-hover/like:visible group-hover/like:opacity-100 group-has-focus-visible/like:visible group-has-focus-visible/like:opacity-100 group-data-open/like:visible group-data-open/like:opacity-100",
            corner ? "right-0" : "left-0",
          )}
        >
          <ul
            className={cn(
              "flex flex-col gap-1.5 short:items-end",
              // (From the photo's corner there's only the photo's height above it.)
              corner ? "max-h-56 items-end overflow-y-auto overscroll-contain p-1 [scrollbar-width:none]" : "items-start",
            )}
          >
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
                  className={cn(glass, "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-meta font-semibold hit-44 hover:bg-black/75 [text-shadow:none]")}
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
