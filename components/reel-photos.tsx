"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";

const isVideo = (photo: ListingMedia) =>
  photo.MediaCategory === "Video" || /\.(mp4|webm|mov)(\?|$)/i.test(photo.MediaURL);

// A home's photos (and videos) filling the screen, swiped sideways. Listing
// photos are landscape, so each shows whole over a blurred copy of itself
// rather than cropped to a sliver. Double-tap likes, with a heart.
export function ReelPhotos({
  media,
  address,
  active,
  priority,
  onIndexChange,
  onDoubleTap,
  spots,
}: {
  media: ListingMedia[];
  address: string;
  // On screen now: the photo drifts and videos play.
  active: boolean;
  priority?: boolean;
  onIndexChange?: (index: number) => void;
  onDoubleTap?: (photo: ListingMedia) => void;
  // Drawn over the photo itself, positioned in fractions of it (like-able spots).
  spots?: (photo: ListingMedia) => ReactNode;
}) {
  const [emblaRef, embla] = useEmblaCarousel();
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

  const tap = (event: MouseEvent, photo: ListingMedia, slide: number) => {
    if (!onDoubleTap || (event.target as HTMLElement).closest("button, a, video")) return;
    const now = event.timeStamp;
    if (lastTap.current?.slide === slide && now - lastTap.current.at < 350) {
      lastTap.current = null;
      setBurst({ slide, at: now });
      onDoubleTap(photo);
    } else {
      lastTap.current = { slide, at: now };
    }
  };

  return (
    <div role="group" aria-roledescription="carousel" aria-label={`Photos of ${address}`} className="absolute inset-0">
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full touch-pan-y">
          {media.map((photo, i) => (
            <div
              key={photo.MediaURL}
              onClick={(event) => tap(event, photo, i)}
              className="relative h-full w-full shrink-0 select-none overflow-hidden [container-type:size]"
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
              ) : (
                <PhotoFrame photo={photo}>
                  <Image
                    key={active && i === index ? "on" : "off"}
                    src={photo.MediaURL}
                    alt={photo.ShortDescription ?? `${address}, photo ${i + 1}`}
                    fill
                    priority={priority && i === 0}
                    sizes="100vw"
                    className={cn(
                      "object-contain object-[50%_38%] lg:object-center",
                      active && i === index && "animate-[ken-burns_9s_ease-out_forwards] motion-reduce:animate-none",
                    )}
                  />
                  {/* Only the photo on screen: a spot on another can't be reached by accident. */}
                  {i === index && spots?.(photo)}
                </PhotoFrame>
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
      {media.length > 1 && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] flex justify-center gap-1.5"
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
          <button
            type="button"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => embla?.scrollPrev()}
            className="absolute left-2 top-[30%] z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm disabled:hidden lg:left-6 lg:top-1/2 lg:size-12"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            disabled={index === media.length - 1}
            onClick={() => embla?.scrollNext()}
            className="absolute right-2 top-[30%] z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm disabled:hidden lg:right-24 lg:top-1/2 lg:size-12"
          >
            <ChevronRight aria-hidden size={22} />
          </button>
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

// A box exactly the size and place of the photo as shown (whole, letterboxed
// over its blurred copy), so anything inside can point at a spot in the photo.
// It fits between the header and the caption, so neither covers the photo.
// Photos without a known size simply fill the slide.
function PhotoFrame({ photo, children }: { photo: ListingMedia; children: ReactNode }) {
  if (!photo.ImageWidth || !photo.ImageHeight) return <div className="absolute inset-0">{children}</div>;
  const ratio = photo.ImageWidth / photo.ImageHeight;
  const room = "(100cqh - var(--photo-top) - var(--photo-bottom))";
  const width = `min(100cqw, ${room} * ${ratio})`;
  const height = `min(${room}, 100cqw / ${ratio})`;
  return (
    <div
      className="absolute [--photo-bottom:15rem] [--photo-top:4.5rem] lg:[--photo-bottom:12.5rem] lg:[--photo-top:4rem]"
      style={{
        width,
        height,
        left: `calc((100cqw - ${width}) / 2)`,
        top: `calc(var(--photo-top) + (${room} - ${height}) / 2)`,
      }}
    >
      {children}
    </div>
  );
}
