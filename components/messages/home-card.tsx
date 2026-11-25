"use client";

import { DoorOpen, Eye, Heart, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, HomeThumb } from "@/components/ui";
import { cn, formatPrice, timeAgo, whenWords } from "@/lib/format";
import type { CommentItem, HomesItem, MessageItem, ThreadHome, ThreadPerson } from "@/lib/messages";

// One send, as a message in the conversation: who sent it and when, their
// note, then each home as a card (its photo, price and address; a tap opens
// it), with what's happened to it in a line under it (opened and for how
// long, who liked it or passed, who asked to see it). What's said about a
// home is a bubble of its own in the conversation (CommentMessage), not
// something inside the card. The viewer's own sends sit to the right, like
// their messages on a phone.

// "45 sec", "3 min", "1 hr 5 min": time spent, for the sender (as lib/shares says it).
function duration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ""}`;
}

export function HomesMessage({
  item,
  viewerIsAgent,
  onReply,
}: {
  item: HomesItem;
  viewerIsAgent: boolean;
  // Reply under a home: the box at the foot answers about that home.
  onReply?: (home: ThreadHome) => void;
}) {
  const n = item.homes.length;
  // The home full screen: the viewer's own link (what they were sent), or,
  // for an agent who sent it, the homes in the pop-out, as their link page has them.
  const open = (home: ThreadHome) =>
    item.mine && viewerIsAgent
      ? `/reel?${new URLSearchParams({ from: `share:${item.shareId}`, home: home.key })}`
      : `/s/${item.token}?home=${encodeURIComponent(home.key)}`;
  return (
    <li id={`send-${item.shareId}`} className={cn("flex flex-col gap-2", item.mine ? "items-end" : "items-start")}>
      <p className="flex items-center gap-2 px-1 text-meta text-muted">
        {!item.mine && <Avatar name={item.by.name} photo={item.by.photo} tone={item.by.agent ? "agent" : "person"} size={6} />}
        <span>
          <span className="font-semibold text-ink">{item.mine ? "You" : item.by.name}</span> sent {n} {n === 1 ? "home" : "homes"}
          {" · "}
          <time dateTime={item.at} suppressHydrationWarning>
            {timeAgo(item.at)}
          </time>
        </span>
      </p>
      {item.welcome && (
        <p
          className={cn(
            "max-w-[85%] whitespace-pre-line break-words rounded-2xl px-4 py-2.5 text-body leading-snug",
            item.mine ? "bg-brand text-white" : "bg-stone-100 text-ink",
          )}
        >
          {item.welcome}
        </p>
      )}
      <ul className={cn("flex w-full max-w-[36rem] flex-col gap-3", item.mine && "items-end")}>
        {item.homes.map((home) => (
          <li key={home.key} id={home.anchor} className="w-full">
            <HomeCard home={home} href={open(home)} mine={item.mine} sender={item.mine} onReply={onReply && (() => onReply(home))} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function HomeCard({
  home,
  href,
  mine,
  sender,
  onReply,
}: {
  home: ThreadHome;
  href: string;
  mine: boolean;
  // The viewer sent it: opens and time spent are theirs to see.
  sender: boolean;
  onReply?: () => void;
}) {
  const likes = home.takes.filter((take) => take.verdict === "like");
  const passes = home.takes.filter((take) => take.verdict === "pass");
  const who = (takes: typeof home.takes) =>
    takes.length === 1 && takes[0].mine ? "You" : takes.map((take) => (take.mine ? "you" : take.name)).join(", ");
  const chip = "inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-meta font-semibold";
  return (
    <div className={cn("overflow-hidden rounded-2xl ring-1", mine ? "bg-brand/[0.07] ring-brand/20" : "bg-stone-100 ring-stone-200")}>
      <Link href={href} className="flex items-center gap-3 p-2.5 hover:bg-black/[0.03]">
        <HomeThumb src={home.photo} sizes="96px" className="size-20 shrink-0 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl font-semibold leading-tight">{formatPrice(home.price)}</span>
          <span className="block truncate text-body text-stone-700">{home.address}</span>
          <span className="block truncate text-meta text-muted">{home.city}</span>
        </span>
      </Link>
      {/* What's happened to it, in one line of chips, and Reply beside them. */}
      {(sender || likes.length > 0 || passes.length > 0 || home.asked.length > 0 || onReply) && (
        <div className="flex flex-wrap items-center gap-1 px-2.5 pb-1.5">
          {sender &&
            (home.opened ? (
              <span className={cn(chip, "bg-white/70 text-emerald-800")}>
                <Eye aria-hidden size={13} />
                Opened{home.seconds > 0 && ` · ${duration(home.seconds)}`}
              </span>
            ) : (
              <span className={cn(chip, "bg-white/70 text-stone-600")}>Not opened yet</span>
            ))}
          {likes.length > 0 && (
            <span className={cn(chip, "bg-rose-50 text-rose-900 ring-1 ring-rose-200")}>
              <Heart aria-hidden size={13} className="fill-current" />
              {who(likes)} liked it
            </span>
          )}
          {passes.length > 0 && (
            <span className={cn(chip, "bg-amber-50 text-amber-900 ring-1 ring-amber-200")}>
              <X aria-hidden size={13} strokeWidth={2.5} />
              {who(passes)} passed
            </span>
          )}
          {home.asked.map((ask) => (
            <span key={ask.at} suppressHydrationWarning className={cn(chip, "bg-amber-100 text-amber-900")}>
              <DoorOpen aria-hidden size={13} />
              {ask.mine ? "You asked" : `${ask.name} asked`} to see it · {whenWords(new Date(ask.at))}
            </span>
          ))}
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="ml-auto flex min-h-11 min-w-11 items-center justify-center px-2.5 text-meta font-semibold text-brand hover:underline"
            >
              Reply<span className="sr-only"> about {home.address}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A message about no home in particular: a bubble, the viewer's own on the
// right in the site's blue, anyone else's on the left, their face beside it.
export function MessageBubble({ item }: { item: MessageItem }) {
  return (
    <li id={`message-${item.id}`} className={cn("flex flex-col", item.mine ? "items-end" : "items-start")}>
      <Bubble mine={item.mine} by={item.by} at={item.at}>
        {item.body}
      </Bubble>
    </li>
  );
}

// A word about one of the homes: the same bubble, with the home it's about
// quoted above it (its photo and street, a tap to the home's card), as a
// reply to a story is on a phone. `quote`: off when the word before it was
// about the same home, from the same side (said once over the run).
export function CommentMessage({ item, quote = true }: { item: CommentItem; quote?: boolean }) {
  const street = item.about.address.split(",")[0];
  return (
    <li id={`comment-${item.id}`} className={cn("flex flex-col", item.mine ? "items-end" : "items-start")}>
      {quote && (
        <a
          href={`#${item.about.anchor}`}
          className={cn(
            "mb-1 flex min-h-11 max-w-[85%] items-center gap-2 border-stone-300 px-2 text-body text-stone-600 hover:text-ink",
            item.mine ? "mr-0 border-r-2 text-right" : "ml-8 border-l-2",
          )}
        >
          <HomeThumb src={item.about.photo} sizes="44px" className="size-10 shrink-0 rounded-lg" />
          <span className="min-w-0 truncate">
            About <span className="font-semibold text-ink">{street}</span>
          </span>
        </a>
      )}
      {item.replyTo && (
        <span className={cn("px-1 text-meta text-muted", !item.mine && "ml-8")}>
          Replying to {item.replyTo.name}
          {item.replyTo.likes && "'s likes"}
        </span>
      )}
      <Bubble mine={item.mine} by={item.by} at={item.at} ask={item.ask}>
        {item.body}
      </Bubble>
    </li>
  );
}

// The bubble itself: their face at its foot (not the viewer's own), the
// words, and when under them.
function Bubble({
  mine,
  by,
  at,
  ask = false,
  children,
}: {
  mine: boolean;
  by: ThreadPerson;
  at: string;
  ask?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex max-w-[85%] flex-col", mine ? "items-end" : "items-start")}>
      <div className="flex max-w-full items-end gap-2">
        {!mine && <Avatar name={by.name} photo={by.photo} tone={by.agent ? "agent" : "person"} size={6} className="shrink-0" />}
        <p
          className={cn(
            "min-w-0 whitespace-pre-line break-words rounded-2xl px-4 py-2.5 text-body leading-snug",
            mine ? "bg-brand text-white" : "bg-stone-100 text-ink",
            ask && !mine && "ring-2 ring-amber-300",
          )}
        >
          {ask && <DoorOpen aria-hidden size={16} className="mr-1.5 inline align-[-3px]" />}
          {children}
        </p>
      </div>
      <span className={cn("mt-0.5 px-1 text-meta text-muted", !mine && "ml-8")}>
        {!mine && <span className="sr-only">{by.name}, </span>}
        <time dateTime={at} suppressHydrationWarning>
          {timeAgo(at)}
        </time>
      </span>
    </div>
  );
}
