"use client";

import { DoorOpen, Eye, Heart, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { CommentBubble } from "@/components/comment-bubble";
import { Avatar, HomeThumb } from "@/components/ui";
import { cn, formatPrice, timeAgo, whenWords } from "@/lib/format";
import type { HomesItem, MessageItem, ThreadHome } from "@/lib/messages";

// One send, as a message in the conversation: who sent it and when, their
// note, then each home as a card (its photo, price and address; a tap opens
// it), with what's happened to it in a line under it (opened and for how
// long, who liked it or passed, how many said something, who asked to see
// it), and what was said about it under that, each a bubble. The viewer's
// own sends sit to the right, like their messages on a phone.

// How many comments show under a home before "Show all".
const COMMENTS_SHOWN = 3;

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
  showAll = false,
  onReply,
}: {
  item: HomesItem;
  viewerIsAgent: boolean;
  // Every comment, not just the latest few (one conversation open).
  showAll?: boolean;
  // Reply under a home: the box at the foot answers in that home's thread.
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
          <time dateTime={item.at}>{timeAgo(item.at)}</time>
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
          <li key={home.key} id={`home-${home.key}`} className="w-full">
            <HomeCard
              home={home}
              href={open(home)}
              mine={item.mine}
              sender={item.mine}
              showAll={showAll}
              onReply={onReply && (() => onReply(home))}
            />
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
  showAll,
  onReply,
}: {
  home: ThreadHome;
  href: string;
  mine: boolean;
  // The viewer sent it: opens and time spent are theirs to see.
  sender: boolean;
  showAll: boolean;
  onReply?: () => void;
}) {
  const likes = home.takes.filter((take) => take.verdict === "like");
  const passes = home.takes.filter((take) => take.verdict === "pass");
  const who = (takes: typeof home.takes) =>
    takes.length === 1 && takes[0].mine ? "You" : takes.map((take) => (take.mine ? "you" : take.name)).join(", ");
  const comments = showAll ? home.comments : home.comments.slice(-COMMENTS_SHOWN);
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
      {/* What's happened to it, in one line of chips. */}
      {(sender || likes.length > 0 || passes.length > 0 || home.comments.length > 0 || home.asked.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 px-2.5 pb-2.5">
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
          {home.comments.length > 0 && (
            <span className={cn(chip, "bg-white/70 text-stone-700")}>
              <MessageCircle aria-hidden size={13} />
              {home.comments.length} {home.comments.length === 1 ? "comment" : "comments"}
            </span>
          )}
          {home.asked.map((ask) => (
            <span key={ask.at} className={cn(chip, "bg-amber-100 text-amber-900")}>
              <DoorOpen aria-hidden size={13} />
              {ask.mine ? "You asked" : `${ask.name} asked`} to see it · {whenWords(new Date(ask.at))}
            </span>
          ))}
        </div>
      )}
      {comments.length > 0 && (
        <ul aria-label={`Comments on ${home.address}`} className="flex flex-col gap-2 border-t border-black/[0.06] px-2.5 py-2.5">
          {home.comments.length > comments.length && (
            <li className="text-meta text-muted">{home.comments.length - comments.length} earlier</li>
          )}
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentBubble
                name={
                  <>
                    {comment.mine ? "You" : comment.name}
                    {comment.replyTo && (
                      <span className="font-normal text-muted">
                        {" "}
                        replied to {comment.replyTo.name}
                        {comment.replyTo.likes && "'s likes"}
                      </span>
                    )}
                  </>
                }
                face={comment.name}
                agent={comment.fromSender}
                meta={<time dateTime={comment.at}>{timeAgo(comment.at)}</time>}
              >
                {comment.body}
              </CommentBubble>
            </li>
          ))}
        </ul>
      )}
      {onReply && (
        <div className={cn("px-2.5 pb-1", comments.length === 0 && "border-t border-black/[0.06]")}>
          <button
            type="button"
            onClick={onReply}
            className="flex min-h-11 items-center text-meta font-semibold text-brand hover:underline"
          >
            Reply<span className="sr-only"> about {home.address}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// A message about no home in particular: a bubble, the viewer's own on the
// right in the site's blue, anyone else's on the left, their face beside it.
export function MessageBubble({ item }: { item: MessageItem }) {
  return (
    <li id={`message-${item.id}`} className={cn("flex items-end gap-2", item.mine ? "justify-end" : "justify-start")}>
      {!item.mine && <Avatar name={item.by.name} photo={item.by.photo} tone={item.by.agent ? "agent" : "person"} size={6} />}
      <div className={cn("flex max-w-[85%] flex-col", item.mine ? "items-end" : "items-start")}>
        <p
          className={cn(
            "whitespace-pre-line break-words rounded-2xl px-4 py-2.5 text-body leading-snug",
            item.mine ? "bg-brand text-white" : "bg-stone-100 text-ink",
          )}
        >
          {item.body}
        </p>
        <span className="mt-0.5 px-1 text-meta text-muted">
          {!item.mine && <span className="sr-only">{item.by.name}, </span>}
          <time dateTime={item.at}>{timeAgo(item.at)}</time>
        </span>
      </div>
    </li>
  );
}
