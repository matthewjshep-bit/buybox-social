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
import { CommentComposer, type SpotRef } from "@/components/listing-thread";
import type { usePhotoLikes } from "@/components/photo-likes";
import { CLEAR_MARGIN, isNear, keepClearOf, PhotoBox, photoFoot, photoPlace, type Box } from "@/components/reel-photos";
import { cn } from "@/lib/format";
import type { Listing, ListingMedia } from "@/lib/listings/types";
import {
  FACTS,
  mediaKeyOf,
  photoTags,
  spotLabel,
  spotPhrase,
  tagPhrase,
  tagPosition,
  thingOf,
  type PhotoSpot,
} from "@/lib/photos";
import type { TimelineComment, TimelineItem } from "@/lib/timeline";

// Tap anywhere on a photo to like, dislike or comment on that spot: the front
// door, the view from the deck. A ring marks where you tapped and a card opens
// beside it. (The same card opens on the home's facts: the price, the beds.)
// What people liked and talked about stays marked where they did, small and
// quiet, so the photo still comes first; what they said opens out beside each
// spot when you ask to see it (or open the comments).

// The spot whose card is open. `keyboard`: it was picked by keyboard, so the
// card takes focus.
export type PickedSpot = PhotoSpot & { keyboard?: boolean };

export type Photos = ReturnType<typeof usePhotoLikes>;

// "the front door"; "a spot in photo 3"; "the price"
export function spotName(listing: Listing, spot: SpotRef) {
  if (spot.mediaKey === FACTS) return tagPhrase(spot.tag);
  const index = listing.Media.findIndex((m) => mediaKeyOf(m) === spot.mediaKey);
  const thing = thingOf(listing.Media[index], spot.tag);
  if (thing) return tagPhrase(thing);
  return index >= 0 ? `a spot in photo ${index + 1}` : "a spot in a photo";
}

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

// Yours: you liked or disliked it, or said something there.
const isMine = (pin: Pin) => pin.reaction !== null || pin.comments.some((comment) => comment.mine);
const newest = (pin: Pin) => pin.comments.reduce((at, comment) => (comment.at > at ? comment.at : at), "");

// At most this many spots show on a photo, the most liked (then the newest)
// first, so a popular photo stays a photo; yours always show.
const MOST_PINS = 5;
// Spots closer than this, in pixels, gather into one count to tap.
const CLUSTER_PX = 32;

// Everything said and liked about spots in this photo, one pin per spot.
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

// Which way from a point a card or bubble opens, so it stays on screen. For
// something placed at the point itself (left and top 0 in a box there).
const away = (x: number, y: number, gap: string) =>
  `${x < 0.3 ? "-1.25rem" : x > 0.7 ? "calc(-100% + 1.25rem)" : "-50%"} ${y < 0.42 ? gap : `calc(-100% - ${gap})`}`;

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

// The photo, and the words and buttons over it, in the layer's own terms. Kept
// up to date as they change: the description opening, the window turning.
function useWordsOver(layer: RefObject<HTMLDivElement | null>, photoKey: string | undefined) {
  const [shape, setShape] = useState<{ photo: Box; words: Box[]; toggle: Box | null } | null>(null);
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
      const toggle = el.querySelector("[data-pins-toggle]");
      setShape({
        photo: near(frame.getBoundingClientRect()),
        words: keepClearOf(root).map((word) => near(word.getBoundingClientRect())),
        toggle: toggle && near(toggle.getBoundingClientRect()),
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
  pinsShown,
  onTogglePins,
  onComment,
  onPosted,
  covered = false,
}: {
  listingKey: string;
  // The photo on screen, once it's settled; undefined hides everything.
  photo: ListingMedia | undefined;
  // The home's comments and likes.
  items: TimelineItem[];
  photos: Photos;
  picked: PickedSpot | null;
  onPick: (spot: PickedSpot | null) => void;
  pinsShown: boolean;
  onTogglePins: () => void;
  // Comment on a spot in the sheet below (touchscreens).
  onComment: (spot: SpotRef) => void;
  // A comment on a spot was posted from its card.
  onPosted: () => void;
  // Its comments are open in the sheet below: just the ring shows where.
  covered?: boolean;
}) {
  const fine = useFinePointer();
  const layer = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const shape = useWordsOver(layer, photo?.ImageWidth && photo.ImageHeight ? mediaKeyOf(photo) : undefined);
  // Gathered spots someone asked to see one by one, on this photo.
  const [spread, setSpread] = useState<{ mediaKey: string; tags: string[] } | null>(null);
  if (!photo || !photo.ImageWidth || !photo.ImageHeight) return null;
  const mediaKey = mediaKeyOf(photo);
  const pins = pinsOf(photo, items, photos);
  // Where a point in the photo is on screen, in the layer's own terms.
  const onScreen = (at: { x: number; y: number }) => {
    const box = shape!.photo;
    return { x: box.left + at.x * (box.right - box.left), y: box.top + at.y * (box.bottom - box.top) };
  };
  // A spot under the words isn't drawn there: it would muddle them. (Until it's
  // measured, nothing is.) `margin`: how far clear of them it has to be.
  const clearOfWords = (at: { x: number; y: number }, margin = CLEAR_MARGIN) => {
    if (!shape) return false;
    const { x, y } = onScreen(at);
    return !shape.words.some((word) => isNear(word, x, y, margin));
  };
  const comments = pins.reduce((n, p) => n + p.comments.length, 0);
  const open = picked?.mediaKey === mediaKey ? picked : null;
  const things = (photo.Spots ?? []).filter((spot) => photoTags(photo).includes(spot.tag));
  const spreadHere = spread?.mediaKey === mediaKey ? spread.tags : [];
  // The comments toggle steps aside too, while the description is open over it.
  const toggleCovered = Boolean(
    shape?.toggle &&
      shape.words.some(
        (word) =>
          word.left < shape.toggle!.right &&
          word.right > shape.toggle!.left &&
          word.top < shape.toggle!.bottom &&
          word.bottom > shape.toggle!.top,
      ),
  );
  const loose = (pin: Pin) => isMine(pin) || spreadHere.includes(pin.tag);

  const ranked = [...pins].sort((a, b) => b.likes - a.likes || newest(b).localeCompare(newest(a)));
  const shown = ranked.filter(
    (pin, i) =>
      (i < MOST_PINS || isMine(pin) || (pinsShown && pin.comments.length > 0)) && pin.tag !== open?.tag && clearOfWords(pin),
  );
  // Spots right beside each other gather into one count, so none hides another.
  const groups: Pin[][] = [];
  for (const pin of shown) {
    const at = onScreen(pin);
    const near = loose(pin)
      ? undefined
      : groups.find((group) => {
          if (loose(group[0])) return false;
          const other = onScreen(group[0]);
          return Math.hypot(other.x - at.x, other.y - at.y) < CLUSTER_PX;
        });
    if (near) near.push(pin);
    else groups.push([pin]);
  }
  const place = photoPlace(photo);

  return (
    // Over the words and buttons, so a card is never under the description;
    // only what's drawn here takes a touch. With a card open, over the header
    // too, so it can always be closed.
    <div ref={layer} className={cn("pointer-events-none absolute inset-0 [container-type:size]", open ? "z-40" : "z-20")}>
      {/* Where the header ends: no card goes above it. */}
      <span ref={head} aria-hidden className="absolute top-(--photo-top) size-0" />
      {/* Hearts are always where they were left; what was said opens out
          beside each spot when asked for. */}
      {comments > 0 && !open && (
        <button
          type="button"
          data-pins-toggle
          aria-pressed={pinsShown}
          aria-label={`${pinsShown ? "Hide" : "Show"} the comments on this photo, ${comments} ${comments === 1 ? "comment" : "comments"}`}
          onClick={onTogglePins}
          // A fingertip tall; a small pill to see, at the photo's bottom left.
          style={{ top: `calc(${photoFoot(photo)} - 2.875rem)`, left: `calc(${place.left} + 0.5rem)` }}
          className={cn("group pointer-events-auto absolute flex h-11 items-center", toggleCovered && "invisible")}
        >
          <span className="flex h-8 items-center gap-1 rounded-full bg-black/45 px-3 text-[13px] font-semibold text-white backdrop-blur-md group-hover:bg-black/60 group-aria-pressed:bg-white group-aria-pressed:text-ink">
            <MessageCircle aria-hidden size={14} /> {comments}
          </span>
        </button>
      )}

      <PhotoBox photo={photo}>
        {/* The things the photo is known to show, for the keyboard: unseen
            until reached, then a label where each one is. They never catch a
            tap: a tap there lands on the photo, like anywhere else. */}
        {things.map((thing) => (
          <button
            key={thing.tag}
            type="button"
            onClick={() => onPick({ mediaKey, tag: thing.tag, x: thing.x, y: thing.y, keyboard: true })}
            style={{ left: `${thing.x * 100}%`, top: `${thing.y * 100}%` }}
            className="pointer-events-none absolute size-px -translate-x-1/2 -translate-y-1/2 overflow-hidden whitespace-nowrap opacity-0 focus-visible:size-auto focus-visible:rounded-full focus-visible:bg-black/60 focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-[13px] focus-visible:font-semibold focus-visible:text-white focus-visible:opacity-100"
          >
            Select {tagPhrase(thing.tag)}
          </button>
        ))}

        {groups.map((group) =>
          group.length === 1 ? (
            <SpotPin
              key={group[0].tag}
              pin={group[0]}
              label={thingOf(photo, group[0].tag) ?? "A spot"}
              expanded={pinsShown}
              onOpen={() => onPick({ mediaKey, tag: group[0].tag, x: group[0].x, y: group[0].y })}
            />
          ) : (
            <SpotCluster
              key={group.map((pin) => pin.tag).join()}
              pins={group}
              onSpread={() => setSpread({ mediaKey, tags: [...spreadHere, ...group.map((pin) => pin.tag)] })}
            />
          ),
        )}

        {open && (
          <SpotCard
            key={open.tag}
            listingKey={listingKey}
            photo={photo}
            spot={open}
            head={head}
            comments={pins.find((p) => p.tag === open.tag)?.comments ?? []}
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

// Several spots right beside each other, as one count: tap it to see each.
function SpotCluster({ pins, onSpread }: { pins: Pin[]; onSpread: () => void }) {
  const x = pins.reduce((sum, pin) => sum + pin.x, 0) / pins.length;
  const y = pins.reduce((sum, pin) => sum + pin.y, 0) / pins.length;
  return (
    <div style={{ left: `${x * 100}%`, top: `${y * 100}%` }} className="absolute size-0">
      <button
        type="button"
        onClick={onSpread}
        aria-label={`${pins.length} spots here. Show them`}
        className="group pointer-events-auto absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center animate-[nudge-in_250ms_ease-out_both]"
      >
        <span
          aria-hidden
          className="flex h-6 min-w-6 items-center justify-center rounded-full bg-black/45 px-1.5 text-[12px] font-semibold tabular-nums text-white ring-1 ring-white/50 backdrop-blur-sm transition-colors group-hover:bg-black/60"
        >
          {pins.length}
        </span>
      </button>
    </div>
  );
}

// "1 like", "2 dislikes"
const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

// A spot as people left it: a heart exactly where it was placed (a thumbs-down
// if it's only been disliked; who said something, if only talked about),
// always; the latest comment beside it when the comments are showing.
function SpotPin({
  pin,
  label,
  expanded,
  onOpen,
}: {
  pin: Pin;
  label: string;
  expanded: boolean;
  onOpen: () => void;
}) {
  const latest = pin.comments.at(-1);
  const said = latest
    ? `${latest.name}: ${latest.body}${pin.comments.length > 1 ? `, and ${pin.comments.length - 1} more` : ""}`
    : null;
  const likes = pin.likes > 0 ? counted(pin.likes, "like") : null;
  const dislikes = pin.dislikes > 0 ? counted(pin.dislikes, "dislike") : null;
  return (
    <div style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }} className="absolute size-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}: ${[said, likes, dislikes].filter(Boolean).join(", ")}`}
        // A fingertip to tap; a small frosted dot to see, taking on the photo's
        // colours behind it.
        className="group pointer-events-auto absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center animate-[nudge-in_250ms_ease-out_both]"
      >
        <span
          aria-hidden
          className="flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-black/20 px-1 text-[10px] font-semibold leading-none text-white/90 opacity-85 ring-1 ring-white/35 backdrop-blur-sm transition-[opacity,background-color] group-hover:bg-black/40 group-hover:opacity-100"
        >
          {pin.likes > 0 ? (
            <>
              {/* Yours, faintly rose; everyone else's, white. */}
              <Heart size={10} strokeWidth={0} className={pin.reaction === "like" ? "fill-rose-400" : "fill-white/90"} />
              {pin.likes > 1 && <span className="tabular-nums">{pin.likes}</span>}
            </>
          ) : pin.dislikes > 0 ? (
            <>
              <ThumbsDown size={10} className={pin.reaction === "dislike" ? "text-amber-300" : "text-white/90"} />
              {pin.dislikes > 1 && <span className="tabular-nums">{pin.dislikes}</span>}
            </>
          ) : (
            // Only talked about: who said something.
            latest?.name[0]?.toUpperCase()
          )}
        </span>
      </button>
      {latest && expanded && (
        // The words, beside the spot; the button above already says them.
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={onOpen}
          style={{ translate: away(pin.x, pin.y, "1.25rem") }}
          className="pointer-events-auto absolute left-0 top-0 flex w-max max-w-[13rem] items-center gap-1.5 rounded-full bg-white/95 py-1 pl-1 pr-2.5 text-[13px] text-ink shadow-lg animate-[nudge-in_250ms_ease-out_both] hover:bg-white"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
              latest.fromPrivateChat ? "bg-stone-400" : latest.isAgent ? "bg-ink" : "bg-brand",
            )}
          >
            {latest.name[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 truncate">{latest.body}</span>
          {pin.comments.length > 1 && (
            <span className="shrink-0 font-semibold text-stone-500">+{pin.comments.length - 1}</span>
          )}
        </button>
      )}
    </div>
  );
}

// Where you tapped: a ring, and a card to like it or say something about it.
function SpotCard({
  listingKey,
  photo,
  spot,
  head,
  comments,
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
          photos={photos}
          inline={inline}
          keyboard={spot.keyboard}
          onClose={onClose}
          onComment={onComment}
          onPosted={onPosted}
          ref={card}
          style={top === null ? side(spot.x, spot.y) : { ...side(spot.x, spot.y), top, translate: "none" }}
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
        <p className="truncate pl-1 text-[15px] font-semibold">{label}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-my-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink"
        >
          <X aria-hidden size={16} />
        </button>
      </div>

      <div className="mt-2">
        {inline ? (
          <>
            {comments.length > 0 && (
              <ul aria-label={`Comments on ${phrase}`} className="mb-2 flex max-h-40 flex-col gap-2 overflow-y-auto px-1">
                {comments.map((comment) => (
                  <li key={comment.id} className="text-sm leading-snug">
                    <span className="font-semibold">{comment.name}</span> {comment.body}
                  </li>
                ))}
              </ul>
            )}
            <CommentComposer
              listingKey={listingKey}
              spot={spot}
              placeholder={`Comment on ${phrase}…`}
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
            className="flex min-h-10 w-full items-center gap-2 rounded-full bg-stone-100 pl-4 pr-3 text-left text-sm text-stone-500 hover:bg-stone-200"
          >
            <span className="min-w-0 flex-1 truncate">Comment on {phrase}…</span>
            {comments.length > 0 && (
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-stone-700">
                <MessageCircle aria-hidden size={14} />
                {comments.length}
                <span className="sr-only"> {comments.length === 1 ? "comment" : "comments"} so far</span>
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
            "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ring-1 transition-colors",
            reaction === "like" ? "bg-rose-50 text-rose-700 ring-rose-200" : "ring-stone-300 hover:bg-stone-50",
          )}
        >
          <Heart aria-hidden size={16} className={cn(reaction === "like" && "fill-rose-500 text-rose-500")} />
          {reaction === "like" ? "Liked" : "Like"}
          {likes > 0 && <span className="tabular-nums text-stone-500">{likes}</span>}
        </button>
        <button
          type="button"
          aria-pressed={reaction === "dislike"}
          aria-label={`Dislike ${phrase}${dislikes > 0 ? `, ${counted(dislikes, "dislike")}` : ""}`}
          title="Dislike"
          disabled={!photos.enabled}
          onClick={() => choose("dislike")}
          className={cn(
            "flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-xl px-2.5 text-[13px] font-semibold ring-1 transition-colors",
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
