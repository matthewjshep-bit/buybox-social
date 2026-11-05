"use client";

import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";

// The clear space between the words at the top and those at the bottom, set by
// the page as `--photo-top` and `--photo-bottom` (in units of the slide, or the
// carousel, it's measured in).
const TOP = "var(--photo-top, 4.5rem)";
const BOTTOM = "var(--photo-bottom, 14.5rem)";
const CLEAR = `(100cqh - ${TOP} - ${BOTTOM})`;
// Where in that space it sits: 0 at the top, 0.5 in the middle.
const ALIGN = "var(--photo-align, 0.5)";

const ratioOf = (photo: ListingMedia | undefined) =>
  photo?.ImageWidth && photo?.ImageHeight ? photo.ImageWidth / photo.ImageHeight : null;

// Where a photo goes: as big as it can be, whole, never cropped. It sits in the
// clear space when it fits there (a landscape photo on a phone), and grows past
// it, under the words, when there's room to show more of it (a wide screen), as
// far as the whole height of the screen. Measured against the nearest box with
// `container-type: size`.
function placement(photo: ListingMedia | undefined) {
  const ratio = ratioOf(photo);
  const width = ratio ? `min(100cqw, 100cqh * ${ratio})` : "100cqw";
  const height = ratio ? `min(100cqh, 100cqw / ${ratio})` : "100cqh";
  const top = `clamp(0px, ${TOP} + (${CLEAR} - ${height}) * ${ALIGN}, 100cqh - ${height})`;
  return { width, height, top, left: `(100cqw - ${width}) / 2` };
}

// Along the bottom of the photo, or of the clear space when the photo goes on
// under the words: where the dots go, and anything that sits with them.
export const photoFoot = (photo: ListingMedia | undefined) => {
  const place = placement(photo);
  return `min(${place.top} + ${place.height}, 100cqh - ${BOTTOM})`;
};

// A box exactly the size and place of the photo as shown (whole, letterboxed
// over its blurred copy), so anything inside can point at a spot in the photo
// in fractions of it. Inside the carousel, or in a layer of the same size over
// it (with `container-type: size`) to draw over the words on top.
export function PhotoBox({ photo, children, className }: { photo: ListingMedia | undefined; children?: ReactNode; className?: string }) {
  const place = placement(photo);
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
}) {
  // Each carousel needs its own plugin; a sideways trackpad swipe turns the
  // photos, while an up-and-down one still scrolls between homes.
  const [plugins] = useState(() => [WheelGesturesPlugin()]);
  const [emblaRef, embla] = useEmblaCarousel({}, plugins);
  const [touched, setTouched] = useState(false);
  const [index, setIndex] = useState(0);
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

  useEffect(() => {
    if (embla && show) embla.scrollTo(show.index, true);
    // Only a new request should move the photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embla, show?.n]);

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

  // Where the photo on screen sits, for the dots and arrows over it.
  const shown = media[index];
  const place = placement(shown);
  const middle = `calc(${place.top} + ${place.height} / 2)`;
  const dots = `calc(${photoFoot(shown)} - 1.1rem)`;
  // The arrows sit just inside the photo's edges.
  const edge = `calc(${place.left} + 0.75rem)`;

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
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div
          className={cn(
            "flex h-full touch-pan-y",
            peek && !touched && "animate-[peek_2.6s_ease-in-out_0.4s_2] motion-reduce:animate-none",
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
              className="group/photo relative h-full w-full shrink-0 cursor-pointer select-none overflow-hidden [container-type:size] [-webkit-touch-callout:none]"
            >
              {/* The same photo, blurred, fills the space around it. */}
              {!isVideo(photo) && (
                <Image
                  src={photo.MediaURL}
                  alt=""
                  aria-hidden
                  fill
                  sizes="96px"
                  className="scale-125 object-cover opacity-70 blur-2xl"
                />
              )}
              {isVideo(photo) ? (
                <ReelVideo src={photo.MediaURL} playing={active && i === index} label={photo.ShortDescription} />
              ) : photo.ImageWidth && photo.ImageHeight ? (
                <PhotoBox photo={photo}>
                  <Image
                    src={photo.MediaURL}
                    alt={photo.ShortDescription ?? `${address}, photo ${i + 1}`}
                    fill
                    priority={priority && i === 0}
                    sizes="100vw"
                    draggable={false}
                    className="object-contain"
                  />
                </PhotoBox>
              ) : (
                // Without a known size, it fills the slide.
                <div data-photo-frame className="absolute inset-0">
                  <Image
                    src={photo.MediaURL}
                    alt={photo.ShortDescription ?? `${address}, photo ${i + 1}`}
                    fill
                    priority={priority && i === 0}
                    sizes="100vw"
                    draggable={false}
                    className="object-contain"
                  />
                </div>
              )}
              {burst?.slide === i && (
                <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Heart
                    key={burst.at}
                    size={110}
                    className="fill-rose-500 text-rose-500 opacity-0 drop-shadow-xl animate-[heart-pop_800ms_ease-out]"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {overlay}
      {media.length > 1 && (
        <>
          <div
            aria-hidden
            style={{ top: dots }}
            className="pointer-events-none absolute inset-x-0 flex justify-center gap-1.5"
          >
            {media.map((photo, i) => (
              <span
                key={photo.MediaURL}
                className={cn(
                  "h-1 rounded-full bg-white shadow transition-all",
                  i === index ? "w-5 opacity-100" : "w-1.5 opacity-60",
                )}
              />
            ))}
          </div>
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
                className="absolute z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm disabled:hidden lg:size-11"
              >
                <ChevronLeft aria-hidden size={22} />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                disabled={index === media.length - 1}
                onClick={() => embla?.scrollNext()}
                style={{ top: middle, right: edge }}
                className="absolute z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm disabled:hidden lg:size-11"
              >
                <ChevronRight aria-hidden size={22} />
              </button>
            </>
          )}
        </>
      )}
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
