"use client";

import { Heart, MessageCircle, ThumbsDown, X } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { agentNotesOn, agentReactionOn, AgentTake, useNotesMode } from "@/components/agent-notes";
import { CommentComposer, type SpotRef } from "@/components/listing-thread";
import type { usePhotoLikes } from "@/components/photo-likes";
import { CLEAR_MARGIN, isNear, keepClearOf, PhotoBox, type Box } from "@/components/reel-photos";
import { SpotHighlight } from "@/components/spot-highlight";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import {
  mediaKeyOf,
  photoTags,
  spotLabel,
  spotName,
  spotPhrase,
  tagPhrase,
  tagPosition,
  type PhotoSpot,
  type SpotReaction,
} from "@/lib/photos";
import type { TickerEvent } from "@/lib/ticker";
import type { TimelineComment, TimelineItem } from "@/lib/timeline";
import { pill } from "@/lib/ui";

// Tap anywhere on a photo to like, dislike or comment on that spot: the front
// door, the view from the deck. A ring marks where you tapped and a card opens
// beside it. (The same card opens on the home's facts: the price, the beds.)
// Nothing else is drawn on the photo: what other people liked isn't marked
// on it, so everyone looks for themselves first. The line at the photo's foot
// says who did what, one at a time, with a soft hotspot where they did it.

// The spot whose card is open. `keyboard`: it was picked by keyboard, so the
// card takes focus. `fromLine`: opened from the activity line, which takes
// the keyboard back when it closes. `back`: opened from somewhere else (the
// Porchcard), which takes the keyboard back instead.
export type PickedSpot = PhotoSpot & { keyboard?: boolean; fromLine?: boolean; back?: HTMLElement | null };

export type Photos = ReturnType<typeof usePhotoLikes>;

// "the front door"; "a spot in photo 3"; "the price"
export { spotName };

// The comments about one spot, and their replies.
export function spotThread(items: TimelineItem[], spot: SpotRef) {
  const top = items.filter(
    (item): item is TimelineComment =>
      item.kind === "comment" && !item.parentId && item.spot?.mediaKey === spot.mediaKey && item.spot.tag === spot.tag,
  );
  const ids = new Set(top.map((c) => c.id));
  return items.filter((item) => item.kind === "comment" && (ids.has(item.id) || (item.parentId && ids.has(item.parentId))));
}

// A mouse or trackpad: comments can be typed right there on the photo. On a
// touchscreen the keyboard would cover it, so they're typed in a sheet below.
const FINE = "(pointer: fine)";
const subscribe = (onChange: () => void) => {
  const query = matchMedia(FINE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
export const useFinePointer = () =>
  useSyncExternalStore(
    subscribe,
    () => matchMedia(FINE).matches,
    () => false,
  );

type Pin = {
  tag: string;
  x: number;
  y: number;
  comments: TimelineComment[];
  likes: number;
  dislikes: number;
  // Yours.
  reaction: "like" | "dislike" | null;
};

// How far clear of the words, the buttons and the line at the photo's foot
// the hotspot has to be to be drawn.
const FACE_MARGIN = 18;

// The activity line's item, when it's about a spot on this photo: a hotspot
// there, and how it shows.
export type SpotLight = {
  event: TickerEvent;
  // Rings that spread from it as it shows: two the first time, then one.
  ripples: number;
  // Counts showings, so its motion plays again each time.
  showing: number;
  // The line is being looked at: the ring a little bolder, no ripple.
  emphasis: boolean;
  // Reduced motion: no easing in, no ripple.
  still: boolean;
};

// Everything said and liked about spots in this photo, one per spot (for the
// card that opens on one).
function pinsOf(photo: ListingMedia, items: TimelineItem[], photos: Photos): Pin[] {
  const mediaKey = mediaKeyOf(photo);
  const pins = new Map<string, Pin>();
  const pin = (tag: string) => {
    const at = tagPosition(photo, tag);
    if (!at) return null;
    const existing = pins.get(tag) ?? { tag, ...at, comments: [], likes: 0, dislikes: 0, reaction: null };
    pins.set(tag, existing);
    return existing;
  };
  for (const item of items) {
    if (item.kind === "comment" && !item.parentId && item.spot?.mediaKey === mediaKey) pin(item.spot.tag)?.comments.push(item);
  }
  for (const tag of photos.likedTags(photo)) {
    const likes = photos.count(photo, tag);
    const dislikes = photos.dislikes(photo, tag);
    const found = likes + dislikes > 0 ? pin(tag) : null;
    if (found) Object.assign(found, { likes, dislikes, reaction: photos.reactionOf(photo, tag) });
  }
  return [...pins.values()];
}

// A card's width: its own, or the screen's, less a margin.
const CARD = "min(19rem, 100cqw - 1.5rem)";

// Where a card about a spot goes: beside it, opening the same way as above,
// but never past the photo's edges, however near one the spot is.
const side = (x: number, y: number): CSSProperties => {
  const at = `${x * 100}%`;
  const want = x < 0.3 ? `${at} - 1.25rem` : x > 0.7 ? `${at} - ${CARD} + 1.25rem` : `${at} - ${CARD} / 2`;
  return {
    left: `clamp(0.75rem, ${want}, 100% - ${CARD} - 0.75rem)`,
    top: `${y * 100}%`,
    translate: `0 ${y < 0.42 ? "1.4rem" : "calc(-100% - 1.4rem)"}`,
  };
};

// Where a thing's name shows when the keyboard reaches it: just above the
// spot (below it, within 5rem of the photo's top, clear of the photo's
// number there), so a heart there stays clear of the words, and never past
// the photo's edges: running right from a spot on the left, left from one on
// the right, centred between. `height`: the photo's, in pixels, once measured.
const labelOf = (x: number, y: number, height: number | null): CSSProperties => {
  const edge = (from: number) => `max(0.5rem, ${from * 100}% - 1.25rem)`;
  const across: CSSProperties =
    x < 0.4
      ? { left: edge(x), maxWidth: `calc(100% - ${edge(x)} - 0.5rem)` }
      : x > 0.6
        ? { right: edge(1 - x), maxWidth: `calc(100% - ${edge(1 - x)} - 0.5rem)` }
        : { left: `${x * 100}%`, translate: "-50% 0", maxWidth: `calc(${Math.min(x, 1 - x) * 200}% - 1rem)` };
  const below = height ? y * height < 80 : y < 0.25;
  return { ...across, ...(below ? { top: `calc(${y * 100}% + 1rem)` } : { bottom: `calc(${(1 - y) * 100}% + 1rem)` }) };
};

// The photo, and the words and buttons over it, in the layer's own terms. Kept
// up to date as they change: the description opening, the window turning.
function useWordsOver(layer: RefObject<HTMLDivElement | null>, photoKey: string | undefined) {
  const [shape, setShape] = useState<{ photo: Box; words: Box[] } | null>(null);
  useLayoutEffect(() => {
    const el = layer.current;
    const root = el?.parentElement;
    if (!el || !root) return;
    const measure = () => {
      const at = el.getBoundingClientRect();
      const frame = el.querySelector("[data-photo-frame]");
      if (!frame) return;
      const near = (box: DOMRect): Box => ({
        left: box.left - at.left,
        top: box.top - at.top,
        right: box.right - at.left,
        bottom: box.bottom - at.top,
      });
      setShape({
        photo: near(frame.getBoundingClientRect()),
        words: keepClearOf(root).map((word) => near(word.getBoundingClientRect())),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const word of keepClearOf(root)) observer.observe(word);
    const frame = el.querySelector("[data-photo-frame]");
    if (frame) observer.observe(frame);
    return () => observer.disconnect();
  }, [layer, photoKey]);
  return shape;
}

export function SpotLayer({
  listingKey,
  photo,
  items,
  photos,
  picked,
  onPick,
  onComment,
  onPosted,
  covered = false,
  highlight = null,
  onHighlightClear,
  nudge = null,
}: {
  listingKey: string;
  // The photo on screen, once it's settled; undefined hides everything.
  photo: ListingMedia | undefined;
  // The home's comments and likes.
  items: TimelineItem[];
  photos: Photos;
  picked: PickedSpot | null;
  onPick: (spot: PickedSpot | null) => void;
  // Comment on a spot in the sheet below (touchscreens).
  onComment: (spot: SpotRef) => void;
  // A comment on a spot was posted from its card.
  onPosted: () => void;
  // Its comments are open in the sheet below: just the ring shows where.
  covered?: boolean;
  // What the activity line is on, when it's about a spot: a hotspot there.
  highlight?: SpotLight | null;
  // Whether that spot can be pointed at, or is under the words, the buttons
  // or the line itself (the line then says "this photo").
  onHighlightClear?: (tag: string, clear: boolean) => void;
  // A walkthrough nudge showing on the photo: the hotspot stays clear of it.
  nudge?: string | null;
}) {
  const fine = useFinePointer();
  const layer = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const photoKey = photo?.ImageWidth && photo.ImageHeight ? mediaKeyOf(photo) : undefined;
  const shape = useWordsOver(layer, photoKey);
  // Whether the activity line's spot is clear of everything over the photo.
  const litTag = highlight && highlight.event.mediaKey === photoKey ? highlight.event.spot : undefined;
  const [litClear, setLitClear] = useState<{ tag: string; clear: boolean } | null>(null);
  const reportClear = useRef(onHighlightClear);
  useLayoutEffect(() => {
    reportClear.current = onHighlightClear;
  });
  useLayoutEffect(() => {
    const el = layer.current;
    const at = litTag && photo ? tagPosition(photo, litTag) : null;
    if (!el || !shape || !litTag || !at) return;
    const box = shape.photo;
    const [x, y] = [box.left + at.x * (box.right - box.left), box.top + at.y * (box.bottom - box.top)];
    const origin = el.getBoundingClientRect();
    // (The nudge for the next home, at the photo's foot, too, while it shows.)
    const nudgeBox = nudge ? el.closest("article")?.querySelector("[data-nudge]")?.getBoundingClientRect() : null;
    const underNudge =
      nudgeBox &&
      isNear(
        { left: nudgeBox.left - origin.left, top: nudgeBox.top - origin.top, right: nudgeBox.right - origin.left, bottom: nudgeBox.bottom - origin.top },
        x,
        y,
        FACE_MARGIN,
      );
    const clear = !underNudge && !shape.words.some((word) => isNear(word, x, y, CLEAR_MARGIN + FACE_MARGIN));
    setLitClear((now) => (now?.tag === litTag && now.clear === clear ? now : { tag: litTag, clear }));
    reportClear.current?.(litTag, clear);
  }, [litTag, photo, shape, items, nudge]);
  // The keyboard goes back to the thing whose card was opened from it and is
  // now closed. (One opened from the activity line, or the Porchcard, gives
  // it back there instead.)
  const [focusTo, setFocusTo] = useState<{ tag: string; n: number } | null>(null);
  const openTag = picked?.mediaKey === photoKey ? picked?.tag : undefined;
  const elsewhere = Boolean(picked?.fromLine || picked?.back);
  const [wasOpen, setWasOpen] = useState({ tag: openTag, fromLine: elsewhere });
  if (openTag !== wasOpen.tag) {
    setWasOpen({ tag: openTag, fromLine: elsewhere });
    if (wasOpen.tag && !openTag && picked === null && !wasOpen.fromLine) {
      const tag = wasOpen.tag;
      setFocusTo((now) => ({ tag, n: (now?.n ?? 0) + 1 }));
    }
  }
  const focused = useRef(0);
  useLayoutEffect(() => {
    if (!focusTo || focused.current === focusTo.n) return;
    focused.current = focusTo.n;
    // Only when nothing else has the keyboard (it was on what just went away).
    if (document.activeElement && document.activeElement !== document.body) return;
    // (A spot that isn't one of the named things: the first thing in it, so
    // the keyboard stays on the photo.)
    for (const where of [`[data-thing="${CSS.escape(focusTo.tag)}"]`, "[data-thing]"]) {
      const at = layer.current?.querySelector<HTMLElement>(where);
      at?.focus({ preventScroll: true });
      if (at && document.activeElement === at) break;
    }
  }, [focusTo]);
  if (!photo || !photoKey) return null;
  const mediaKey = photoKey;
  const open = picked?.mediaKey === mediaKey ? picked : null;
  const things = (photo.Spots ?? []).filter((spot) => photoTags(photo).includes(spot.tag));
  // The activity line's spot, drawn when it's clear of everything (and no
  // card is open on this photo).
  const lit = highlight && litTag && !open && litClear?.tag === litTag && litClear.clear ? highlight : null;
  const litAt = lit && litTag ? tagPosition(photo, litTag) : null;

  return (
    // Over the words and buttons, so a card is never under the description;
    // only what's drawn here takes a touch. With a card open, over the header
    // too, so it can always be closed.
    <div ref={layer} className={cn("pointer-events-none absolute inset-0 [container-type:size]", open ? "z-40" : "z-20")}>
      {/* Where the header ends: no card goes above it. */}
      <span ref={head} aria-hidden className="absolute top-(--photo-top) size-0" />
      <PhotoBox photo={photo}>
        {/* The things the photo is known to show, for the keyboard: unseen
            until reached, then a label where each one is. They never catch a
            tap: a tap there lands on the photo, like anywhere else. */}
        {things.map((thing) => (
          <button
            key={thing.tag}
            type="button"
            data-thing={thing.tag}
            onClick={() => onPick({ mediaKey, tag: thing.tag, x: thing.x, y: thing.y, keyboard: true })}
            style={labelOf(thing.x, thing.y, shape && shape.photo.bottom - shape.photo.top)}
            className="pointer-events-none absolute size-px overflow-hidden text-ellipsis whitespace-nowrap opacity-0 focus-visible:z-30 focus-visible:size-auto focus-visible:rounded-full focus-visible:bg-black/60 focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-meta focus-visible:font-semibold focus-visible:text-white focus-visible:opacity-100"
          >
            Select {tagPhrase(thing.tag)}
          </button>
        ))}

        {lit && litAt && (
          <SpotHighlight
            event={lit.event}
            x={litAt.x}
            y={litAt.y}
            ripples={lit.ripples}
            emphasis={lit.emphasis}
            still={lit.still}
            showing={lit.showing}
          />
        )}

        {open && (
          <SpotCard
            key={open.tag}
            listingKey={listingKey}
            photo={photo}
            spot={open}
            head={head}
            comments={pinsOf(photo, items, photos).find((p) => p.tag === open.tag)?.comments ?? []}
            agentReaction={agentReactionOn(items, mediaKey, open.tag)}
            photos={photos}
            inline={fine}
            ringOnly={covered}
            onClose={() => onPick(null)}
            onComment={() => onComment({ mediaKey, tag: open.tag })}
            onPosted={onPosted}
          />
        )}
      </PhotoBox>
    </div>
  );
}

// "1 like", "2 dislikes"
const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

// Where you tapped: a ring, and a card to like it or say something about it.
function SpotCard({
  listingKey,
  photo,
  spot,
  head,
  comments,
  agentReaction,
  photos,
  inline,
  ringOnly,
  onClose,
  onComment,
  onPosted,
}: {
  listingKey: string;
  photo: ListingMedia;
  spot: PickedSpot;
  // Marks where the header ends.
  head: RefObject<HTMLElement | null>;
  comments: TimelineComment[];
  agentReaction: SpotReaction;
  photos: Photos;
  // Type the comment right here (a mouse or trackpad), rather than below.
  inline: boolean;
  ringOnly: boolean;
  onClose: () => void;
  onComment: () => void;
  onPosted: () => void;
}) {
  // The card opens above the spot, or below it near the top; either way it
  // stays on screen, clear of the header, so it can always be closed.
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = card.current;
    const frame = el?.parentElement;
    const layer = frame?.parentElement;
    if (!el || !frame || !layer || !head.current) return;
    const place = () => {
      const box = frame.getBoundingClientRect();
      const height = el.offsetHeight;
      const at = box.top + spot.y * box.height;
      const highest = head.current!.getBoundingClientRect().top + 8;
      const lowest = layer.getBoundingClientRect().bottom - 8;
      const gap = 22;
      const above = at - gap - height;
      const below = at + gap;
      let y = spot.y < 0.42 ? below : above;
      if (y === above && above < highest) y = below;
      else if (y === below && below + height > lowest && above >= highest) y = above;
      y = Math.max(highest, Math.min(y, lowest - height));
      setTop(Math.round(y - box.top));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    observer.observe(layer);
    return () => observer.disconnect();
  }, [spot.y, head, ringOnly]);

  return (
    <>
      <span
        aria-hidden
        style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
        className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgb(0_0_0/0.25),0_4px_12px_rgb(0_0_0/0.35)] animate-[nudge-in_200ms_ease-out_both]"
      />
      {!ringOnly && (
        <ReactCard
          listingKey={listingKey}
          where={photo}
          spot={{ mediaKey: spot.mediaKey, tag: spot.tag }}
          label={spotLabel(photo, spot.tag)}
          phrase={spotPhrase(photo, spot.tag)}
          comments={comments}
          agentReaction={agentReaction}
          photos={photos}
          inline={inline}
          keyboard={spot.keyboard}
          onClose={onClose}
          onComment={onComment}
          onPosted={onPosted}
          ref={card}
          style={top === null ? side(spot.x, spot.y) : { ...side(spot.x, spot.y), top, translate: "none" }}
          // Over other spots' words (shown while the comments are open).
          className="z-20"
        />
      )}
    </>
  );
}

// A card to like, dislike or say something about one thing: a spot in a photo,
// or one of the home's facts. What's been said and the box to say more come
// first; Like, and a smaller Dislike, last, nearest where you tapped (the card
// opens above it, unless that's off the top).
export function ReactCard({
  listingKey,
  where,
  spot,
  label,
  phrase,
  comments,
  agentReaction = null,
  photos,
  inline,
  keyboard = false,
  onClose,
  onComment,
  onPosted,
  extra,
  style,
  className,
  ref,
}: {
  listingKey: string;
  // The photo it's in, or what stands in for one (the facts).
  where: ListingMedia | string;
  spot: SpotRef;
  // "Front door"; and in a sentence, "the front door".
  label: string;
  phrase: string;
  comments: TimelineComment[];
  // On an agent's link: the agent liked it, or didn't.
  agentReaction?: SpotReaction;
  photos: Photos;
  // Type the comment right here (a mouse or trackpad), rather than in a sheet.
  inline: boolean;
  // Opened by keyboard: Like takes focus.
  keyboard?: boolean;
  onClose: () => void;
  // Comment in the sheet below (touchscreens).
  onComment: () => void;
  onPosted: () => void;
  // Anything else this thing offers (the address: the map).
  extra?: ReactNode;
  style?: CSSProperties;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const reaction = photos.reactionOf(where, spot.tag);
  const likes = photos.count(where, spot.tag);
  const dislikes = photos.dislikes(where, spot.tag);
  const choose = (value: "like" | "dislike") => photos.set(where, spot.tag, reaction === value ? null : value);
  // The agent on their own link writes notes, and likes or dislikes as
  // anyone can. Their take shows on its own, above the rest.
  const notes = useNotesMode();
  const write = notes ? `Add a note on ${phrase}…` : `Comment on ${phrase}…`;
  const agentSaid = agentNotesOn(comments, spot.mediaKey, spot.tag);
  const others = comments.filter((comment) => !comment.isAgent);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-spot-card
      data-light
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      style={style}
      className={cn(
        "pointer-events-auto absolute w-[min(19rem,calc(100cqw-1.5rem))] rounded-2xl bg-white p-3 text-ink shadow-[0_12px_40px_rgb(0_0_0/0.35)] [text-shadow:none] animate-[nudge-in_200ms_ease-out_both]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate pl-1 text-body font-semibold">{label}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-my-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink"
        >
          <X aria-hidden size={16} />
        </button>
      </div>

      <AgentTake notes={agentSaid} reaction={agentReaction} />

      <div className="mt-2">
        {inline ? (
          <>
            {others.length > 0 && (
              <ul aria-label={`Comments on ${phrase}`} className="mb-2 flex max-h-40 flex-col gap-2 overflow-y-auto px-1">
                {others.map((comment) => (
                  <li key={comment.id} className="text-sm leading-snug">
                    <span className="font-semibold">{comment.name}</span> {comment.body}
                  </li>
                ))}
              </ul>
            )}
            <CommentComposer
              listingKey={listingKey}
              spot={spot}
              placeholder={write}
              compact
              autoFocus={!keyboard}
              onPosted={onPosted}
            />
          </>
        ) : (
          // Looks like the box it opens: the keyboard would cover the photo
          // here, so it's typed in a sheet below.
          <button
            type="button"
            onClick={onComment}
            className="flex min-h-10 w-full items-center gap-2 rounded-full bg-stone-100 pl-4 pr-3 text-left text-sm text-muted hit-44 hover:bg-stone-200"
          >
            <span className="min-w-0 flex-1 truncate">{write}</span>
            {others.length > 0 && (
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-stone-700">
                <MessageCircle aria-hidden size={14} />
                {others.length}
                <span className="sr-only"> {others.length === 1 ? "comment" : "comments"} so far</span>
              </span>
            )}
          </button>
        )}
      </div>

      {extra}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          autoFocus={keyboard}
          aria-pressed={reaction === "like"}
          aria-label={`Like ${phrase}${likes > 0 ? `, ${counted(likes, "like")}` : ""}`}
          disabled={!photos.enabled}
          onClick={() => choose("like")}
          className={cn(
            pill(),
            "flex-1 ring-1",
            reaction === "like" ? "bg-rose-50 text-rose-700 ring-rose-200" : "ring-stone-300 hover:bg-stone-50",
          )}
        >
          <Heart aria-hidden size={16} className={cn(reaction === "like" && "fill-rose-500 text-rose-500")} />
          {reaction === "like" ? "Liked" : "Like"}
          {/* (Liked, in the button's own rose: grey on the pink is too faint to read.) */}
          {likes > 0 && <span className={cn("tabular-nums", reaction !== "like" && "text-stone-500")}>{likes}</span>}
        </button>
        <button
          type="button"
          aria-pressed={reaction === "dislike"}
          aria-label={`Dislike ${phrase}${dislikes > 0 ? `, ${counted(dislikes, "dislike")}` : ""}`}
          title="Dislike"
          disabled={!photos.enabled}
          onClick={() => choose("dislike")}
          className={cn(
            pill(),
            "ring-1",
            reaction === "dislike"
              ? "bg-amber-50 text-amber-800 ring-amber-200"
              : "text-stone-500 ring-stone-200 hover:bg-stone-50 hover:text-stone-700",
          )}
        >
          <ThumbsDown aria-hidden size={15} className={cn(reaction === "dislike" && "fill-amber-200")} />
          {dislikes > 0 && <span className="tabular-nums">{dislikes}</span>}
        </button>
      </div>
    </div>
  );
}
