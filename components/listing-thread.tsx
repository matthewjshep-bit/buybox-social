"use client";

import { Globe, Heart, Lock, ThumbsDown, ThumbsUp, User } from "lucide-react";
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
  ) => Promise<ActionResult>;
  // Private threads only: an author shares or un-shares their own comment.
  setSharing?: (commentId: string, shared: boolean) => Promise<ActionResult>;
  // Public threads only: liking a comment, which also turns on replies.
  likeComment?: (commentId: string, liked: boolean) => Promise<ActionResult>;
  // Liking something in a photo ("the kitchen").
  likePhoto?: (listingKey: string, mediaKey: string, tag: string, liked: boolean) => Promise<ActionResult>;
};

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
  composer = true,
}: {
  listingKey: string;
  items: TimelineItem[];
  // Private threads only, once someone likes the home: they may share a comment publicly.
  canShare?: boolean;
  composer?: boolean;
}) {
  const top = items.filter((item) => item.kind === "reaction" || !item.parentId);
  return (
    <>
      {top.length > 0 ? (
        <ul aria-label="Comments and likes" className="flex flex-col gap-4">
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
              />
            ) : (
              <ReactionItem key={item.id} item={item} />
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-stone-600">No comments yet. Start the conversation.</p>
      )}
      {composer && <CommentComposer listingKey={listingKey} canShare={canShare} />}
    </>
  );
}

// The latest few, for a card in the stream. The full conversation is a tap away.
export function TimelinePreview({ items, total, href }: { items: TimelineItem[]; total: number; href: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      {total > items.length && (
        <Link href={href} scroll={false} className="flex min-h-9 items-center text-[15px] text-stone-600">
          View all {total}
        </Link>
      )}
      <ul aria-label="Latest comments and likes" className="mt-1 flex flex-col gap-2.5">
        {items.map((item) =>
          item.kind === "comment" ? (
            <li key={item.id} className="flex items-start gap-2.5">
              <Avatar name={item.name} anonymous={item.fromPrivateChat} agent={item.isAgent} small />
              <p className="min-w-0 flex-1 break-words pt-0.5 text-[15px] leading-snug">
                <Who name={item.name} profileId={item.profileId} />{" "}
                <span className="whitespace-pre-line">{item.body}</span>
                {item.fromPrivateChat && <span className="text-xs text-stone-600"> · from a private chat</span>}
              </p>
            </li>
          ) : (
            <ReactionItem key={item.id} item={item} small />
          ),
        )}
      </ul>
    </div>
  );
}

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
  if (!profileId) return <span className="font-semibold">{name}</span>;
  return (
    <Link href={`/people/${profileId}`} className="font-semibold underline-offset-2 hover:underline">
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
function ReactionItem({ item, small = false }: { item: TimelineReaction; small?: boolean }) {
  const passed = item.state.reaction === "dislike";
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
    <li className={cn("flex items-center", small ? "gap-2.5" : "gap-3")}>
      <Avatar name={item.name} anonymous={item.fromPrivateChat} badge={badge} small={small} />
      <p className="min-w-0 flex-1 break-words text-[15px] leading-snug">
        <Who name={item.mine ? "You" : item.name} profileId={item.profileId} />{" "}
        {describeReaction(
          item.state,
          item.photos.map((photo) => photo.tag),
        )}
        <span className="text-xs text-stone-600">
          {" "}
          · <When at={item.at} />
          {item.fromPrivateChat && " · private chat"}
        </span>
      </p>
      {thumb && (
        <span className={cn("relative shrink-0 overflow-hidden rounded-md bg-stone-200", small ? "size-8" : "size-10")}>
          <Image src={thumb} alt="" fill sizes="40px" className="object-cover" />
        </span>
      )}
    </li>
  );
}

function CommentItem({
  listingKey,
  comment,
  replies = [],
  canShare,
}: {
  listingKey: string;
  comment: TimelineComment;
  replies?: TimelineComment[];
  canShare: boolean;
}) {
  const { actions } = useThread();
  const [pending, startTransition] = useTransition();
  const [replying, setReplying] = useState(false);
  const reply = Boolean(comment.parentId);
  // Taking a comment back is always allowed; sharing it needs a like.
  const canToggle = comment.mine && actions.setSharing && (comment.sharedPublicly || canShare);
  const likeable = Boolean(actions.likeComment) && !comment.fromPrivateChat;
  return (
    <li className="flex gap-3">
      <Avatar name={comment.name} anonymous={comment.fromPrivateChat} agent={comment.isAgent} small={reply} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] leading-snug">
          {/* Comments carry their author's name, yours included, like on Instagram. */}
          <Who name={comment.name} profileId={comment.profileId} />
          {comment.isAgent && (
            <span className="ml-1.5 rounded bg-ink px-1.5 py-px align-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
              Agent
            </span>
          )}{" "}
          <span className="whitespace-pre-line">{comment.body}</span>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-stone-600">
          <When at={comment.at} />
          {comment.fromPrivateChat && (
            <span className="inline-flex items-center gap-1">
              <Lock aria-hidden size={11} /> Shared from a private chat
            </span>
          )}
          {comment.likes > 0 && likeable && (
            <span className="font-semibold">
              {comment.likes} {comment.likes === 1 ? "like" : "likes"}
            </span>
          )}
          {likeable && !reply && (
            <button
              type="button"
              aria-expanded={replying}
              onClick={() => setReplying((open) => !open)}
              className="flex min-h-9 items-center font-semibold hover:text-stone-900"
            >
              Reply
              <span className="sr-only"> to {comment.mine ? "your comment" : comment.name}</span>
            </button>
          )}
          {comment.sharedPublicly && (
            <span className="inline-flex items-center gap-1">
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
              className="flex min-h-9 items-center font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50"
            >
              {comment.sharedPublicly ? "Make private" : "Share anonymously"}
            </button>
          )}
        </div>
        {(replies.length > 0 || replying) && (
          <div className="mt-2">
            {replies.length > 0 && (
              <ul aria-label={`Replies to ${comment.name}`} className="flex flex-col gap-3">
                {replies.map((child) => (
                  <CommentItem key={child.id} listingKey={listingKey} comment={child} canShare={false} />
                ))}
              </ul>
            )}
            {replying && (
              <CommentComposer
                compact
                listingKey={listingKey}
                parentId={comment.id}
                replyTo={comment.mine ? "yourself" : comment.name}
                onPosted={() => setReplying(false)}
              />
            )}
          </div>
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
        "-mr-2 -mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-stone-100",
        state.liked ? "text-rose-600" : "text-stone-500",
      )}
    >
      <Heart aria-hidden size={14} className={cn(state.liked && "fill-current")} />
    </button>
  );
}

export function CommentComposer({
  listingKey,
  compact = false,
  canShare = false,
  parentId = null,
  replyTo,
  onPosted,
}: {
  listingKey: string;
  // A single line, for the feed and for replies.
  compact?: boolean;
  canShare?: boolean;
  parentId?: string | null;
  replyTo?: string;
  onPosted?: () => void;
}) {
  const { actions, ensureName } = useThread();
  const [body, setBody] = useState("");
  // Back to the box after posting: the Post button disables once the box is
  // empty, and a focused disabled button swallows keys (like Escape).
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The same home can show a composer twice (a card and its pop-out), so ids are per instance.
  const inputId = useId();
  const label = replyTo ? `Reply to ${replyTo}` : "Add a comment";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || !(await ensureName())) return;
    setError(null);
    startTransition(async () => {
      const result = await actions.comment(listingKey, body, canShare && sharePublicly, parentId);
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

  if (compact) {
    return (
      <form onSubmit={submit} className="mt-2 border-t border-stone-100 pt-1">
        <div className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          <input
            ref={field}
            id={inputId}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={1000}
            autoFocus={Boolean(parentId)}
            placeholder={parentId ? "Write a reply…" : "Add a comment…"}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-stone-500"
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="min-h-11 px-2 font-semibold text-brand disabled:opacity-40"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <label htmlFor={inputId} className="sr-only">
        Add a comment
      </label>
      <textarea
        ref={field}
        id={inputId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Add a comment…"
        className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      {canShare && (
        <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={sharePublicly}
            onChange={(event) => setSharePublicly(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
          />
          <span>
            Also share this anonymously on the public listing page, to help other buyers. Your
            name stays private.
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="mt-2 min-h-11 w-full rounded-xl bg-brand font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post comment"}
      </button>
    </form>
  );
}
