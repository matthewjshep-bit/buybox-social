"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CountBadge } from "@/components/ui";

// A place in the bar with a count of what's new on its icon (Messages, the
// bell), and its name for a screen reader with the count in it
// ("Notifications, 7 new"). The bar is drawn once for every page, so the
// count it was given can be out of date: on the page that clears it
// (`clearOn`, the bell's own page) it's gone at once, and it stays gone on
// the way to other pages until the server draws the bar again (`rendered`,
// when it was drawn), with a count that's up to date, whatever it is.
// (The page's own highlighting of what's new is left as it was.)

// When each count was cleared, by the bar it was cleared on: kept while the
// app is open, so a bar put away and back (a full-screen page) remembers.
const clearedFor = new Map<string, number>();

export function NavCount({
  icon,
  count,
  label,
  clearOn,
  rendered,
  ring = "white",
}: {
  icon: ReactNode;
  count: number;
  label: string;
  clearOn?: string;
  // When the server drew the bar this count came with (with `clearOn`).
  rendered?: number;
  ring?: "white" | "none";
}) {
  const pathname = usePathname();
  const here = clearOn !== undefined && pathname === clearOn;
  const [clearedAt, setClearedAt] = useState<number | null>(() => (clearOn ? (clearedFor.get(clearOn) ?? null) : null));
  if (here && rendered !== undefined && clearedAt !== rendered) setClearedAt(rendered);
  useEffect(() => {
    if (clearOn && clearedAt !== null) clearedFor.set(clearOn, clearedAt);
  }, [clearOn, clearedAt]);
  const shown = here || (clearedAt !== null && clearedAt === rendered) ? 0 : count;
  return (
    <>
      <span className="relative">
        {icon}
        <CountBadge count={shown} ring={ring} className="-right-2.5 -top-1.5" />
      </span>
      <span className="sr-only">{shown > 0 ? `${label}, ${shown} new` : label}</span>
    </>
  );
}
