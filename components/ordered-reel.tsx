"use client";

import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// The homes of a feed (yours, or someone's page) full screen, in the feed's
// order: opened on the one tapped, those before it above and the rest below.
// The address follows the home on screen, so coming back opens on it again;
// Back (or Escape) returns to the feed. At the end, the way to more homes.
export function OrderedReel({
  query,
  start,
  back,
  siteHeader,
  sender,
  ...feed
}: Omit<ComponentProps<typeof ReelFeed>, "header" | "end" | "focus" | "onActiveChange" | "onSend" | "sendBusy"> & {
  // Which feed, as in the address: "from=feed", "from=<their page's id>".
  query: string;
  // The home tapped, to open on.
  start: string | null;
  // Where it came from: "Back to your feed".
  back: { href: string; label: string };
  siteHeader: ReactNode;
  // A signed-in agent, whose share button sends the home to a client.
  sender: { profileComplete: boolean } | null;
}) {
  const router = useRouter();
  const has = (key: string | null): key is string =>
    Boolean(key) && feed.initial.some((post) => post.listing.ListingKey === key);
  // Forward to it again, the page comes back on the home that was showing.
  const asked = useSearchParams().get("home");
  const [begin] = useState(() => (has(asked) ? asked : start));
  const [focus] = useState(begin ? { key: begin, n: 0 } : null);
  // The feed starts at the top, then goes to the home tapped: until it gets
  // there, the homes it passes aren't the one on screen.
  const arrived = useRef(!has(begin));

  // Escape goes back, unless it's for something open over the homes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open], [popover]:popover-open, [data-spot-card]")) return;
      router.push(back.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, back.href]);

  const reel = {
    ...feed,
    focus,
    onActiveChange: (key: string | null) => {
      // (At the end, still the last home.)
      if (!key) return;
      if (!arrived.current) {
        if (key !== begin) return;
        arrived.current = true;
      }
      const params = new URLSearchParams(query);
      params.set("home", key);
      if (new URL(window.location.href).searchParams.get("home") !== key) {
        window.history.replaceState(null, "", `/reel?${params}`);
      }
    },
    header: (
      <>
        {siteHeader}
        {/* As the map's Back: on the photo's stage, at its top right. */}
        <Link
          href={back.href}
          className={cn(
            button({ kind: "glass" }),
            "absolute right-3 top-[calc(env(safe-area-inset-top)_+_3.75rem)] sm:right-6 split:right-[480px] split:top-[calc(var(--stage-top)+12px)] split-xl:right-[520px]",
          )}
        >
          <ArrowLeft aria-hidden size={16} /> {back.label}
        </Link>
      </>
    ),
    end: (
      <div className="max-w-sm">
        <h2 className="font-display text-2xl">That&apos;s every home here</h2>
        <p className="mt-2 text-white/80">Keep going with homes picked for you, or go back.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/reel" className={button({ kind: "light", size: "lg" })}>
            <Compass aria-hidden size={17} /> Browse homes
          </Link>
          <Link href={back.href} className={button({ kind: "glass", size: "lg" })}>
            <ArrowLeft aria-hidden size={17} /> {back.label}
          </Link>
        </div>
      </div>
    ),
  };
  return sender ? <QuickSendReel {...reel} profileComplete={sender.profileComplete} /> : <ReelFeed {...reel} />;
}
