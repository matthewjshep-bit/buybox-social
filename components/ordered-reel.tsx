"use client";

import { ArrowLeft, Compass, Link2, Maximize2, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { FollowButton } from "@/app/people/[id]/client";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { avatarColor } from "@/components/ui";
import { cn } from "@/lib/format";
import { placeIn, type ContextWho, type ReelContext } from "@/lib/reel-context";
import { button, glass } from "@/lib/ui";

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
      if (document.querySelector("dialog[open], [popover]:popover-open, [data-spot-card]")) return;
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
    // On the stage, wide: whose homes, and the same homes on a page of their
    // own (a plain link, so the page loads whole rather than in the pop-out).
    stageBar: contained ? (
      <>
        {chip}
        <a
          href={addressOf(shown)}
          className="ml-auto flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Maximize2 aria-hidden size={16} /> Open full page
        </a>
      </>
    ) : undefined,
    header: contained ? undefined : (
      <>
        {siteHeader}
        {/* As the map's Back: on the photo's stage, at its top right, with
            whose homes these are beside it (side by side; on a phone, the
            take over the photo says so). */}
        <div className="absolute right-3 top-[calc(env(safe-area-inset-top)_+_3.75rem)] flex max-w-[calc(100%-1.5rem)] items-center gap-2 sm:right-6 split:right-[480px] split:top-[calc(var(--stage-top)+12px)] split-xl:right-[520px]">
          {chip && <div className={cn(glass, "hidden min-h-11 min-w-0 items-center rounded-full pl-1.5 pr-4 split:flex")}>{chip}</div>}
          <Link href={back.href} className={cn(button({ kind: "glass" }), "shrink-0")}>
            <ArrowLeft aria-hidden size={16} /> {back.label}
          </Link>
        </div>
      </>
    ),
    end: <EndCard context={context} back={back} contained={contained} onClose={() => router.back()} />,
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
  // Back where it came from: in a pop-out, closing it.
  const backTo = contained ? (
    <button type="button" onClick={onClose} className={quiet}>
      <ArrowLeft aria-hidden size={17} /> {back.label}
    </button>
  ) : (
    <Link href={back.href} className={quiet}>
      <ArrowLeft aria-hidden size={17} /> {back.label}
    </Link>
  );
  const close = contained ? (
    <button type="button" onClick={onClose} className={quiet}>
      <X aria-hidden size={17} /> Close
    </button>
  ) : (
    backTo
  );
  const browse = (label = "Browse homes") => (
    <Link href="/reel" className={light}>
      <Compass aria-hidden size={17} /> {label}
    </Link>
  );
  const n = context?.keys.length ?? 0;
  const name = context?.name ?? "";

  let heading = "That's every home here";
  let line: string | null = "Keep going with homes picked for you, or go back.";
  let actions: ReactNode = (
    <>
      {browse()}
      {close}
    </>
  );
  if (context?.kind === "person") {
    heading = context.me
      ? "That's everything on your page"
      : context.show === "comments"
        ? `That's every home ${name} commented on`
        : context.show === "liked"
          ? `That's every home ${name} liked`
          : context.show === "passed"
            ? `That's every home ${name} passed on`
            : context.filter
              ? `That's everything on ${name}'s page about the ${context.filter.toLowerCase()}`
              : n <= 1
                ? `That's ${name}'s only highlight`
                : `That's all ${n} of ${name}'s highlights`;
    const follow = !context.me && !context.following && context.who?.profileId;
    line = follow ? `Follow ${name} and what they like comes to your feed first.` : "Keep going with homes picked for you.";
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
        {backTo}
        {browse()}
      </>
    );
  } else if (context?.kind === "feed") {
    heading = "You're all caught up";
    line = "That's everything from the people you follow, for now.";
    actions = (
      <>
        {browse("Browse homes picked for you")}
        {close}
      </>
    );
  } else if (context?.kind === "client" || context?.kind === "share") {
    heading = name ? `That's every home you sent ${name}` : "That's every home on this link";
    line = null;
    actions = (
      <>
        {context.shareId && (
          <Link href={`/dashboard/shares/${context.shareId}`} className={light}>
            <Link2 aria-hidden size={17} /> {name ? `Open ${name}'s link` : "Open the link"}
          </Link>
        )}
        {context.shareId && (
          <Link href={`/dashboard/new?share=${context.shareId}`} className={quiet}>
            <Send aria-hidden size={17} /> {name ? `Send ${name} more` : "Send more homes"}
          </Link>
        )}
        {contained ? close : backTo}
      </>
    );
  } else if (context?.kind === "pick") {
    heading = "That's today's picks";
    line = "There's more where those came from.";
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
      {line && <p className="mt-2 text-white/80">{line}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  );
}
