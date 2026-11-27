"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { cn } from "@/lib/format";
import { glass } from "@/lib/ui";

// Several homes on one card, to swipe through, as a post with a few photos
// is: a sideways swipe (the browser's own scrolling, snapping to each) goes
// to the next home, a tap opens the home showing full screen. Each home is a
// little narrower than the card, so the next one's photo shows at the edge
// (it reads as several homes at a glance, never as one home's photos), and
// "2 of 3 homes" says where you are; with a mouse, arrows show on hover.
// Each slide carries the home's first photo and, over its foot, its price
// and street, so the home is named where it's shown. `onShown` says which
// home is showing, for the facts and the bar under the card.

export type SwipeHome = {
  key: string;
  href: string;
  address: string;
  price?: number;
  photo: { url: string; alt: string; width?: number; height?: number } | null;
};

// "$725K", "$1.58M": short, over a photo.
const priceWords = (price: number) =>
  price >= 1_000_000 ? `$${Number((price / 1_000_000).toFixed(2))}M` : `$${Math.round(price / 1000)}K`;

// More than this far, and it was a swipe or a scroll, not a tap.
const SLOP = 8;

export function HomeSwipe({
  homes,
  label,
  sizes,
  onShown,
  className,
  style,
}: {
  homes: SwipeHome[];
  // Whose post, to name the carousel.
  label: string;
  sizes: string;
  onShown?: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(0);
  const [reach, setReach] = useState(1);
  const press = useRef<{ x: number; y: number; left: number } | null>(null);
  const last = homes.length - 1;

  // Where each home starts, as far as it can be scrolled to (the last one
  // lines up with the card's right edge).
  const stops = () => {
    const el = scroller.current;
    if (!el) return [];
    const most = el.scrollWidth - el.clientWidth;
    return [...el.querySelectorAll<HTMLElement>("[data-slide]")].map((slide) => Math.min(most, slide.offsetLeft - el.offsetLeft));
  };
  const sync = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const at = stops();
    let i = 0;
    for (const [n, left] of at.entries()) if (Math.abs(left - el.scrollLeft) < Math.abs(at[i] - el.scrollLeft)) i = n;
    i = Math.max(0, Math.min(last, i));
    setShown(i);
    setReach((r) => Math.max(r, i + 1));
  };
  useEffect(sync, [last]);
  useEffect(() => onShown?.(shown), [shown, onShown]);

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const to = Math.max(0, Math.min(last, i));
    if (to === last && document.activeElement === next.current) prev.current?.focus();
    if (to === 0 && document.activeElement === prev.current) next.current?.focus();
    setReach((r) => Math.max(r, to + 1));
    el.scrollTo({ left: stops()[to] ?? 0 });
  };

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Homes in ${label}`}
      data-home-swipe
      className={cn("group/swipe relative z-20 overflow-hidden bg-stone-100", className)}
      style={style}
    >
      <div
        ref={scroller}
        onScroll={sync}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY, left: scroller.current?.scrollLeft ?? 0 };
        }}
        onClick={(e) => {
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
          const home = homes[Number(slide?.dataset.slide ?? shown)] ?? homes[0];
          if (e.metaKey || e.ctrlKey || e.shiftKey) window.open(home.href, "_blank", "noopener");
          else router.push(home.href);
        }}
        className={cn(
          "flex size-full cursor-pointer snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden",
          homes.length > 1 && "gap-1 bg-white",
        )}
      >
        {homes.map((home, i) => (
          <div
            key={home.key}
            data-slide={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${home.address}, ${i + 1} of ${homes.length}`}
            className={cn(
              "relative h-full shrink-0 snap-always overflow-hidden bg-stone-100",
              homes.length > 1 ? "w-[calc(100%-3.25rem)] snap-start last:snap-end sm:w-[calc(100%-5rem)]" : "w-full snap-center",
            )}
          >
            {home.photo && i <= reach && <Image src={home.photo.url} alt={home.photo.alt} fill sizes={sizes} className="object-cover" />}
            {/* The home named where it's shown: price and street over the photo's foot. */}
            <span
              className={cn(
                glass,
                "pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full px-3 py-1 text-meta font-semibold",
              )}
            >
              {home.price ? `${priceWords(home.price)} · ` : ""}
              {home.address.split(",")[0]}
            </span>
          </div>
        ))}
      </div>
      {homes.length > 1 && (
        <>
          <span
            data-home-count
            className={cn(glass, "pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-meta font-semibold tabular-nums")}
          >
            {shown + 1} of {homes.length} homes
          </span>
          <Arrow ref={prev} side="prev" hidden={shown === 0} onClick={() => go(shown - 1)} />
          <Arrow ref={next} side="next" hidden={shown === last} onClick={() => go(shown + 1)} />
        </>
      )}
    </div>
  );
}

function Arrow({ ref, side, hidden, onClick }: { ref: Ref<HTMLButtonElement>; side: "prev" | "next"; hidden: boolean; onClick: () => void }) {
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={side === "prev" ? "Previous home" : "Next home"}
      aria-disabled={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={hidden ? undefined : onClick}
      className={cn(
        "absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-md ring-1 ring-black/10 transition-opacity pointer-fine:grid pointer-coarse:grid",
        side === "prev" ? "left-2" : "right-2",
        hidden ? "pointer-events-none opacity-0" : "opacity-0 group-hover/swipe:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-90",
      )}
    >
      <Icon aria-hidden size={22} />
    </button>
  );
}
