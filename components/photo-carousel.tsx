"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";

export function PhotoCarousel({
  media,
  address,
  priority = false,
  fillHeight = false,
}: {
  media: ListingMedia[];
  address: string;
  priority?: boolean;
  // On wide screens, stretch to the height of the parent instead of 4:3.
  fillHeight?: boolean;
}) {
  const [emblaRef, embla] = useEmblaCarousel();
  const [index, setIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (embla) setIndex(embla.selectedScrollSnap());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    embla.on("select", onSelect);
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla, onSelect]);

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${address}`}
      className={cn("group relative bg-stone-200", fillHeight && "lg:h-full")}
    >
      <div ref={emblaRef} className={cn("overflow-hidden", fillHeight && "lg:h-full")}>
        <div className={cn("flex touch-pan-y", fillHeight && "lg:h-full")}>
          {media.map((photo, i) => (
            <div
              key={photo.MediaURL}
              className={cn("relative aspect-[4/3] w-full shrink-0", fillHeight && "lg:aspect-auto lg:h-full")}
            >
              <Image
                src={photo.MediaURL}
                alt={photo.ShortDescription ?? `${address}, photo ${i + 1}`}
                fill
                priority={priority && i === 0}
                sizes={fillHeight ? "(max-width: 1024px) 100vw, 720px" : "(max-width: 640px) 100vw, 576px"}
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
      {media.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => embla?.scrollPrev()}
            className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow disabled:hidden"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            disabled={index === media.length - 1}
            onClick={() => embla?.scrollNext()}
            className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow disabled:hidden"
          >
            <ChevronRight aria-hidden size={22} />
          </button>
          <p
            aria-live="polite"
            className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white"
          >
            {index + 1} / {media.length}
          </p>
        </>
      )}
    </div>
  );
}
