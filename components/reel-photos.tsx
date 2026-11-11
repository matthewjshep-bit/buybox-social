"use client";

import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { ChevronLeft, ChevronRight, Heart, Play } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { glass } from "@/lib/ui";
import type { ListingMedia } from "@/lib/listings/types";

// The clear space between the header at the top and the words at the bottom,
// set by the page as `--photo-top` and `--photo-bottom` (in units of the slide,
// or the carousel, it's measured in), less anything down either side
// (`--photo-left`, `--photo-right`: a wide screen's stage, beside the buttons
// and the words).
const TOP = "var(--photo-top, 4.5rem)";
const BOTTOM = "var(--photo-bottom, 14.5rem)";
const LEFT = "var(--photo-left, 0px)";
const RIGHT = "var(--photo-right, 0px)";
const CLEAR = `(100cqh - ${TOP} - ${BOTTOM})`;
// Where in that space it sits: 0 at the top, 0.5 in the middle, 1 on the words.
const ALIGN = "var(--photo-align, 0.5)";
// 1: the photo stays inside the clear space (a phone, the words below it).
// 0: it grows on under the words, as far as the whole height (the words over it).
const FIT = "var(--photo-fit, 0)";
const MAX_HEIGHT = `(${CLEAR} + (100cqh - ${CLEAR}) * (1 - ${FIT}))`;

// The strip of photos under the photo, side by side.
const STRIP_HEIGHT = "88px";

const ratioOf = (photo: ListingMedia | undefined) =>
  photo?.ImageWidth && photo?.ImageHeight ? photo.ImageWidth / photo.ImageHeight : null;

// Where a photo goes: as big as it can be, whole, never cropped. On a phone it
// sits in the clear space, right on top of the words, and never under the
// header. With the words over it (a wide screen, a phone on its side), it
// grows past the clear space, under the words, when there's room to show more
// of it. Without a known size (a video, some photos), it takes all that space
// and shows whole inside it. Measured against the nearest box with
// `container-type: size`.
export function photoPlace(photo: ListingMedia | undefined) {
  const ratio = ratioOf(photo);
  const room = `(100cqw - ${LEFT} - ${RIGHT})`;
  const width = ratio ? `min(${room}, ${MAX_HEIGHT} * ${ratio})` : room;
  const height = ratio ? `min(${MAX_HEIGHT}, ${room} / ${ratio})` : MAX_HEIGHT;
  const top = `clamp(0px, ${TOP} + (${CLEAR} - ${height}) * ${ALIGN}, 100cqh - ${height})`;
  return { width, height, top, left: `${LEFT} + (${room} - ${width}) / 2` };
}

// Along the bottom of the photo, or of the clear space when the photo goes on
// under the words: where anything that sits at its foot goes.
export const photoFoot = (photo: ListingMedia | undefined) => {
  const place = photoPlace(photo);
  return `min(${place.top} + ${place.height}, 100cqh - ${BOTTOM})`;
};

// Side by side, the band above and below the photos (and the panel beside
// them), for the arrows to the homes before and after.
export const STAGE_BAND = "2.25rem";

// Side by side: the photos, the strip under them and the panel beside them,
// as one block, centred up and down between the header and the window's foot,
// a band above and below it. Where it starts and how far from the foot it
// ends, as `--photo-top` and `--photo-bottom`, sized by the tallest photo so
// it stays put from photo to photo. (Worked out from fixed sizes, never from
// those two, so it can set them.) Twice over: measured from the whole home
// (`top`, `bottom`), and from inside a photo's own slide, which is just the
// stage, the width beside the panel (`stageTop`, `stageBottom`). A variable
// takes its values where it's set, so each place needs its own.
export function stageBlock(media: ListingMedia[]) {
  const top = `(var(--stage-top) - 1rem + ${STAGE_BAND})`;
  // (The strip: its photos' foot is 0.25rem + 80px under the photo's.)
  const bottom = media.length > 1 ? `(0.25rem + 80px + ${STAGE_BAND})` : `(${STAGE_BAND})`;
  const ratio = ratioOf(most(media, (a, b) => a < b));
  const clear = `(100cqh - ${top} - ${bottom})`;
  const place = (room: string) => {
    const height = ratio ? `min(${clear}, ${room} / ${ratio})` : clear;
    const spare = `max(0px, (${clear} - ${height}) / 2)`;
    return { top: `calc(${top} + ${spare})`, bottom: `calc(${bottom} + ${spare})` };
  };
  const whole = place(`(100cqw - ${LEFT} - ${RIGHT})`);
  const stage = place("100cqw");
  return { top: whole.top, bottom: whole.bottom, stageTop: stage.top, stageBottom: stage.bottom };
}

// Side by side: where the photos end on the stage, with the strip under them
// when there are several (under the tallest, as the strip is placed), so
// the panel beside them can end level with them, whichever photo shows.
export function stageFoot(media: ListingMedia[]) {
  if (media.length <= 1) return `calc(${photoFoot(media[0])})`;
  // (The strip's own photos, not the room round them: 8px under them.)
  return `calc(${photoFoot(most(media, (a, b) => a < b))} + 0.25rem + ${STRIP_HEIGHT} - 8px)`;
}

// How wide a photo shows, for the browser to fetch no bigger a copy than
// that. At most the window's width; less where the window is wider than the
// photo (a phone on its side), where it's only as wide as the height allows;
// beside the words on a wide screen, about two thirds of the window.
export function sizesFor(photo: ListingMedia, beside = false) {
  const wide = photo.ImageWidth && photo.ImageHeight ? `${photo.ImageWidth}/${photo.ImageHeight}` : null;
  return [
    beside && "(min-width: 64rem) 65vw",
    wide && `(min-aspect-ratio: ${wide}) ${Math.ceil((100 * photo.ImageWidth!) / photo.ImageHeight!)}vh`,
    "100vw",
  ]
    .filter(Boolean)
    .join(", ");
}

// Its top edge, or the header's foot when the photo runs on under the header:
// where anything pinned to the top of the photo goes.
export const photoHead = (photo: ListingMedia | undefined) => `max(${photoPlace(photo).top}, ${TOP})`;

// A box exactly the size and place of the photo as shown (whole, letterboxed
// over its blurred copy), so anything inside can point at a spot in the photo
// in fractions of it. Inside the carousel, or in a layer of the same size over
// it (with `container-type: size`) to draw over the words on top.
export function PhotoBox({ photo, children, className }: { photo: ListingMedia | undefined; children?: ReactNode; className?: string }) {
  const place = photoPlace(photo);
  return (
    <div
      data-photo-frame
      className={cn("absolute", className)}
      style={{ width: place.width, height: place.height, left: `calc(${place.left})`, top: place.top }}
    >
      {children}
    </div>
  );
}

// The words and buttons over a photo (marked with this): nothing on the photo
// shows under them, and a tap on them isn't a tap on the photo. Within this
// many pixels of them counts, so a heart is drawn whole or not at all.
export const KEEP_CLEAR = "data-keep-clear";
export const CLEAR_MARGIN = 14;

export type Box = { left: number; top: number; right: number; bottom: number };

export const keepClearOf = (root: Element) => [...root.querySelectorAll(`[${KEEP_CLEAR}]`)];

export const isNear = (box: Box, x: number, y: number, margin = CLEAR_MARGIN) =>
  x >= box.left - margin && x <= box.right + margin && y >= box.top - margin && y <= box.bottom + margin;

const isVideo = (photo: ListingMedia) =>
  photo.MediaCategory === "Video" || /\.(mp4|webm|mov)(\?|$)/i.test(photo.MediaURL);

// How long a press lasts before it counts as holding, and how soon a second
// tap has to follow the first to make a double-tap.
const HOLD_MS = 380;
const DOUBLE_TAP_MS = 300;

// A home's photos (and videos) filling the screen, swiped sideways: by touch,
// by dragging, or with two fingers on a trackpad. Listing photos are
// landscape, so each shows whole over a blurred copy of itself rather than
// cropped to a sliver. A tap says where on the photo it landed; a double-tap
// likes it, with a heart; pressing and holding shows it alone.
export function ReelPhotos({
  media,
  address,
  active,
  priority,
  onIndexChange,
  onSettle,
  onDoubleTap,
  onTap,
  onHold,
  show,
  peek,
  overlay,
  controls = true,
  chrome = true,
  start = 0,
  counter,
  likesOf,
  beside = false,
}: {
  media: ListingMedia[];
  address: string;
  // On screen now: videos play.
  active: boolean;
  priority?: boolean;
  onIndexChange?: (index: number) => void;
  // The photo has finished sliding into place.
  onSettle?: (index: number) => void;
  onDoubleTap?: (photo: ListingMedia) => void;
  // One tap, once it's clear it isn't the first of two: where on the photo,
  // in fractions of it (null for the space around it), and the photo's size
  // on screen.
  onTap?: (photo: ListingMedia, point: { x: number; y: number } | null, size: { width: number; height: number } | null) => void;
  // Pressed and held (true), then let go (false).
  onHold?: (holding: boolean) => void;
  // Brings a photo into view. `n` counts requests, so the same photo again still moves.
  show?: { index: number; n: number } | null;
  // Slide a little and back, to show there are more photos (until touched).
  peek?: boolean;
  // Drawn over the photos; `--photo-top` and `--photo-bottom` say where the clear space is.
  overlay?: ReactNode;
  // The arrows to the previous and next photo (a swipe still turns them).
  controls?: boolean;
  // The room label and the arrows over the photo; off to see the photo alone.
  chrome?: boolean;
  // The photo to open on, the first time.
  start?: number;
  // Which home of several this is ("Home 1 of 3"), at the photo's top right.
  counter?: string;
  // How many likes there are on things in a photo, for the strip of them
  // under it on a wide screen.
  likesOf?: (photo: ListingMedia) => number;
  // On a wide screen, the photo shares the width with the words beside it.
  beside?: boolean;
}) {
  // Each carousel needs its own plugin; a sideways trackpad swipe turns the
  // photos, while an up-and-down one still scrolls between homes.
  const [plugins] = useState(() => [WheelGesturesPlugin()]);
  const [first] = useState(() => Math.max(0, Math.min(media.length - 1, start)));
  const [emblaRef, embla] = useEmblaCarousel({ startIndex: first }, plugins);
  const [touched, setTouched] = useState(false);
  const [index, setIndex] = useState(first);
  const lastTap = useRef<{ slide: number; at: number } | null>(null);
  const [burst, setBurst] = useState<{ slide: number; at: number } | null>(null);

  const onSelect = useCallback(() => {
    if (!embla) return;
    setIndex(embla.selectedScrollSnap());
    onIndexChange?.(embla.selectedScrollSnap());
  }, [embla, onIndexChange]);

  useEffect(() => {
    if (!embla) return;
    embla.on("select", onSelect);
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla, onSelect]);

  const settle = useRef(onSettle);
  useEffect(() => {
    settle.current = onSettle;
  });
  useEffect(() => {
    if (!embla) return;
    const onSettled = () => settle.current?.(embla.selectedScrollSnap());
    embla.on("settle", onSettled);
    return () => {
      embla.off("settle", onSettled);
    };
  }, [embla]);

  // Only a new request moves the photos (each one a new object).
  useEffect(() => {
    if (embla && show) embla.scrollTo(show.index, true);
  }, [embla, show]);

  // A single tap waits to see whether a second follows.
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pressing and holding: the timer, where it started, and whether it got there.
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(single.current ?? undefined);
      clearTimeout(hold.current?.timer);
    },
    [],
  );

  const press = (event: PointerEvent) => {
    if (!onHold || !event.isPrimary || (event.target as HTMLElement).closest("button, a, video")) return;
    held.current = false;
    clearTimeout(hold.current?.timer);
    hold.current = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        held.current = true;
        onHold(true);
      }, HOLD_MS),
    };
  };
  const release = () => {
    clearTimeout(hold.current?.timer);
    hold.current = null;
    if (held.current) onHold?.(false);
  };
  const move = (event: PointerEvent) => {
    // Moving is a swipe, not a hold.
    if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) release();
  };

  const tap = (event: MouseEvent<HTMLElement>, photo: ListingMedia, slide: number) => {
    // Letting go of a hold isn't a tap.
    if (held.current) {
      held.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest("button, a, video")) return;
    clearTimeout(single.current ?? undefined);
    const now = event.timeStamp;
    if (onDoubleTap && lastTap.current?.slide === slide && now - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      setBurst({ slide, at: now });
      onDoubleTap(photo);
      return;
    }
    lastTap.current = { slide, at: now };
    if (!onTap) return;
    const frame = event.currentTarget.querySelector("[data-photo-frame]")?.getBoundingClientRect();
    const x = frame ? (event.clientX - frame.left) / frame.width : NaN;
    const y = frame ? (event.clientY - frame.top) / frame.height : NaN;
    // On the words over the photo is on the words: like a tap off the photo.
    const panel = event.currentTarget.closest("article");
    const onWords =
      panel && keepClearOf(panel).some((el) => isNear(el.getBoundingClientRect(), event.clientX, event.clientY));
    const point = x >= 0 && x <= 1 && y >= 0 && y <= 1 && !onWords ? { x, y } : null;
    const size = frame ? { width: frame.width, height: frame.height } : null;
    single.current = setTimeout(() => onTap(photo, point, size), onDoubleTap ? DOUBLE_TAP_MS : 0);
  };

  // Where the photo on screen sits, for the labels and arrows on it.
  const shown = media[index];
  const place = photoPlace(shown);
  // The arrows, in the middle of the photo's height, but never down under the
  // buttons that reach over a phone's photo (where they start, if they do).
  const middle = `min(calc(${place.top} + ${place.height} / 2), var(--rail-top, 100cqh) - 1.75rem)`;
  const head = `calc(${photoHead(shown)} + 0.5rem)`;
  // The arrows and labels sit just inside the photo's edges, and clear of a
  // notch or a rounded corner (a phone on its side).
  const edge = `max(${place.left} + 0.5rem, env(safe-area-inset-left) + 0.5rem)`;
  const farEdge = `max(100cqw - (${place.left}) - ${place.width} + 0.5rem, env(safe-area-inset-right) + 0.5rem)`;
  // "Kitchen · 3 of 12": what the photo shows, and where it is among them.
  const room = [shown?.ImageOf, media.length > 1 ? `${index + 1} of ${media.length}` : null].filter(Boolean).join(" · ");
  // On a phone on its side the middle of the photo is under the words, so
  // the arrows only show while the keyboard is on them (a swipe turns photos).
  const arrow = cn(
    "absolute z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition-[opacity,visibility] duration-300 disabled:hidden",
    "short:pointer-events-none short:opacity-0 short:focus-visible:pointer-events-auto short:focus-visible:opacity-100",
    !chrome && "invisible opacity-0",
  );

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${address}`}
      onPointerDownCapture={() => setTouched(true)}
      // A press and hold shows the photo alone, not the browser's menu for it.
      onContextMenu={(event) => onHold && event.preventDefault()}
      className="group/carousel absolute inset-0 [container-type:size]"
    >
      {/* What the photos slide across: the whole home on a phone (a swipe
          over the words turns them too); side by side, just the stage, so
          they never pass under the buttons or the white panel. */}
      <div
        ref={emblaRef}
        className="h-full overflow-hidden split:absolute split:inset-y-0 split:left-(--photo-left,0px) split:right-(--photo-right,0px)"
      >
        <div
          className={cn(
            "flex h-full touch-pan-y",
            peek && !touched && "animate-[peek_2.2s_ease-in-out_0.4s_2] motion-reduce:animate-none",
          )}
        >
          {media.map((photo, i) => (
            <div
              key={photo.MediaURL}
              onClick={(event) => tap(event, photo, i)}
              onPointerDown={press}
              onPointerMove={move}
              onPointerUp={release}
              onPointerCancel={release}
              onPointerLeave={release}
              // (Side by side, the slide is the stage: the photo centres in it.)
              className="group/photo relative h-full w-full shrink-0 cursor-pointer select-none overflow-hidden [container-type:size] [-webkit-touch-callout:none] split:[--photo-bottom:var(--stage-photo-bottom)] split:[--photo-left:0px] split:[--photo-right:0px] split:[--photo-top:var(--stage-photo-top)]"
            >
              {/* The same photo, blurred and dimmed, fills the space around it:
                  on a phone, only between the header and the words. Not on
                  a wide screen's stage, where the photo sits on the dark ground. */}
              {!isVideo(photo) && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-(--backdrop-top,0px) bottom-(--backdrop-bottom,0px) overflow-hidden split:hidden"
                >
                  <Image src={photo.MediaURL} alt="" fill sizes="96px" className="scale-125 object-cover opacity-70 blur-2xl" />
                  <div className="absolute inset-0 bg-[rgb(0_0_0/var(--backdrop-shade,0))]" />
                </div>
              )}
              <PhotoBox photo={photo}>
                {isVideo(photo) ? (
                  <ReelVideo src={photo.MediaURL} playing={active && i === index} label={photo.ShortDescription} />
                ) : (
                  <Image
                    src={photo.MediaURL}
                    alt={photo.ShortDescription ?? `${address}, photo ${i + 1}`}
                    fill
                    priority={priority && i === 0}
                    sizes={sizesFor(photo, beside)}
                    draggable={false}
                    className="object-contain"
                  />
                )}
                {/* A double-tap's heart, in the middle of the photo (not of
                    the screen, where the words would hide half of it). */}
                {burst?.slide === i && (
                  <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Heart
                      key={burst.at}
                      size={110}
                      className="fill-rose-500 text-rose-500 opacity-0 drop-shadow-xl animate-[heart-pop_800ms_ease-out]"
                    />
                  </div>
                )}
              </PhotoBox>
            </div>
          ))}
        </div>
      </div>
      {overlay}
      {/* Labels on the photo, in place of dots (which run off the screen
          with 30 photos): the room, and which photo of how many. The live
          line below says it for screen readers. Not on a phone on its side,
          where the words leave no room above them. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none transition-[opacity,visibility] duration-300 short:hidden",
          !chrome && "invisible opacity-0",
        )}
      >
        {room && (
          <p
            style={{ top: head, left: edge }}
            className={cn(glass, "absolute flex h-7 max-w-[60cqw] items-center rounded-full px-2.5 text-meta font-semibold")}
          >
            <span className="min-w-0 truncate">{room}</span>
          </p>
        )}
        {counter && (
          <p
            style={{ top: head, right: farEdge }}
            className={cn(glass, "absolute flex h-7 items-center rounded-full px-2.5 text-meta font-semibold tabular-nums")}
          >
            {counter}
          </p>
        )}
      </div>
      {media.length > 1 && controls && (
        <Filmstrip
          media={media}
          // Under the tallest of them, from the left edge of the widest, so
          // it stays put from photo to photo, lined up with them (less the
          // room a focus ring takes beside the first).
          top={`calc(${photoFoot(most(media, (a, b) => a < b))} + 0.25rem)`}
          left={`calc(${photoPlace(most(media, (a, b) => a > b)).left} - 0.25rem)`}
          index={index}
          likesOf={likesOf}
          onPick={(i) => embla?.scrollTo(i, true)}
          className={cn("transition-[opacity,visibility] duration-300", !chrome && "invisible opacity-0")}
        />
      )}
      {media.length > 1 && (
        <>
          <p className="sr-only" aria-live="polite">
            Photo {index + 1} of {media.length}
          </p>
          {controls && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                disabled={index === 0}
                onClick={() => embla?.scrollPrev()}
                style={{ top: middle, left: edge }}
                className={arrow}
              >
                <ChevronLeft aria-hidden size={24} />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                disabled={index === media.length - 1}
                onClick={() => embla?.scrollNext()}
                style={{ top: middle, right: farEdge }}
                className={arrow}
              >
                <ChevronRight aria-hidden size={24} />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

// The photo shown tallest on the stage (the narrowest for its height:
// `before` is <), or widest (>).
const most = (media: ListingMedia[], before: (ratio: number, than: number) => boolean) =>
  media.reduce<ListingMedia | undefined>((best, photo) => {
    const [ratio, bestRatio] = [ratioOf(photo), ratioOf(best)];
    return ratio && (!bestRatio || before(ratio, bestRatio)) ? photo : best;
  }, undefined) ?? media[0];

// Wide screens: every photo in a row just under the photo, in place of
// swiping blind, the one on screen marked, those people liked marked with a
// count. A click goes straight there.
function Filmstrip({
  media,
  index,
  likesOf,
  onPick,
  top,
  left,
  className,
}: {
  media: ListingMedia[];
  index: number;
  likesOf?: (photo: ListingMedia) => number;
  onPick: (index: number) => void;
  // Where it starts, down and across the stage.
  top: string;
  left: string;
  className?: string;
}) {
  const strip = useRef<HTMLUListElement>(null);
  // The one on screen stays in view as the photos turn.
  useEffect(() => {
    const list = strip.current;
    const item = list?.children[index] as HTMLElement | undefined;
    if (!list || !item || list.clientWidth === 0) return;
    const left = item.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + item.offsetWidth > list.scrollLeft + list.clientWidth) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollTo({ left: left - (list.clientWidth - item.offsetWidth) / 2, behavior: still ? "auto" : "smooth" });
    }
  }, [index]);
  return (
    <div
      style={{ top, left, height: STRIP_HEIGHT }}
      className={cn("absolute right-(--photo-right,0px) hidden split:block", className)}
    >
      <ul
        ref={strip}
        aria-label="Photos"
        className="flex h-full w-max max-w-full items-center gap-2 overflow-x-auto px-1 [scrollbar-width:thin]"
      >
        {media.map((photo, i) => {
          const likes = likesOf?.(photo) ?? 0;
          const name = [
            `Photo ${i + 1}${photo.ImageOf ? `: ${photo.ImageOf}` : ""}`,
            likes > 0 && `${likes} ${likes === 1 ? "like" : "likes"}`,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={photo.MediaURL} className="relative shrink-0">
              <button
                type="button"
                aria-label={name}
                aria-current={i === index ? "true" : undefined}
                onClick={() => onPick(i)}
                className={cn(
                  "relative block h-[72px] w-24 overflow-hidden rounded-lg bg-stone-800 transition-opacity",
                  i !== index && "opacity-60 hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                {isVideo(photo) ? (
                  <Play aria-hidden size={20} className="absolute inset-0 m-auto fill-white text-white" />
                ) : (
                  <Image src={photo.MediaURL} alt="" fill sizes="96px" className="object-contain" />
                )}
                {likes > 0 && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 right-1 flex h-5 items-center gap-0.5 rounded-full bg-black/65 px-1.5 text-tiny font-semibold tabular-nums text-white"
                  >
                    <Heart size={10} strokeWidth={0} className="fill-white" />
                    {likes}
                  </span>
                )}
              </button>
              {/* The one on screen: bright, with a bar under it (not a ring,
                  which is how the keyboard shows where it is). */}
              {i === index && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-[7px] left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-white"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Plays muted and on a loop while on screen, like a reel.
function ReelVideo({ src, playing, label }: { src: string; playing: boolean; label?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (playing) el.play().catch(() => {});
    else el.pause();
  }, [playing]);
  return (
    <video
      ref={video}
      src={src}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
}
