"use client";

import { ArrowUp, Globe, Heart, Lock, MapPin, ThumbsDown, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  useContext,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { Sheet } from "@/components/sheet";
import type { ActionResult } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import type { SpotReaction } from "@/lib/photos";
import { describeReaction, type ReactionState } from "@/lib/reactions";
import type { TimelineComment, TimelineItem, TimelineReaction } from "@/lib/timeline";

// The name prompt and comments UI shared by private share links and public
// pages. Each passes in Server Actions bound to its own thread.
export type ThreadActions = {
  join: (firstName: string) => Promise<ActionResult>;
  react: (listingKey: string, state: ReactionState) => Promise<ActionResult>;
  comment: (
    listingKey: string,
    body: string,
    sharePublicly: boolean,
    parentId?: string | null,
    // The spot in a photo it's about: tap the front door, say something about it.
    spot?: SpotRef | null,
  ) => Promise<ActionResult>;
  // Private threads only: an author shares or un-shares their own comment.
  setSharing?: (commentId: string, shared: boolean) => Promise<ActionResult>;
  // Public threads only: liking a comment, which also turns on replies.
  likeComment?: (commentId: string, liked: boolean) => Promise<ActionResult>;
  // Liking, or not, something in a photo ("the kitchen") or a fact ("the price").
  likePhoto?: (listingKey: string, mediaKey: string, tag: string, reaction: SpotReaction) => Promise<ActionResult>;
};

// A spot in one of a home's photos: a named thing ("Front door") or a place ("@42,61").
export type SpotRef = { mediaKey: string; tag: string };

// How a list of comments names a spot, and takes you to it on the photo.
export type SpotLinks = { name: (spot: SpotRef) => string; show: (spot: SpotRef) => void };

// Who sees what you write here, said under every comment box: "Everyone can
// see your comment and first name." `private`: only some people (a lock).
export type SeenBy = { text: string; private: boolean };

type ThreadValue = { actions: ThreadActions; ensureName: () => Promise<boolean>; seenBy?: SeenBy };
const ThreadContext = createContext<ThreadValue | null>(null);

export const useThread = () => {
  const value = useContext(ThreadContext);
  if (!value) throw new Error("Thread components must be inside <NameGate>");
  return value;
};

// Asks for a first name the first time someone reacts or comments, in a sheet
// that rises like everything else. No account.
export function NameGate({
  actions,
  myName,
  prompt,
  suggestedName,
  nameHint,
  seenBy,
  anchor,
  children,
}: {
  actions: ThreadActions;
  myName: string | null;
  prompt: string;
  // Filled in already (and selected, to type over): a name the page knows.
  suggestedName?: string;
  // One more line, just above the name.
  nameHint?: string;
  seenBy?: SeenBy;
  // What the prompt rises over (unset: the window).
  anchor?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const resolver = useRef<((joined: boolean) => void) | null>(null);
  const joined = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A page and the pop-out over it can each have one of these.
  const id = useId();

  const ensureName = () => {
    if (myName || joined.current) return Promise.resolve(true);
    // Open, and the cursor in the name, in the same tap: a phone only shows
    // its keyboard for that.
    flushSync(() => {
      setError(null);
      setAsking(true);
    });
    field.current?.focus();
    field.current?.select();
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  };

  const finish = (result: boolean) => {
    setAsking(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <ThreadContext.Provider value={{ actions, ensureName, seenBy }}>
      {children}
      <Sheet
        open={asking}
        onClose={() => finish(false)}
        label="What's your first name?"
        title="What's your first name?"
        anchor={anchor}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("firstName") ?? "");
            startTransition(async () => {
              const result = await actions.join(name);
              if (result.ok) {
                joined.current = true;
                finish(true);
              } else {
                setError(result.error);
              }
            });
          }}
          className="mx-auto max-w-sm px-1 pb-1"
        >
          <p className="text-center text-sm text-stone-600">{prompt}</p>
          {nameHint && (
            <p id={`${id}-hint`} className="mt-3 text-balance text-center text-[13px] text-stone-600">
              {nameHint}
            </p>
          )}
          <label htmlFor={`${id}-name`} className="sr-only">
            First name
          </label>
          <input
            ref={field}
            id={`${id}-name`}
            name="firstName"
            required
            maxLength={40}
            autoComplete="given-name"
            aria-describedby={nameHint ? `${id}-hint` : undefined}
            defaultValue={suggestedName}
            placeholder="First name"
            className={cn(
              "w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30",
              nameHint ? "mt-1.5" : "mt-4",
            )}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => finish(false)}
              className="min-h-12 flex-1 rounded-xl border border-stone-300 font-medium hover:bg-stone-50"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-12 flex-1 rounded-xl bg-brand font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      </Sheet>
    </ThreadContext.Provider>
  );
}

// The conversation about a home, Instagram-style: who said what, and who liked
// what, oldest first.
export function Timeline({
  listingKey,
  items,
  opened,
  canShare = false,
  onReply,
  spots,
  empty,
}: {
  listingKey: string;
  items: TimelineItem[];
  // Opened to show this comment: a reply shows with the others under its comment.
  opened?: string;
  // Private threads only, once someone likes the home: they may share a comment publicly.
  canShare?: boolean;
  // Reply points the comment box below at that comment.
  onReply?: (target: ReplyTarget) => void;
  // Comments about a spot in a photo say which, and take you there.
  spots?: SpotLinks;
  // What to say when there's nothing yet.
  empty?: ReactNode;
}) {
  const top = items.filter((item) => item.kind === "reaction" || !item.parentId);
  if (top.length === 0) {
    return (
      empty ?? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <p className="text-lg font-semibold">No comments yet</p>
          <p className="mt-1 text-sm text-stone-600">Start the conversation.</p>
        </div>
      )
    );
  }
  // What people said comes first, so it's what shows as the comments open;
  // who liked (or passed on) what, after it, under its own heading.
  const said = top.filter((item): item is TimelineComment => item.kind === "comment");
  const reacted = top.filter((item): item is TimelineReaction => item.kind === "reaction");
  return (
    <ul aria-label="Comments and likes" className="flex flex-col gap-5">
      {said.map((item) => (
        <CommentItem
          key={item.id}
          listingKey={listingKey}
          comment={item}
          replies={items.filter(
            (reply): reply is TimelineComment => reply.kind === "comment" && reply.parentId === item.id,
          )}
          opened={opened}
          canShare={canShare}
          onReply={onReply}
          spots={spots}
        />
      ))}
      {reacted.length > 0 && (
        <li className={cn(said.length > 0 && "border-t border-stone-100 pt-4")}>
          <h3 className="text-[13px] font-semibold text-stone-500">
            {reacted.some(passedOn) ? "Likes and passes" : "Likes"}
          </h3>
          <ul className="mt-2 flex flex-col gap-2.5">
            {reacted.map((item) => (
              <ReactionItem key={item.id} item={item} />
            ))}
          </ul>
        </li>
      )}
    </ul>
  );
}

// Passed on the home, or only said what they didn't like.
const passedOn = (item: TimelineReaction) =>
  item.state.reaction === "dislike" || (!item.state.reaction && !item.photos.length && item.photoDislikes.length > 0);

export type ReplyTarget = { id: string; name: string; mine: boolean };

function Avatar({
  name,
  anonymous = false,
  agent = false,
  badge,
  small = false,
  tiny = false,
}: {
  name: string;
  anonymous?: boolean;
  agent?: boolean;
  badge?: ReactNode;
  small?: boolean;
  // A line under "Likes": just a face.
  tiny?: boolean;
}) {
  return (
    <span aria-hidden className="relative shrink-0">
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-semibold",
          tiny ? "size-6 text-[11px]" : small ? "size-7 text-xs" : "size-9 text-sm",
          anonymous ? "bg-stone-200 text-stone-600" : agent ? "bg-ink text-white" : "bg-brand text-white",
        )}
      >
        {anonymous ? <User size={tiny ? 12 : small ? 14 : 16} /> : name[0]?.toUpperCase()}
      </span>
      {badge && (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-white ring-1 ring-stone-200",
            tiny ? "-bottom-1 -right-1.5 size-3.5" : "-bottom-1 -right-1 size-4.5",
          )}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

// A person's name, linking to their profile when they have a public one. It
// sits in a line of words, so it keeps the line's height (WCAG's inline
// exception): a bigger touch area would cover the words under it. It stays
// over the spot chip's touch area just below.
function Who({ name, profileId }: { name: string; profileId?: string }) {
  if (!profileId) return <span className="font-semibold text-ink">{name}</span>;
  return (
    <Link href={`/people/${profileId}`} className="relative z-[1] font-semibold text-ink underline-offset-2 hover:underline">
      {name}
    </Link>
  );
}

function When({ at }: { at: string }) {
  return (
    <time dateTime={at} suppressHydrationWarning>
      {timeAgo(at)}
    </time>
  );
}

// "Morgan liked the marble counters" with a thumbnail of the photo: one
// short line each, under the comments (the Scorecard has the detail).
function ReactionItem({ item }: { item: TimelineReaction }) {
  const badge = passedOn(item) ? (
    <ThumbsDown size={8} className="text-amber-800" />
  ) : (
    <Heart size={8} className="fill-rose-600 text-rose-600" />
  );
  // The photo of the latest thing they liked.
  const thumb = item.photos.findLast((photo) => photo.mediaUrl)?.mediaUrl;
  return (
    <li className="flex items-center gap-2.5">
      <Avatar name={item.name} anonymous={item.fromPrivateChat} badge={badge} tiny />
      <p className="line-clamp-1 min-w-0 flex-1 break-words text-[13px] leading-5">
        <Who name={item.mine ? "You" : item.name} profileId={item.profileId} />{" "}
        {describeReaction(
          item.state,
          item.photos.map((photo) => photo.tag),
          item.photoDislikes.map((photo) => photo.tag),
        )}
        <span className="text-[13px] text-stone-500">
          {" "}
          · <When at={item.at} />
          {item.fromPrivateChat && " · private chat"}
        </span>
      </p>
      {thumb && (
        <span className="relative size-8 shrink-0 overflow-hidden rounded-md bg-stone-200">
          <Image src={thumb} alt="" fill sizes="32px" className="object-cover" />
        </span>
      )}
    </li>
  );
}

// Who and when, then what they said, then Reply and the likes; replies fold
// away under "View 2 replies", like on a reel.
function CommentItem({
  listingKey,
  comment,
  replies = [],
  opened,
  canShare,
  onReply,
  spots,
}: {
  listingKey: string;
  comment: TimelineComment;
  replies?: TimelineComment[];
  // A comment someone came to see: if it's one of these replies, they show.
  opened?: string;
  canShare: boolean;
  onReply?: (target: ReplyTarget) => void;
  spots?: SpotLinks;
}) {
  const { actions } = useThread();
  const [pending, startTransition] = useTransition();
  const reply = Boolean(comment.parentId);
  // Taking a comment back is always allowed; sharing it needs a like.
  const canToggle = comment.mine && actions.setSharing && (comment.sharedPublicly || canShare);
  const likeable = Boolean(actions.likeComment) && !comment.fromPrivateChat;

  // Replies open when you add one, so you see it land, or when you came to
  // see one of them.
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

  return (
    <li data-comment={comment.id} className="flex gap-3">
      <Avatar name={comment.name} anonymous={comment.fromPrivateChat} agent={comment.isAgent} small={reply} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1 text-[13px] leading-snug text-stone-500">
          <Who name={comment.name} profileId={comment.profileId} />
          {comment.isAgent && (
            <span className="rounded-full bg-ink px-2 py-px text-[10px] font-bold uppercase tracking-wide text-white">
              Agent
            </span>
          )}
          <span>
            · <When at={comment.at} />
          </span>
        </p>
        {comment.spot && spots && (
          <button
            type="button"
            onClick={() => spots.show(comment.spot!)}
            className="mt-0.5 inline-flex min-h-7 items-center gap-1 rounded-full bg-stone-100 px-2 text-[12px] font-semibold text-stone-700 hit-44 hover:bg-stone-200"
          >
            <MapPin aria-hidden size={12} />
            <span className="sr-only">About </span>
            {spots.name(comment.spot)}
            <span className="sr-only">: show it</span>
          </button>
        )}
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug">{comment.body}</p>
        {/* The agent hearted it, as a creator does on a reel: in stone, so it
            never reads as something the agent said, and outlined, not filled,
            so it reads as a note, not a button like the spot chip. */}
        {comment.likedBy && (
          <p className="mt-1.5 flex">
            <span className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-stone-600 ring-1 ring-inset ring-stone-200">
              <Heart aria-hidden size={11} className="fill-rose-600 text-rose-600" />
              Liked by {comment.likedBy}
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 text-[13px] font-semibold text-stone-500">
          {likeable && !reply && onReply && (
            <button
              type="button"
              onClick={() => onReply({ id: comment.id, name: comment.name, mine: comment.mine })}
              className="flex min-h-9 items-center hit-44 hover:text-ink"
            >
              Reply
              <span className="sr-only"> to {comment.mine ? "your comment" : comment.name}</span>
            </button>
          )}
          {comment.likes > 0 && likeable && (
            <span>
              {comment.likes} {comment.likes === 1 ? "like" : "likes"}
            </span>
          )}
          {comment.fromPrivateChat && (
            <span className="inline-flex min-h-9 items-center gap-1 font-normal">
              <Lock aria-hidden size={11} /> Shared from a private chat
            </span>
          )}
          {comment.sharedPublicly && (
            <span className="inline-flex min-h-9 items-center gap-1 font-normal">
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
              className="flex min-h-9 items-center text-brand underline-offset-2 hit-44 hover:underline disabled:opacity-50"
            >
              {comment.sharedPublicly ? "Make private" : "Share anonymously"}
            </button>
          )}
        </div>
        {replies.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              // (Over the edge of a Reply's touch area just above it.)
              className="relative flex min-h-11 items-center gap-2.5 text-[13px] font-semibold text-stone-500 hover:text-ink"
            >
              <span aria-hidden className="h-px w-6 bg-stone-300" />
              {open ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
            </button>
            {open && (
              <ul aria-label={`Replies to ${comment.name}`} className="mt-2 flex flex-col gap-4">
                {replies.map((child) => (
                  <CommentItem key={child.id} listingKey={listingKey} comment={child} canShare={false} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {likeable && <CommentHeart comment={comment} />}
    </li>
  );
}

function CommentHeart({ comment }: { comment: TimelineComment }) {
  const { actions, ensureName } = useThread();
  const [state, setState] = useOptimistic({ liked: comment.likedByMe, count: comment.likes });
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={state.liked}
      aria-label={`Like ${comment.mine ? "your" : `${comment.name}'s`} comment${state.count ? `, ${state.count} ${state.count === 1 ? "like" : "likes"}` : ""}`}
      onClick={async () => {
        if (!(await ensureName())) return;
        const liked = !state.liked;
        startTransition(async () => {
          setState({ liked, count: state.count + (liked ? 1 : -1) });
          await actions.likeComment!(comment.id, liked);
        });
      }}
      className={cn(
        "-mr-1 flex size-9 shrink-0 flex-col items-center justify-center rounded-full text-[11px] font-semibold tabular-nums hit-44 hover:bg-stone-100",
        state.liked ? "text-rose-600" : "text-stone-500",
      )}
    >
      <Heart aria-hidden size={15} className={cn(state.liked && "fill-current")} />
    </button>
  );
}

const QUICK = ["❤️", "🙌", "🔥", "👏", "😍", "😮", "😂"];

// The comment box pinned under the comments: a pill you type into, with a row
// of quick emoji above it. Reply on a comment points it at that comment.
export function CommentComposer({
  listingKey,
  canShare = false,
  replyTo = null,
  onCancelReply,
  onPosted,
  spot = null,
  placeholder,
  label,
  compact = false,
  autoFocus = false,
  quickOnFocus = false,
}: {
  listingKey: string;
  canShare?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  onPosted?: () => void;
  // The spot in a photo the comment is about.
  spot?: SpotRef | null;
  placeholder?: string;
  // Its name, when the placeholder says something else ("Add a comment").
  label?: string;
  // Just the box: no emoji row, no sharing (the card on a photo).
  compact?: boolean;
  autoFocus?: boolean;
  // The emoji row shows once the box is first used, not before (and then stays).
  quickOnFocus?: boolean;
}) {
  const { actions, ensureName, seenBy } = useThread();
  const [body, setBody] = useState("");
  // Back to the box after posting: the Post button disables once the box is
  // empty, and a focused disabled button swallows keys (like Escape).
  const field = useRef<HTMLTextAreaElement>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [quick, setQuick] = useState(!quickOnFocus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The same home can show a composer twice (a page and its pop-out), so ids are per instance.
  const inputId = useId();
  const who = replyTo ? (replyTo.mine ? "yourself" : replyTo.name) : null;
  const sharing = canShare && !compact && !replyTo;
  // Ticked to share it on the public page too: said so, not "only you".
  const seen: SeenBy | undefined =
    sharing && sharePublicly
      ? { text: "Your words also show on the public page, without your name.", private: false }
      : seenBy;

  const submit = async () => {
    if (!body.trim() || pending || !(await ensureName())) return;
    setError(null);
    startTransition(async () => {
      const result = await actions.comment(
        listingKey,
        body,
        sharing && sharePublicly,
        replyTo?.id ?? null,
        replyTo ? null : spot,
      );
      if (result.ok) {
        setBody("");
        field.current?.focus();
        setSharePublicly(false);
        onPosted?.();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {replyTo ? (
        <p className="flex min-h-9 items-center justify-between gap-2 px-2 text-[13px] text-stone-600">
          <span>
            Replying to <span className="font-semibold text-ink">{who}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onCancelReply?.();
              field.current?.focus();
            }}
            className="flex min-h-9 items-center px-1 font-semibold hit-44 hover:text-ink"
          >
            Cancel<span className="sr-only"> reply</span>
          </button>
        </p>
      ) : compact || !quick ? null : (
        <div className="flex max-w-[420px] justify-between px-1 pb-1">
          {QUICK.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setBody((current) => current + emoji);
                field.current?.focus();
              }}
              className="flex size-10 items-center justify-center rounded-full text-[22px] transition-transform hit-44 hover:bg-stone-100 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {/* The box itself is 44px tall, so a tap anywhere on the pill but its
          thin edge lands in it. */}
      <div className="flex items-end gap-2 rounded-3xl bg-stone-100 py-0.5 pl-4 pr-1 focus-within:ring-2 focus-within:ring-brand/80">
        <label htmlFor={inputId} className="sr-only">
          {who ? `Reply to ${who}` : (label ?? placeholder?.replace(/…$/, "") ?? "Add a comment")}
        </label>
        <textarea
          ref={field}
          id={inputId}
          data-composer
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onFocus={() => setQuick(true)}
          onKeyDown={(event) => {
            // Enter posts; Shift+Enter starts a new line.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          maxLength={1000}
          rows={1}
          enterKeyHint="send"
          autoFocus={autoFocus}
          placeholder={who ? `Reply to ${who}…` : (placeholder ?? "Add a comment…")}
          className="max-h-29 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none [field-sizing:content] placeholder:text-stone-500"
        />
        <button
          type="submit"
          aria-label="Post"
          disabled={pending || !body.trim()}
          className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity hit-44 disabled:opacity-30"
        >
          <ArrowUp aria-hidden size={18} strokeWidth={2.5} className={cn(pending && "animate-pulse")} />
        </button>
      </div>
      {sharing && (
        <label className="mt-1.5 flex min-h-9 cursor-pointer items-center gap-2.5 px-2 text-[13px] text-stone-700 hit-44">
          <input
            type="checkbox"
            checked={sharePublicly}
            onChange={(event) => setSharePublicly(event.target.checked)}
            // Above the line's touch area, so a tap on the box is on the box.
            className="relative z-[1] size-4.5 shrink-0 accent-[var(--brand)]"
          />
          <span>Also share this anonymously on the public listing page. Your name stays private.</span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-1 px-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {seen && (
        <p className="mt-1.5 flex items-center gap-1.5 px-2 text-[13px] leading-[18px] text-stone-600">
          {seen.private ? (
            <Lock aria-hidden size={12} className="shrink-0" />
          ) : (
            <Globe aria-hidden size={12} className="shrink-0" />
          )}
          {/* Evenly over two lines when it needs them (a card's narrow box). */}
          <span className="text-balance">{seen.text}</span>
        </p>
      )}
    </form>
  );
}
