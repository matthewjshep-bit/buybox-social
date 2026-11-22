"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { Hotspot } from "@/components/spot-highlight";
import { cn } from "@/lib/format";
import type { CardPhoto } from "@/lib/profile";
import { glass } from "@/lib/ui";

// A home's photos on a card, to swipe through right there: a sideways swipe
// (the browser's own scrolling, snapping to each photo) goes to the next one,
// a tap opens the home full screen on the photo showing. "2 of 14" says where
// you are; with a mouse, arrows show on hover. Only the photo on screen and
// the next one load; the rest as they're reached. The frame is the size its
// card gives it (`className`, `style`), whatever the photos inside, so
// nothing moves as they turn.

// More than this far, and it was a swipe or a scroll, not a tap.
const SLOP = 8;

// Where a pin sits, in percent of the photo, to a tenth.
const at = ({ x, y }: { x: number; y: number }) => ({
  left: `${Math.round(x * 1000) / 10}%`,
  top: `${Math.round(y * 1000) / 10}%`,
});

export function PhotoSwipe({
  photos,
  total = photos.length,
  href,
  label,
  sizes,
  fit = "cover",
  eager = false,
  compact = false,
  className,
  style,
  children,
}: {
  photos: CardPhoto[];
  // How many photos the home has in all (the card carries only a few).
  total?: number;
  // The home full screen: a tap opens it, on the photo showing (`photo=`).
  href: string;
  // The home's address, to name the photos.
  label: string;
  sizes: string;
  // "cover" fills the frame; "contain" shows each photo whole, at its own
  // shape, with the spots picked out in it.
  fit?: "cover" | "contain";
  // Near the top of the page: the first photo loads straight away.
  eager?: boolean;
  // A thumbnail in a list: the count small, and no arrows (they'd cover it).
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
  // Drawn over the photos, out of the way of a tap (a "Closed" badge).
  children?: ReactNode;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(0);
  // The furthest photo reached, plus one: the ones up to here are loaded.
  const [reach, setReach] = useState(1);
  const press = useRef<{ x: number; y: number; left: number } | null>(null);
  const last = photos.length - 1;
  const more = total > photos.length;

  const sync = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.max(0, Math.min(last, Math.round(el.scrollLeft / el.clientWidth)));
    setShown(i);
    setReach((r) => Math.max(r, i + 1));
  };
  // Back on the page with it scrolled (a restored scroll), it says so.
  useEffect(sync, [last]);

  const urlOf = (photo: CardPhoto) => {
    const url = new URL(href, window.location.href);
    url.searchParams.set("photo", String(photo.index));
    return `${url.pathname}${url.search}`;
  };

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const to = Math.max(0, Math.min(last, i));
    // At either end its arrow goes; the keyboard moves to the other one.
    if (to === last && document.activeElement === next.current) prev.current?.focus();
    if (to === 0 && document.activeElement === prev.current) next.current?.focus();
    setReach((r) => Math.max(r, to + 1));
    // (Smooth, unless they'd rather nothing moved: the scroller's own setting.)
    el.scrollTo({ left: to * el.clientWidth });
  };

  if (photos.length === 0) {
    return (
      <div className={cn("relative", className ?? "bg-stone-100")} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${label}`}
      data-photo-swipe
      className={cn("group/swipe relative z-20 overflow-hidden", className ?? "bg-stone-100")}
      style={style}
    >
      <div
        ref={scroller}
        onScroll={sync}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY, left: scroller.current?.scrollLeft ?? 0 };
        }}
        onClick={(e) => {
          // A swipe, or a scroll of the page that started here, isn't a tap.
          const start = press.current;
          press.current = null;
          if (
            start &&
            (Math.abs(e.clientX - start.x) > SLOP ||
              Math.abs(e.clientY - start.y) > SLOP ||
              Math.abs((scroller.current?.scrollLeft ?? 0) - start.left) > 4)
          ) {
            return;
          }
          const slide = (e.target as Element).closest<HTMLElement>("[data-slide]");
          const photo = photos[Number(slide?.dataset.slide ?? shown)] ?? photos[0];
          const url = urlOf(photo);
          if (e.metaKey || e.ctrlKey || e.shiftKey) window.open(url, "_blank", "noopener");
          else router.push(url);
        }}
        className="flex size-full cursor-pointer snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, i) => {
          const ratio = photo.width && photo.height ? photo.width / photo.height : null;
          const loaded = i <= reach;
          const image = loaded && (
            <Image
              src={photo.url}
              alt={photo.alt}
              fill
              sizes={sizes}
              loading={eager && i === 0 ? "eager" : undefined}
              className={fit === "cover" || ratio ? "object-cover" : "object-contain"}
            />
          );
          return (
            <div
              key={`${photo.index}:${i}`}
              data-slide={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${total}`}
              className="relative size-full shrink-0 snap-center snap-always [container-type:size]"
            >
              {fit === "contain" && ratio ? (
                // The photo whole, at its own shape, in the middle: the spots
                // land where they were picked out.
                <div
                  className="absolute inset-0 m-auto"
                  style={{
                    width: `min(100cqw, calc(100cqh * ${ratio}))`,
                    height: `min(100cqh, calc(100cqw / ${ratio}))`,
                  }}
                >
                  {image}
                  {loaded &&
                    photo.pins?.map((pin, n) => (
                      <span
                        key={n}
                        aria-hidden
                        data-pin={pin.kind}
                        data-newest={(i === 0 && n === 0) || undefined}
                        className="pointer-events-none absolute size-0"
                        style={at(pin)}
                      >
                        <Hotspot small />
                      </span>
                    ))}
                </div>
              ) : (
                image
              )}
              {/* The last photo the card has, of more: the rest are full screen. */}
              {more && i === last && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35">
                  <span
                    className={cn(
                      glass,
                      "rounded-full font-semibold",
                      compact ? "px-2 py-0.5 text-[11px]" : "px-4 py-2 text-body",
                    )}
                  >
                    {compact ? "See all" : `See all ${total} photos`}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {children}
      {photos.length > 1 && (
        <>
          <span
            data-photo-count
            className={cn(
              glass,
              "pointer-events-none absolute rounded-full font-semibold tabular-nums",
              compact ? "bottom-1 right-1 px-1.5 py-px text-[11px]" : "bottom-3 right-3 px-2.5 py-1 text-meta",
            )}
          >
            {shown + 1} of {total}
          </span>
          {/* With a mouse: arrows, on hover. A finger swipes. */}
          {!compact && (
            <>
              <Arrow ref={prev} side="prev" hidden={shown === 0} onClick={() => go(shown - 1)} />
              <Arrow ref={next} side="next" hidden={shown === last} onClick={() => go(shown + 1)} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Arrow({
  ref,
  side,
  hidden,
  onClick,
}: {
  ref: Ref<HTMLButtonElement>;
  side: "prev" | "next";
  hidden: boolean;
  onClick: () => void;
}) {
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={side === "prev" ? "Previous photo" : "Next photo"}
      // (At the end, out of sight and out of the way, but still where the
      // keyboard can't lose its place.)
      aria-disabled={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={hidden ? undefined : onClick}
      className={cn(
        "absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-md ring-1 ring-black/10 transition-opacity pointer-fine:grid",
        side === "prev" ? "left-2" : "right-2",
        hidden
          ? "pointer-events-none opacity-0"
          : "opacity-0 group-hover/swipe:opacity-100 focus-visible:opacity-100",
      )}
    >
      <Icon aria-hidden size={22} />
    </button>
  );
}
