"use client";

import { ArrowUp, Globe, Heart, Lock, MapPin, ThumbsDown, ThumbsUp, User } from "lucide-react";
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
} from "react";
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

type ThreadValue = { actions: ThreadActions; ensureName: () => Promise<boolean> };
const ThreadContext = createContext<ThreadValue | null>(null);

export const useThread = () => {
  const value = useContext(ThreadContext);
  if (!value) throw new Error("Thread components must be inside <NameGate>");
  return value;
};

// Asks for a first name the first time someone reacts or comments. No account.
export function NameGate({
  actions,
  myName,
  prompt,
  children,
}: {
  actions: ThreadActions;
  myName: string | null;
  prompt: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((joined: boolean) => void) | null>(null);
  const joined = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A page and the pop-out over it can each have one of these.
  const id = useId();

  const ensureName = () => {
    if (myName || joined.current) return Promise.resolve(true);
    setError(null);
    dialog.current?.showModal();
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  };

  const finish = (result: boolean) => {
    dialog.current?.close();
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <ThreadContext.Provider value={{ actions, ensureName }}>
      {children}
      <dialog
        ref={dialog}
        onCancel={() => finish(false)}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl p-6 shadow-xl backdrop:bg-black/50"
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
        >
          <h2 id={`${id}-title`} className="font-display text-2xl">
            What&apos;s your first name?
          </h2>
          <p className="mt-1 text-sm text-stone-600">{prompt}</p>
          <label htmlFor={`${id}-name`} className="sr-only">
            First name
          </label>
          <input
            id={`${id}-name`}
            name="firstName"
            required
            maxLength={40}
            autoComplete="given-name"
            placeholder="First name"
            className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
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
              className="flex-1 rounded-xl border border-stone-300 py-3 font-medium"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      </dialog>
    </ThreadContext.Provider>
  );
}

// The conversation about a home, Instagram-style: who said what, and who liked
// what, oldest first.
export function Timeline({
  listingKey,
  items,
  canShare = false,
  onReply,
  spots,
  empty,
}: {
  listingKey: string;
  items: TimelineItem[];
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
  return (
    <ul aria-label="Comments and likes" className="flex flex-col gap-5">
      {top.map((item) =>
        item.kind === "comment" ? (
          <CommentItem
            key={item.id}
            listingKey={listingKey}
            comment={item}
            replies={items.filter(
              (reply): reply is TimelineComment => reply.kind === "comment" && reply.parentId === item.id,
            )}
            canShare={canShare}
            onReply={onReply}
            spots={spots}
          />
        ) : (
          <ReactionItem key={item.id} item={item} />
        ),
      )}
    </ul>
  );
}

export type ReplyTarget = { id: string; name: string; mine: boolean };

function Avatar({
  name,
  anonymous = false,
  agent = false,
  badge,
  small = false,
}: {
  name: string;
  anonymous?: boolean;
  agent?: boolean;
  badge?: ReactNode;
  small?: boolean;
}) {
  return (
    <span aria-hidden className="relative shrink-0">
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-semibold",
          small ? "size-7 text-xs" : "size-9 text-sm",
          anonymous ? "bg-stone-200 text-stone-600" : agent ? "bg-ink text-white" : "bg-brand text-white",
        )}
      >
        {anonymous ? <User size={small ? 14 : 16} /> : name[0]?.toUpperCase()}
      </span>
      {badge && (
        <span className="absolute -bottom-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-white ring-1 ring-stone-200">
          {badge}
        </span>
      )}
    </span>
  );
}

// A person's name, linking to their profile when they have a public one.
function Who({ name, profileId }: { name: string; profileId?: string }) {
  if (!profileId) return <span className="font-semibold text-ink">{name}</span>;
  return (
    <Link href={`/people/${profileId}`} className="font-semibold text-ink underline-offset-2 hover:underline">
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

// "Morgan liked the marble counters" with a thumbnail of the photo.
function ReactionItem({ item }: { item: TimelineReaction }) {
  // Passed on it, or only said what they didn't like.
  const passed =
    item.state.reaction === "dislike" || (!item.state.reaction && !item.photos.length && item.photoDislikes.length > 0);
  const badge = passed ? (
    <ThumbsDown size={10} className="text-amber-800" />
  ) : item.state.reaction === "like" ? (
    <ThumbsUp size={10} className="text-emerald-700" />
  ) : (
    <Heart size={10} className="fill-rose-600 text-rose-600" />
  );
  // The photo of the latest thing they liked.
  const thumb = item.photos.findLast((photo) => photo.mediaUrl)?.mediaUrl;
  return (
    <li className="flex items-center gap-3">
      <Avatar name={item.name} anonymous={item.fromPrivateChat} badge={badge} />
      <p className="min-w-0 flex-1 break-words text-[15px] leading-snug">
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
        <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-stone-200">
          <Image src={thumb} alt="" fill sizes="40px" className="object-cover" />
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
  canShare,
  onReply,
  spots,
}: {
  listingKey: string;
  comment: TimelineComment;
  replies?: TimelineComment[];
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

  // Replies open when you add one, so you see it land.
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(replies.length);
  if (replies.length !== count) {
    setCount(replies.length);
    if (replies.length > count && replies.at(-1)?.mine) setOpen(true);
  }

  return (
    <li className="flex gap-3">
      <Avatar name={comment.name} anonymous={comment.fromPrivateChat} agent={comment.isAgent} small={reply} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1 text-[13px] leading-snug text-stone-500">
          <Who name={comment.name} profileId={comment.profileId} />
          {comment.isAgent && (
            <span className="rounded bg-ink px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">
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
            className="mt-0.5 inline-flex min-h-7 items-center gap-1 rounded-full bg-stone-100 px-2 text-[12px] font-semibold text-stone-700 hover:bg-stone-200"
          >
            <MapPin aria-hidden size={12} />
            <span className="sr-only">About </span>
            {spots.name(comment.spot)}
            <span className="sr-only">: show it</span>
          </button>
        )}
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug">{comment.body}</p>
        <div className="flex flex-wrap items-center gap-x-4 text-[13px] font-semibold text-stone-500">
          {likeable && !reply && onReply && (
            <button
              type="button"
              onClick={() => onReply({ id: comment.id, name: comment.name, mine: comment.mine })}
              className="flex min-h-9 items-center hover:text-ink"
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
              className="flex min-h-9 items-center text-brand underline-offset-2 hover:underline disabled:opacity-50"
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
              className="flex min-h-9 items-center gap-2.5 text-[13px] font-semibold text-stone-500 hover:text-ink"
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
        "-mr-1 flex size-9 shrink-0 flex-col items-center justify-center rounded-full text-[11px] font-semibold tabular-nums hover:bg-stone-100",
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
  compact = false,
  autoFocus = false,
}: {
  listingKey: string;
  canShare?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  onPosted?: () => void;
  // The spot in a photo the comment is about.
  spot?: SpotRef | null;
  placeholder?: string;
  // Just the box: no emoji row, no sharing (the card on a photo).
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const { actions, ensureName } = useThread();
  const [body, setBody] = useState("");
  // Back to the box after posting: the Post button disables once the box is
  // empty, and a focused disabled button swallows keys (like Escape).
  const field = useRef<HTMLTextAreaElement>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The same home can show a composer twice (a page and its pop-out), so ids are per instance.
  const inputId = useId();
  const who = replyTo ? (replyTo.mine ? "yourself" : replyTo.name) : null;

  const submit = async () => {
    if (!body.trim() || pending || !(await ensureName())) return;
    setError(null);
    startTransition(async () => {
      const result = await actions.comment(
        listingKey,
        body,
        canShare && !compact && !replyTo && sharePublicly,
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
            className="flex min-h-9 items-center px-1 font-semibold hover:text-ink"
          >
            Cancel<span className="sr-only"> reply</span>
          </button>
        </p>
      ) : compact ? null : (
        <div className="flex justify-between px-1 pb-1">
          {QUICK.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setBody((current) => current + emoji);
                field.current?.focus();
              }}
              className="flex size-10 items-center justify-center rounded-full text-[22px] transition-transform hover:bg-stone-100 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-3xl bg-stone-100 py-1 pl-4 pr-1 focus-within:ring-2 focus-within:ring-brand/50">
        <label htmlFor={inputId} className="sr-only">
          {who ? `Reply to ${who}` : (placeholder?.replace(/…$/, "") ?? "Add a comment")}
        </label>
        <textarea
          ref={field}
          id={inputId}
          data-composer
          value={body}
          onChange={(event) => setBody(event.target.value)}
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
          className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none [field-sizing:content] placeholder:text-stone-500"
        />
        <button
          type="submit"
          aria-label="Post"
          disabled={pending || !body.trim()}
          className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-30"
        >
          <ArrowUp aria-hidden size={18} strokeWidth={2.5} className={cn(pending && "animate-pulse")} />
        </button>
      </div>
      {canShare && !compact && !replyTo && (
        <label className="mt-1.5 flex min-h-9 cursor-pointer items-center gap-2.5 px-2 text-[13px] text-stone-700">
          <input
            type="checkbox"
            checked={sharePublicly}
            onChange={(event) => setSharePublicly(event.target.checked)}
            className="size-4.5 shrink-0 accent-[var(--brand)]"
          />
          <span>Also share this anonymously on the public listing page. Your name stays private.</span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-1 px-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
