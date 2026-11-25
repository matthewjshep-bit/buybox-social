"use client";

import { Globe, Heart, Lock, MapPin, X } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useCommentLike, useThread, type ReplyTarget, type SpotRef } from "@/components/listing-thread";
import { spotThread } from "@/components/photo-spots";
import { Avatar, Badge } from "@/components/ui";
import { FEED_FIRST, FEED_MORE, rankComments } from "@/lib/comment-rank";
import type { FeedPost } from "@/lib/feed";
import { cn, timeAgo } from "@/lib/format";
import { spotName } from "@/lib/photos";
import type { TimelineComment, TimelineReaction } from "@/lib/timeline";

// The comments on a home, the one way they're read everywhere: under its
// photo on the dark ground (a phone, a desktop's panel, the pane beside the
// map, a public page, an agent's link), and on white under a card in a feed.
// Folded ("latest"): who liked it, then the latest few comments whole, and
// "View all" to read the rest. Unfurled (open): the whole thread in the same
// place and the same style, each comment with Reply and a heart, replies
// folded under it, and the comment box at the foot. Never who reacted how:
// the likes line says how many (and, on a link, who). Under a card in a
// feed, as LinkedIn has it: a few at a time, the ones with something to
// them first (lib/comment-rank.ts), and "See N more comments" for the rest.

// How many comments show before "View all".
export const PREVIEW_MOST = 3;

// Where the open thread is drawn: over the photo on a phone (its own header
// with a Close), in place in a desktop's panel ("Hide comments" at its end),
// or inline under a card in a feed, on white (no header: the card's own
// Comments button folds it away).
export type ThreadLook = "cover" | "panel" | "inline";

// The colours of the ground it's on: white words on the dark ground, ink on white.
type Tone = {
  fg: string;
  body: string;
  meta: string;
  dim: string;
  soft: string;
  strong: string;
  faint: string;
  rowHover: string;
  btnHover: string;
  hoverFg: string;
  chip: string;
  faceRing: string;
  badgeRing: string;
  pill: string;
  line: string;
  share: string;
  likeOn: string;
  // Rows read as a post's comments do: the name and when on one line, the
  // words under them (on white, under a card); else name, words and when
  // run on, as a reel's do.
  stacked: boolean;
};

const DARK: Tone = {
  fg: "text-white",
  body: "text-white/90",
  meta: "text-white/65",
  dim: "text-white/60",
  soft: "text-white/70",
  strong: "text-white/80",
  faint: "text-white/55",
  rowHover: "hover:bg-white/[0.06]",
  btnHover: "hover:bg-white/10",
  hoverFg: "hover:text-white",
  chip: "bg-white/10 text-white/85 hover:bg-white/20",
  faceRing: "ring-white/30",
  badgeRing: "ring-white/25",
  pill: "text-white/80 ring-white/25",
  line: "bg-white/30",
  share: "text-sky-300",
  likeOn: "text-rose-400",
  stacked: false,
};

const LIGHT: Tone = {
  fg: "text-ink",
  body: "text-ink",
  meta: "text-muted",
  dim: "text-stone-600",
  soft: "text-stone-600",
  strong: "text-stone-700",
  faint: "text-muted",
  rowHover: "hover:bg-stone-100",
  btnHover: "hover:bg-stone-100",
  hoverFg: "hover:text-ink",
  chip: "bg-stone-100 text-stone-700 hover:bg-stone-200",
  faceRing: "ring-stone-300",
  badgeRing: "ring-stone-300",
  pill: "text-stone-700 ring-stone-300",
  line: "bg-stone-300",
  share: "text-brand",
  likeOn: "text-rose-600",
  stacked: true,
};

const ToneContext = createContext<Tone>(DARK);
const useTone = () => useContext(ToneContext);

export function CommentThread({
  post,
  mode,
  likes,
  mineLiked = false,
  host,
  open,
  spot,
  opened,
  look,
  canShare = false,
  onOpen,
  onClose,
  onAllComments,
  onReply,
  onGoToSpot,
  className,
}: {
  post: FeedPost;
  // Public pages, or an agent's private link (where who liked it can be named).
  mode: "public" | "share";
  // How many liked the home, as the page counts it just now (yours included
  // the moment you tap). Unset: as the post arrived.
  likes?: number;
  // Whether the viewer is among the likes (said as "you", not counted as an other).
  mineLiked?: boolean;
  // An agent's own listing: their page id, so their words lead.
  host?: string;
  // Unfurled.
  open: boolean;
  // Only the comments about this spot in a photo (or one of the facts).
  spot?: SpotRef;
  // Opened on this comment: if it's a reply, its replies show.
  opened?: string;
  look: ThreadLook;
  // On a link, once they've liked the home: they may share a comment publicly.
  canShare?: boolean;
  // Folded: a row opens the thread on that comment (none: at the top).
  onOpen: (commentId?: string) => void;
  onClose: () => void;
  // About one spot: back to all of them.
  onAllComments: () => void;
  // Reply points the comment box at that comment.
  onReply: (target: ReplyTarget) => void;
  // A comment about a spot: show it on the photo.
  onGoToSpot: (spot: SpotRef) => void;
  className?: string;
}) {
  const t = look === "inline" ? LIGHT : DARK;
  const inline = look === "inline";
  const liked = likes ?? post.likes;
  const all = post.timeline.filter((item): item is TimelineComment => item.kind === "comment");
  // Under a card: what was there when the thread opened. Anything since (the
  // viewer's own words, first of all) leads, whatever its rank, so a comment
  // just posted is in sight, not behind "See more".
  const [known] = useState(() => new Set(all.map((comment) => comment.id)));
  const isNew = (comment: TimelineComment) => inline && !known.has(comment.id);
  // How many times "See more" has been asked for.
  const [more, setMore] = useState(0);
  const inScope = spot ? (spotThread(post.timeline, spot) as TimelineComment[]) : all;
  const name = spot ? spotName(post.listing, spot) : null;
  // The agent's first (on a link, theirs are marked; on their own listing's
  // public page, theirs are the host's), then the newest.
  const leads = (comment: TimelineComment) => comment.isAgent || (Boolean(host) && comment.profileId === host);
  const ids = new Set(inScope.map((comment) => comment.id));
  // A comment, or an answer to someone's likes (which have no row of their own).
  const top = inScope
    .filter((comment) => !comment.parentId || !ids.has(comment.parentId))
    .sort((a, b) => Number(leads(b)) - Number(leads(a)) || b.at.localeCompare(a.at));
  const repliesTo = (id: string) => inScope.filter((comment) => comment.parentId === id).sort((a, b) => a.at.localeCompare(b.at));
  // Under a card: the ones with something to them first, a few at a time.
  const ranked = inline ? rankComments(top, (id) => repliesTo(id).length) : top;
  const fresh = ranked.filter((comment) => isNew(comment) || repliesTo(comment.id).some(isNew));
  const rest = ranked.filter((comment) => !fresh.includes(comment));
  const shownTop = inline ? [...fresh, ...rest.slice(0, FEED_FIRST + more * FEED_MORE)] : ranked;
  const hidden = ranked.length - shownTop.length;
  // (Under a card, the bar's heart already says how many liked it.)
  const likesLine = liked > 0 && !spot && look !== "inline" && (
    <p className="py-1.5 text-body font-semibold leading-5">{likedLine(liked, mode === "share" ? post.likers : [], mineLiked)}</p>
  );
  const spots = { name: (s: SpotRef) => spotName(post.listing, s), show: onGoToSpot };

  if (!open) {
    return (
      <ToneContext.Provider value={t}>
        <Latest post={post} all={all} top={top} likesLine={likesLine} spots={spots} onOpen={onOpen} className={className} />
      </ToneContext.Provider>
    );
  }

  const count = inScope.length;
  const title = name ? `On ${name}` : count ? `${count.toLocaleString("en-US")} ${count === 1 ? "comment" : "comments"}` : "Comments";
  const list = (
    <>
      {likesLine}
      {top.length > 0 ? (
        <ul data-comment-list data-keep-clear aria-label={name ? `Comments on ${name}` : "Comments"} className="flex flex-col">
          {shownTop.map((comment) => (
            <Row
              key={comment.id}
              comment={comment}
              replies={repliesTo(comment.id)}
              answers={comment.parentId ? answered(post, comment.parentId) : null}
              thread={comment.parentId ?? undefined}
              opened={opened}
              canShare={canShare}
              spots={comment.spot ? spots : undefined}
              onReply={onReply}
            />
          ))}
        </ul>
      ) : (
        <p data-comment-list className={cn("py-3 text-body", t.meta)}>
          No comments{name ? ` on ${name}` : ""} yet.
        </p>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setMore(more + 1)}
          className={cn("flex min-h-11 items-center text-body font-semibold transition-colors", t.soft, t.hoverFg)}
        >
          See {hidden.toLocaleString("en-US")} more {hidden === 1 ? "comment" : "comments"}
        </button>
      )}
      {mode === "public" && !spot && (
        <p className={cn("mt-4 text-center text-meta leading-5", t.faint)}>
          Comments here are public. Buyers&apos; private chats with their agents stay private unless they choose to share.
        </p>
      )}
    </>
  );
  const head = (
    <div className="flex h-12 shrink-0 items-center gap-2">
      <h2 className="min-w-0 flex-1 truncate text-body font-semibold leading-5">{title}</h2>
      {spot && (
        <button
          type="button"
          onClick={onAllComments}
          className={cn(
            "flex h-11 shrink-0 items-center rounded-full px-3 text-meta font-semibold transition-colors",
            t.strong,
            t.btnHover,
            t.hoverFg,
          )}
        >
          All comments
        </button>
      )}
      {look === "cover" && (
        <button
          type="button"
          aria-label="Hide comments"
          onClick={onClose}
          className={cn(
            "-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            t.strong,
            t.btnHover,
            t.hoverFg,
          )}
        >
          <X aria-hidden size={22} />
        </button>
      )}
    </div>
  );
  if (look === "cover") {
    return (
      <ToneContext.Provider value={t}>
        <div className={cn("flex min-h-0 flex-1 flex-col", t.fg, className)}>
          <div className="px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">{head}</div>
          <div
            data-thread-scroll
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left))] pb-3 pr-[max(1rem,env(safe-area-inset-right))]"
          >
            {list}
          </div>
        </div>
      </ToneContext.Provider>
    );
  }
  if (look === "inline") {
    // Under a card: the list alone (the card's Comments button says how many,
    // and folds it away). About one spot it still says so, with the way back.
    return (
      <ToneContext.Provider value={t}>
        <div className={cn("flex flex-col", t.fg, className)}>
          {spot && head}
          {list}
        </div>
      </ToneContext.Provider>
    );
  }
  return (
    <ToneContext.Provider value={t}>
      <div className={cn("flex flex-col", t.fg, className)}>
        {head}
        {list}
        <button
          type="button"
          onClick={onClose}
          className={cn("mt-2 flex min-h-11 items-center text-body font-semibold transition-colors", t.soft, t.hoverFg)}
        >
          Hide comments
        </button>
      </div>
    </ToneContext.Provider>
  );
}

// Folded: the likes line, then as many of the latest few comments as fit
// whole above "View all" (never half a row), or "No comments yet."
function Latest({
  post,
  all,
  top,
  likesLine,
  spots,
  onOpen,
  className,
}: {
  post: FeedPost;
  all: TimelineComment[];
  top: TimelineComment[];
  likesLine: ReactNode;
  spots: SpotLinks;
  onOpen: (commentId?: string) => void;
  className?: string;
}) {
  const t = useTone();
  const box = useRef<HTMLDivElement>(null);
  const shown = top.slice(0, PREVIEW_MOST);
  const count = all.length;
  // Whole rows only: a row whose foot would run past the room (with "View
  // all" under it, when there'd be more to see) is left out, and "View all"
  // counts it among the rest. Measured, so a smaller phone or the pane
  // beside the map shows one or two.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const rows = [...el.querySelectorAll<HTMLElement>("[data-row]")];
      const more = el.querySelector<HTMLElement>("[data-view-all]");
      for (const row of rows) row.hidden = false;
      if (more) more.hidden = false;
      const moreHeight = more?.offsetHeight ?? 0;
      const room = el.clientHeight;
      const top = el.getBoundingClientRect().top;
      let fits = rows.length;
      for (const [i, row] of rows.entries()) {
        const reserve = count > i + 1 ? moreHeight : 0;
        if (row.getBoundingClientRect().bottom - top > room - reserve + 0.5) {
          fits = i;
          break;
        }
      }
      rows.forEach((row, i) => {
        row.hidden = i >= fits;
      });
      if (more) more.hidden = count <= fits;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.timeline, count, shown.length]);
  // Nothing yet: said quietly, so the room under the photo reads as what it's for.
  const nothing = !likesLine && count === 0;
  return (
    <div ref={box} data-comment-list data-keep-clear role="group" aria-label="Latest comments" className={cn("flex flex-col", t.fg, className)}>
      {nothing && <p className={cn("py-1.5 text-body", t.meta)}>No comments yet.</p>}
      {likesLine}
      {shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((comment) => (
            <li key={comment.id} data-row>
              <button
                type="button"
                onClick={() => onOpen(comment.id)}
                className={cn("flex min-h-11 w-full items-start gap-2.5 rounded-lg py-1.5 text-left transition-colors", t.rowHover)}
              >
                <Face comment={comment} />
                <p className="line-clamp-2 min-w-0 flex-1 text-body leading-5">
                  <Said comment={comment} spots={comment.spot ? spots : undefined} />
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {count > 0 && (
        <button
          type="button"
          data-view-all
          hidden={count <= shown.length}
          onClick={() => onOpen()}
          className={cn("flex min-h-11 items-center text-body transition-colors", t.soft, t.hoverFg)}
        >
          View all {count.toLocaleString("en-US")} {count === 1 ? "comment" : "comments"}
        </button>
      )}
    </div>
  );
}

type SpotLinks = { name: (spot: SpotRef) => string; show: (spot: SpotRef) => void };

function Face({ comment, reply = false }: { comment: TimelineComment; reply?: boolean }) {
  const t = useTone();
  return (
    <Avatar
      name={comment.name}
      tone={comment.fromPrivateChat ? "anonymous" : comment.isAgent ? "agent" : "person"}
      size={reply ? 6 : 7}
      className={cn("mt-0.5", comment.isAgent && cn("ring-1", t.faceRing))}
    />
  );
}

// Who, what they said, and when, in a line of words: the name (on a public
// page, the way to their page, once the thread is open), the agent's badge,
// a lock for words shared from a private chat ("A buyer"), the spot it's
// about (open, a button that shows it), the words, "· 2h".
function Said({
  comment,
  spots,
  linked = false,
  clamp = true,
}: {
  comment: TimelineComment;
  spots?: SpotLinks;
  // Their name goes to their page (never in a folded row, which is one button).
  linked?: boolean;
  // Folded: the words to two lines, and just a pin for a spot (the row is one
  // button; which spot waits for the open thread).
  clamp?: boolean;
}) {
  const t = useTone();
  const name =
    linked && comment.profileId ? (
      <Link href={`/people/${comment.profileId}`} className="relative z-[1] font-semibold underline-offset-2 hover:underline">
        {comment.name}
      </Link>
    ) : (
      <b className="font-semibold">{comment.name}</b>
    );
  const when = (
    <span className={cn("whitespace-nowrap text-meta", t.meta)}>
      ·{" "}
      <time dateTime={comment.at} suppressHydrationWarning>
        {timeAgo(comment.at)}
      </time>
    </span>
  );
  // As a post's comments read: who and when on one line, the words under.
  if (t.stacked && !clamp) {
    return (
      <>
        <span className="flex flex-wrap items-center gap-x-1.5">
          {name}
          {comment.isAgent && (
            <Badge tone="ink" small className={cn("ring-1", t.badgeRing)}>
              Agent
            </Badge>
          )}
          {comment.fromPrivateChat && <Lock aria-hidden size={11} className={cn("inline", t.dim)} />}
          {when}
        </span>
        <span className="block">
          {comment.spot && spots && (
            <>
              <button
                type="button"
                data-spot-tag={comment.spot.tag}
                onClick={() => spots.show(comment.spot!)}
                className={cn("relative z-[1] inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-meta font-semibold hit-44", t.chip)}
              >
                <MapPin aria-hidden size={12} />
                <span className="sr-only">About </span>
                {spots.name(comment.spot)}
                <span className="sr-only">: show it</span>
              </button>{" "}
            </>
          )}
          <span className={cn(t.body, "whitespace-pre-line break-words")}>{comment.body}</span>
        </span>
      </>
    );
  }
  return (
    <>
      {name}
      {comment.isAgent && (
        <Badge tone="ink" small className={cn("ml-1.5 align-[2px] ring-1", t.badgeRing)}>
          Agent
        </Badge>
      )}
      {comment.fromPrivateChat && <Lock aria-hidden size={11} className={cn("ml-1 inline align-[-1px]", t.dim)} />}{" "}
      {comment.spot && spots && (
        <>
          {clamp ? (
            <MapPin aria-hidden size={12} className={cn("inline align-[-1px]", t.dim)} />
          ) : (
            <button
              type="button"
              data-spot-tag={comment.spot.tag}
              onClick={() => spots.show(comment.spot!)}
              className={cn("relative z-[1] inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-meta font-semibold hit-44", t.chip)}
            >
              <MapPin aria-hidden size={12} />
              <span className="sr-only">About </span>
              {spots.name(comment.spot)}
              <span className="sr-only">: show it</span>
            </button>
          )}{" "}
        </>
      )}
      <span className={cn(t.body, !clamp && "whitespace-pre-line break-words")}>{comment.body}</span> {when}
    </>
  );
}

// Whose likes an answer answers, when it answers someone's likes rather than
// a comment: their name (no row of their own in the thread).
function answered(post: FeedPost, parentId: string): string | null {
  // (A reply to someone's likes carries their likes' row id as its parent.)
  const likes = post.timeline.find((item): item is TimelineReaction => item.kind === "reaction" && item.id === parentId);
  return likes ? (likes.mine ? "your likes" : `${likes.name}'s likes`) : null;
}

// One comment in the open thread: who, what, when; Reply, the likes, the
// heart; replies folded under it.
function Row({
  comment,
  replies = [],
  answers,
  opened,
  canShare,
  spots,
  onReply,
  thread,
  reply = false,
}: {
  comment: TimelineComment;
  replies?: TimelineComment[];
  // Whose likes it answers, if it answers someone's likes.
  answers?: string | null;
  opened?: string;
  canShare: boolean;
  spots?: SpotLinks;
  onReply: (target: ReplyTarget) => void;
  // What its thread answers (a reply: the comment it's under; an answer to
  // someone's likes: those), so answering it stays in that thread.
  thread?: string;
  // Nested under a comment.
  reply?: boolean;
}) {
  const t = useTone();
  const { actions } = useThread();
  const [pending, startTransition] = useTransition();
  // Taking a comment back is always allowed; sharing it needs a like.
  const canToggle = comment.mine && actions.setSharing && (comment.sharedPublicly || canShare);
  const likeable = Boolean(actions.likeComment) && !comment.fromPrivateChat;
  const like = useCommentLike(comment);
  // Anything named can be answered: a comment, in a thread of its own; a
  // reply, in the thread it's in, starting with their name. (Shared from a
  // private chat, there's no one to answer.)
  const replyable = !comment.fromPrivateChat;
  const label = comment.mine ? "your comment" : comment.name;
  return (
    <li data-comment={comment.id} className={cn("flex gap-2.5", reply ? "py-1" : "py-1.5")}>
      <Face comment={comment} reply={reply} />
      <div className="min-w-0 flex-1">
        {answers && <p className={cn("text-meta leading-5", t.dim)}>Replying to {answers}</p>}
        <p className="text-body leading-5">
          <Said comment={comment} spots={spots} linked clamp={false} />
        </p>
        {/* The agent hearted it, as a creator does on a reel: a note, not a button. */}
        {comment.likedBy && (
          <p className="mt-1 flex">
            <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-meta font-medium ring-1 ring-inset", t.pill)}>
              <Heart aria-hidden size={11} className="fill-rose-400 text-rose-400" />
              Liked by {comment.likedBy}
            </span>
          </p>
        )}
        <div className={cn("flex flex-wrap items-center gap-x-4 text-meta font-semibold", t.dim)}>
          {replyable && (
            <button
              type="button"
              onClick={() =>
                onReply(
                  thread
                    ? { id: thread, name: comment.name, mine: comment.mine, mention: !comment.mine }
                    : { id: comment.id, name: comment.name, mine: comment.mine },
                )
              }
              className={cn("flex min-h-11 items-center transition-colors", t.hoverFg)}
            >
              Reply
              <span className="sr-only"> to {label}</span>
            </button>
          )}
          {like.count > 0 && likeable && (
            <span className="flex min-h-11 items-center">
              {like.count} {like.count === 1 ? "like" : "likes"}
            </span>
          )}
          {comment.fromPrivateChat && (
            <span className="inline-flex min-h-11 items-center gap-1 font-normal">
              <Lock aria-hidden size={11} /> Shared from a private chat
            </span>
          )}
          {comment.sharedPublicly && (
            <span className="inline-flex min-h-11 items-center gap-1 font-normal">
              <Globe aria-hidden size={11} /> Shared anonymously on the public page
            </span>
          )}
          {canToggle && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await actions.setSharing!(comment.id, !comment.sharedPublicly);
                })
              }
              className={cn("flex min-h-11 items-center underline-offset-2 hover:underline disabled:opacity-50", t.share)}
            >
              {comment.sharedPublicly ? "Make private" : "Share anonymously"}
            </button>
          )}
        </div>
        {!reply && (
          <Replies replies={replies} opened={opened} label={comment.name} thread={comment.id} canShare={canShare} onReply={onReply} />
        )}
      </div>
      {likeable && (
        <button
          type="button"
          aria-pressed={like.liked}
          aria-label={`Like ${comment.mine ? "your" : `${comment.name}'s`} comment${like.count ? `, ${like.count} ${like.count === 1 ? "like" : "likes"}` : ""}`}
          onClick={like.toggle}
          className={cn(
            "-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            t.btnHover,
            like.liked ? t.likeOn : t.dim,
          )}
        >
          <Heart aria-hidden size={17} className={cn(like.liked && "fill-current")} />
        </button>
      )}
    </li>
  );
}

// The replies under a comment: folded away under "View 2 replies", like on
// a reel; open when you came to see one of them, or when you've just added
// one. Each can be answered too, in the same thread.
function Replies({
  replies,
  opened,
  label,
  thread,
  canShare,
  onReply,
}: {
  replies: TimelineComment[];
  opened?: string;
  // Whose comment they answer, for screen readers ("Replies to Maya").
  label: string;
  thread: string;
  canShare: boolean;
  onReply: (target: ReplyTarget) => void;
}) {
  const t = useTone();
  const asked = Boolean(opened && replies.some((child) => child.id === opened));
  const [open, setOpen] = useState(asked);
  const [wasAsked, setWasAsked] = useState(asked);
  if (asked !== wasAsked) {
    setWasAsked(asked);
    if (asked) setOpen(true);
  }
  const [count, setCount] = useState(replies.length);
  if (replies.length !== count) {
    setCount(replies.length);
    if (replies.length > count && replies.at(-1)?.mine) setOpen(true);
  }
  if (replies.length === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn("flex min-h-11 items-center gap-2.5 text-meta font-semibold transition-colors", t.dim, t.hoverFg)}
      >
        <span aria-hidden className={cn("h-px w-6", t.line)} />
        {open ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
      </button>
      {open && (
        <ul aria-label={`Replies to ${label}`} className="flex flex-col">
          {replies.map((child) => (
            <Row key={child.id} comment={child} canShare={canShare} thread={thread} onReply={onReply} reply />
          ))}
        </ul>
      )}
    </>
  );
}

// "3 likes"; on an agent's link, with names to give: "Liked by Jenny and 2
// others", "Liked by Jenny and you" (you're never one of the others).
function likedLine(likes: number, names: string[], mine: boolean) {
  const named = names.filter((name) => name).slice(0, 2);
  // (With nobody to name, a count, yours among them, as a post has.)
  if (named.length === 0) return `${likes.toLocaleString("en-US")} ${likes === 1 ? "like" : "likes"}`;
  const people = mine ? [...named, "you"] : named;
  const rest = Math.max(0, likes - named.length - (mine ? 1 : 0));
  if (rest > 0) return `Liked by ${people.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
  return `Liked by ${people.length > 2 ? `${people.slice(0, -1).join(", ")} and ${people.at(-1)}` : people.join(" and ")}`;
}
