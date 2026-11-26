"use client";

import { ArrowLeft, Link2, Search, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { FollowButton } from "@/app/people/[id]/client";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { avatarColor } from "@/components/ui";
import { cn } from "@/lib/format";
import { placeIn, type ContextWho, type ReelContext } from "@/lib/reel-context";
import { button, focusOnDark, glass, pill } from "@/lib/ui";

// The homes of a feed (yours, someone's page, an agent's client or link)
// full screen, in the feed's order: opened on the one tapped, those before it
// above and the rest below. Each says why it's there, and across the top,
// whose homes these are and how far through them you are ("Maya's highlights
// · 3 of 12"). The address follows the home on screen, so coming back opens
// on it again. Opened from the feed it's on a stage (`contained`) over it,
// closed with its X (or Escape); opened by its address, it fills the screen,
// with Back (or Escape) to the feed. At the end, a stop, and the ways on.
export function OrderedReel({
  query,
  start,
  back,
  siteHeader,
  sender,
  contained = false,
  context = null,
  ...feed
}: Omit<
  ComponentProps<typeof ReelFeed>,
  "header" | "end" | "focus" | "onActiveChange" | "onSend" | "sendBusy" | "contained" | "stageBar"
> & {
  // Which feed, as in the address: "from=feed", "from=<their page's id>&show=comments".
  query: string;
  // The home tapped, to open on.
  start: string | null;
  // Where it came from: "Back to your feed".
  back: { href: string; label: string };
  siteHeader: ReactNode;
  // A signed-in agent, whose share button sends the home to a client.
  sender: { profileComplete: boolean } | null;
  // On a stage over the feed, which closes it.
  contained?: boolean;
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
  // The home on screen, for "3 of 12" and the full page's address.
  const [shown, setShown] = useState<string | null>(begin);

  // Escape goes back, unless it's for something open over the homes. (In a
  // pop-out, the pop-out does that.)
  useEffect(() => {
    if (contained) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector('dialog[open], [popover]:popover-open, [data-spot-card], [aria-label="About this home"][role="region"]:not([hidden])')) return;
      router.push(back.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, back.href, contained]);

  const addressOf = (key: string | null) => {
    const params = new URLSearchParams(query);
    if (key) params.set("home", key);
    return `/reel?${params}`;
  };

  const place = context ? placeIn(context, shown) : null;
  const chip = context ? <ContextChip context={context} place={place} /> : null;

  const reel = {
    ...feed,
    contained,
    focus,
    context,
    onActiveChange: (key: string | null) => {
      // (At the end, still the last home.)
      if (!key) return;
      if (!arrived.current) {
        if (key !== begin) return;
        arrived.current = true;
      }
      setShown(key);
      if (new URL(window.location.href).searchParams.get("home") !== key) {
        window.history.replaceState(null, "", addressOf(key));
      }
    },
    // On the stage, wide: whose homes. (No "Open full page": the page shows
    // the same thing as the pop-out, so there's the one way to look.)
    stageBar: contained ? chip : undefined,
    header: contained ? undefined : (
      <>
        {siteHeader}
        {/* As the map's Back. On a phone, an arrow in a row of its own under
            the header, where a pop-out's close button is, with the take's
            bar beside it saying whose homes these are; the photo starts
            under that row. Side by side, on the photo's stage, at its top
            right, with whose homes these are beside it. */}
        <div
          data-reel-bar
          className="absolute left-3 top-[calc(env(safe-area-inset-top)_+_3.5rem)] flex items-center gap-2 split:left-auto split:right-[480px] split:top-[calc(var(--stage-top)+12px)] split:max-w-[calc(100%-1.5rem)] split-xl:right-[520px]"
        >
          {chip && <div className={cn(glass, "hidden min-h-11 min-w-0 items-center rounded-full pl-1.5 pr-4 split:flex")}>{chip}</div>}
          <Link
            href={back.href}
            // (A round button of its own: on the dark ground, a faint disc
            // with an edge. One colour each: cn doesn't let a second win.)
            className={cn(
              pill("md", { icon: true }),
              "shrink-0 bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15",
              focusOnDark,
              "split:size-auto split:bg-black/60 split:px-4 split:ring-0",
            )}
          >
            <ArrowLeft aria-hidden size={18} /> <span className="sr-only split:not-sr-only">{back.label}</span>
          </Link>
        </div>
      </>
    ),
    end: <EndCard context={context} back={back} contained={contained} onClose={() => router.back()} />,
    // An agent going through a client's homes (or a link's) has the
    // Porchcard: how the home has gone down with everyone, beside what that
    // client made of it (the take above the photo). Everyone else saves homes.
    porchcard: context?.kind === "client" || context?.kind === "share",
  };
  return sender ? <QuickSendReel {...reel} profileComplete={sender.profileComplete} /> : <ReelFeed {...reel} />;
}

// Whose homes these are, to where they came from, and which of them this is:
// "(face) Maya's highlights · 3 of 12".
function ContextChip({ context, place }: { context: ReelContext; place: string | null }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-body">
      <Link
        href={context.href}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-full font-semibold text-white underline-offset-2 hover:underline"
      >
        {context.who && <Face who={context.who} />}
        <span className="truncate">{context.title}</span>
      </Link>
      {place && <span className="shrink-0 whitespace-nowrap text-white/60">· {place}</span>}
    </p>
  );
}

// A face, 32px: their own photo where they've added one, else their initial.
function Face({ who }: { who: ContextWho }) {
  const initial = who.name.trim()[0]?.toUpperCase();
  return who.photo ? (
    // A small square photo of their own, served as it is.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={who.photo} alt="" aria-hidden className="size-8 shrink-0 rounded-full bg-white/10 object-cover" />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-meta font-bold",
        avatarColor(who.agent ? "agent" : initial ? "person" : "anonymous", { dark: true }),
      )}
    >
      {initial}
    </span>
  );
}

// The stop at the end, as what the homes were: all of someone's highlights
// (and Follow them), your feed caught up, every home sent to a client (and
// send them more), today's picks. Then the ways on.
function EndCard({
  context,
  back,
  contained,
  onClose,
}: {
  context: ReelContext | null;
  back: { href: string; label: string };
  contained: boolean;
  onClose: () => void;
}) {
  const light = button({ kind: "light", size: "lg" });
  const quiet = button({ kind: "glass", size: "lg" });
  // Back where it came from. A pop-out only closes, so it says Close and
  // never names a page it isn't going to.
  const close = contained ? (
    <button type="button" onClick={onClose} className={quiet}>
      <X aria-hidden size={17} /> Close
    </button>
  ) : (
    <Link href={back.href} className={quiet}>
      <ArrowLeft aria-hidden size={17} /> {back.label}
    </Link>
  );
  const browse = () => (
    <Link href="/search" className={light}>
      <Search aria-hidden size={17} /> Search homes
    </Link>
  );
  const name = context?.name ?? "";

  // One short heading, then the ways on: nothing between.
  let heading = "That's all";
  let actions: ReactNode = (
    <>
      {browse()}
      {close}
    </>
  );
  if (context?.kind === "person") {
    heading = context.me ? "That's all" : `That's all from ${name}`;
    const follow = !context.me && !context.following && context.who?.profileId;
    actions = (
      <>
        {follow && context.who?.profileId && (
          <FollowButton
            personId={context.who.profileId}
            name={name}
            following={false}
            signIn={context.canFollow ? undefined : `/login?next=${encodeURIComponent(`/people/${context.who.profileId}`)}`}
          />
        )}
        {close}
        {browse()}
      </>
    );
  } else if (context?.kind === "listings") {
    heading = context.me ? "That's all" : `That's all from ${name}`;
    const follow = !context.me && !context.following && context.who?.profileId;
    actions = (
      <>
        {follow && context.who?.profileId && (
          <FollowButton
            personId={context.who.profileId}
            name={name}
            following={false}
            signIn={context.canFollow ? undefined : `/login?next=${encodeURIComponent(`/people/${context.who.profileId}`)}`}
          />
        )}
        {close}
        {browse()}
      </>
    );
  } else if (context?.kind === "feed") {
    heading = "You're all caught up";
    actions = (
      <>
        {browse()}
        {close}
      </>
    );
  } else if (context?.kind === "client" || context?.kind === "share") {
    actions = (
      <>
        {context.shareId && (
          <Link href={`/dashboard/shares/${context.shareId}`} className={light}>
            <Link2 aria-hidden size={17} /> {name ? `Open ${name}'s link` : "Open the link"}
          </Link>
        )}
        {context.shareId && (
          <Link href={`/send?share=${context.shareId}`} className={quiet}>
            <Send aria-hidden size={17} /> {name ? `Send ${name} more` : "Send more homes"}
          </Link>
        )}
        {close}
      </>
    );
  } else if (context?.kind === "pick") {
    actions = (
      <>
        {browse()}
        {close}
      </>
    );
  }
  return (
    <div className="max-w-sm">
      <h2 className="font-display text-2xl">{heading}</h2>
      <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  );
}
