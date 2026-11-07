"use client";

import { ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/format";
import { glass } from "@/lib/ui";

// The first time someone opens an agent's link, two gentle nudges show how it
// works: swipe sideways through a home's photos, then move on to the next
// home. Each goes once it's been done, and stays gone on this device.

export type Nudge = "photos" | "next";

const STORAGE = "buybox:nudges";

type Learned = Partial<Record<Nudge, boolean>>;

function readLearned(): Learned {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Learned;
  } catch {
    return {};
  }
}

function remember(nudge: Nudge) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ ...readLearned(), [nudge]: true }));
  } catch {
    // Storage can be off (a private window); the nudge just shows next time too.
  }
}

export function useNudges({
  enabled,
  home,
  photoCount,
  hasNext,
}: {
  enabled: boolean;
  // The home on screen, if any.
  home: string | null;
  photoCount: number;
  // Whether another home follows this one.
  hasNext: boolean;
}) {
  // What this device already knows. Nothing shows until a timer below fires,
  // so the server's render (no storage) and the first render here agree.
  const [learned] = useState(readLearned);
  const [firstHome, setFirstHome] = useState<string | null>(null);
  const [swipes, setSwipes] = useState(0);
  const [shown, setShown] = useState<{ nudge: Nudge; home: string } | null>(null);

  // Leaving the first home they land on means they know how to move on.
  if (enabled && home && firstHome === null) setFirstHome(home);
  const movedOn = firstHome !== null && home !== firstHome;
  const swiped = swipes > 0;

  const due: Nudge | null =
    !enabled || !home
      ? null
      : !(learned.photos || swiped) && photoCount > 1
        ? "photos"
        : !(learned.next || movedOn) && hasNext
          ? "next"
          : null;

  // Each waits a moment so the home shows first; the one to move on waits
  // until they've stopped swiping through photos.
  useEffect(() => {
    if (!due || !home) return;
    const timer = setTimeout(() => setShown({ nudge: due, home }), due === "photos" ? 900 : 1800);
    return () => clearTimeout(timer);
  }, [due, home, swipes]);

  useEffect(() => {
    if (swiped) remember("photos");
  }, [swiped]);
  useEffect(() => {
    if (movedOn) remember("next");
  }, [movedOn]);

  return {
    showing: due && shown?.nudge === due && shown.home === home ? due : null,
    onSwipe: useCallback(() => setSwipes((n) => n + 1), []),
  };
}

// Drawn over the photo: centred on it for the photos, and just under it for
// the next home. It never takes a touch, so the gesture it shows still works.
export function NudgeHint({ nudge }: { nudge: Nudge }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-(--photo-left,0px) right-(--photo-right,0px) top-(--photo-top) bottom-(--photo-bottom) z-10 flex justify-center px-4",
        nudge === "photos" ? "items-center" : "items-end pb-3",
      )}
    >
      <p
        key={nudge}
        data-nudge={nudge}
        className={cn(glass, "flex items-center gap-1.5 rounded-full py-2 pl-4 pr-3 text-sm font-semibold shadow-lg animate-[nudge-in_450ms_ease-out_both]")}
      >
        {nudge === "photos" ? (
          <>
            {/* A mouse or trackpad has the arrows on the photo too. */}
            <span>
              Swipe for more photos<span className="hidden pointer-fine:inline">, or use the arrows</span>
            </span>
            <ChevronRight size={18} strokeWidth={2.5} className="animate-[nudge-right_1.4s_ease-in-out_3]" />
          </>
        ) : (
          <>
            {/* Phones swipe up; a mouse or trackpad scrolls down. */}
            <ArrowUp size={16} strokeWidth={2.5} className="animate-[nudge-up_1.4s_ease-in-out_3] pointer-fine:hidden" />
            <ChevronDown
              size={18}
              strokeWidth={2.5}
              className="hidden animate-[nudge-down_1.4s_ease-in-out_3] pointer-fine:block"
            />
            <span className="pointer-fine:hidden">Swipe up for the next home</span>
            <span className="hidden pointer-fine:inline">Scroll for the next home</span>
          </>
        )}
      </p>
    </div>
  );
}
