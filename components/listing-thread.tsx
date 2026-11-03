"use client";

import { Check, ChevronDown, Globe, ThumbsDown, ThumbsUp } from "lucide-react";
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
import { PhotoCarousel } from "@/components/photo-carousel";
import type { ActionResult } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import { isSampleListing, type Listing } from "@/lib/listings/types";
import {
  ASPECTS,
  describeReaction,
  NO_REACTION,
  toggleAspect,
  toggleOverall,
  type ReactionState,
  type Sentiment,
} from "@/lib/reactions";
import type { CommentTag } from "@/lib/shares";
import { ListingFacts } from "./listing-facts";
import { ViewTracker } from "./view-tracker";

// The same reactions and comments UI serves private share links and public
// listing pages. Each passes in Server Actions bound to its own thread.
export type ThreadActions = {
  join: (firstName: string) => Promise<ActionResult>;
  react: (listingKey: string, state: ReactionState) => Promise<ActionResult>;
  comment: (listingKey: string, body: string, sharePublicly: boolean) => Promise<ActionResult>;
  // Private threads only: an author shares or un-shares their own "Like" comment.
  setSharing?: (commentId: string, shared: boolean) => Promise<ActionResult>;
};

type ThreadValue = { actions: ThreadActions; ensureName: () => Promise<boolean> };
const ThreadContext = createContext<ThreadValue | null>(null);

const useThread = () => {
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
        aria-labelledby="name-title"
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
          <h2 id="name-title" className="font-display text-2xl">
            What&apos;s your first name?
          </h2>
          <p className="mt-1 text-sm text-stone-600">{prompt}</p>
          <label htmlFor="firstName" className="sr-only">
            First name
          </label>
          <input
            id="firstName"
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

const SENTIMENTS = [
  {
    value: "like",
    label: "Like",
    icon: ThumbsUp,
    question: "What do you like?",
    on: "border-emerald-700 bg-emerald-700 text-white",
    chipOn: "border-emerald-700 bg-emerald-50 text-emerald-900",
  },
  {
    value: "dislike",
    label: "Dislike",
    icon: ThumbsDown,
    question: "What don't you like?",
    on: "border-amber-800 bg-amber-800 text-white",
    chipOn: "border-amber-800 bg-amber-50 text-amber-900",
  },
] as const;

const MAX_NAMED_REACTIONS = 6;

export type CardReaction = { name: string; state: ReactionState; mine: boolean };
export type CardComment = {
  id: string;
  name: string;
  isAgent: boolean;
  tag: CommentTag | null;
  body: string;
  createdAt: string;
  mine: boolean;
  sharedPublicly?: boolean;
};

// Like or Dislike in one tap. Each has a dropdown of specifics (kitchen, yard,
// ...), so people can say what they mean without typing.
export function ReactionPicker({
  listingKey,
  reactions,
  pass = false,
}: {
  listingKey: string;
  reactions: CardReaction[];
  // Client links call the negative choice Pass rather than Dislike.
  pass?: boolean;
}) {
  const { actions, ensureName } = useThread();
  const [mine, setMine] = useOptimistic(reactions.find((r) => r.mine)?.state ?? NO_REACTION);
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState<Sentiment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const others = reactions.filter((r) => !r.mine);

  const save = async (next: ReactionState) => {
    if (!(await ensureName())) return false;
    setError(null);
    startTransition(async () => {
      setMine(next);
      const result = await actions.react(listingKey, next);
      if (!result.ok) setError(result.error);
    });
    return true;
  };

  const tapOverall = async (sentiment: Sentiment) => {
    const next = toggleOverall(mine, sentiment);
    // Offer the specifics right away; picking any is optional.
    if (await save(next)) setOpen(next.reaction === sentiment ? sentiment : null);
  };

  const openSentiment = SENTIMENTS.find((s) => s.value === open);
  const openList = open === "like" ? mine.liked : mine.disliked;

  return (
    <div>
      <div role="group" aria-label="Your reaction" className="grid grid-cols-2 gap-2">
        {SENTIMENTS.map(({ value, label: baseLabel, icon: Icon, question, on }) => {
          const label = pass && value === "dislike" ? "Pass" : baseLabel;
          const selected = mine.reaction === value;
          const picked = (value === "like" ? mine.liked : mine.disliked).length;
          return (
            <div
              key={value}
              className={cn(
                "flex overflow-hidden rounded-xl border transition-colors",
                selected ? on : "border-stone-300 bg-white text-stone-800",
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => tapOverall(value)}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 font-semibold hover:bg-black/5"
              >
                <Icon aria-hidden size={18} strokeWidth={selected ? 2.5 : 2} />
                {label}
                {picked > 0 && <span className="text-sm font-medium opacity-90">· {picked}</span>}
              </button>
              <button
                type="button"
                aria-label={question}
                aria-expanded={open === value}
                aria-controls={open === value ? panelId : undefined}
                onClick={() => setOpen(open === value ? null : value)}
                className={cn(
                  "flex w-11 shrink-0 items-center justify-center border-l hover:bg-black/5",
                  selected ? "border-white/30" : "border-stone-300",
                )}
              >
                <ChevronDown
                  aria-hidden
                  size={18}
                  className={cn("transition-transform motion-reduce:transition-none", open === value && "rotate-180")}
                />
              </button>
            </div>
          );
        })}
      </div>

      {openSentiment && (
        <div id={panelId} className="mt-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <p className="text-sm font-semibold">
            {openSentiment.question} <span className="font-normal text-stone-600">Pick any.</span>
          </p>
          <div role="group" aria-label={openSentiment.question} className="mt-2 flex flex-wrap gap-2">
            {ASPECTS.map(({ id, label }) => {
              const on = openList.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => save(toggleAspect(mine, openSentiment.value, id))}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    on ? openSentiment.chipOn : "border-stone-300 bg-white text-stone-800 hover:border-stone-500",
                  )}
                >
                  {on && <Check aria-hidden size={14} />}
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mt-2 min-h-11 px-1 text-sm font-semibold text-brand"
          >
            Done
          </button>
        </div>
      )}

      {!open && (mine.liked.length > 0 || mine.disliked.length > 0) && (
        <p className="mt-2 text-sm text-stone-700">You {describeReaction(mine, { pass })}.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {others.length > 0 && (
        <p className="mt-3 text-sm text-stone-700">
          {others
            .slice(0, MAX_NAMED_REACTIONS)
            .map((r) => `${r.name} ${describeReaction(r.state, { pass })}`)
            .join(" · ")}
          {others.length > MAX_NAMED_REACTIONS && ` · and ${others.length - MAX_NAMED_REACTIONS} more`}
        </p>
      )}
    </div>
  );
}

// A quick thumbs-up for cards: likes the whole home, or un-likes it.
export function LikeButton({
  listingKey,
  mine,
  label,
  className,
}: {
  listingKey: string;
  mine: ReactionState;
  label: string;
  className?: string;
}) {
  const { actions, ensureName } = useThread();
  const [state, setState] = useOptimistic(mine);
  const [, startTransition] = useTransition();
  const liked = state.reaction === "like";
  return (
    <button
      type="button"
      aria-label={`Like ${label}`}
      aria-pressed={liked}
      onClick={async () => {
        if (!(await ensureName())) return;
        const next = toggleOverall(state, "like");
        startTransition(async () => {
          setState(next);
          await actions.react(listingKey, next);
        });
      }}
      className={cn(
        "flex size-11 items-center justify-center rounded-full shadow transition-colors",
        liked ? "bg-emerald-700 text-white" : "bg-white/95 text-stone-800 hover:text-emerald-700",
        className,
      )}
    >
      <ThumbsUp aria-hidden size={20} strokeWidth={liked ? 2.5 : 2} />
    </button>
  );
}

export function CommentThread({
  listingKey,
  comments,
  canShare = false,
}: {
  listingKey: string;
  comments: CardComment[];
  // Private threads only, once someone likes the home: they may share a comment publicly.
  canShare?: boolean;
}) {
  return (
    <>
      <h3 className="text-sm font-semibold">
        {comments.length === 0
          ? "What do you think?"
          : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
      </h3>
      {comments.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} canShare={canShare} />
          ))}
        </ul>
      )}
      <CommentComposer listingKey={listingKey} canShare={canShare} />
    </>
  );
}

// A whole listing in one card: the layout used on share links.
export function ListingCard({
  listing,
  priority,
  reactions,
  comments,
  pass = false,
}: {
  listing: Listing;
  priority: boolean;
  reactions: CardReaction[];
  comments: CardComment[];
  pass?: boolean;
}) {
  return (
    <article
      aria-label={listing.UnparsedAddress}
      className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"
    >
      <ViewTracker listingKey={listing.ListingKey} />
      <PhotoCarousel media={listing.Media} address={listing.UnparsedAddress} priority={priority} />
      <div className="p-5">
        <ListingFacts listing={listing} />
        <div className="mt-5">
          <ReactionPicker listingKey={listing.ListingKey} reactions={reactions} pass={pass} />
        </div>
      </div>
      <div className="border-t border-stone-200 bg-stone-50/70 p-5">
        <CommentThread
          listingKey={listing.ListingKey}
          comments={comments}
          canShare={reactions.find((r) => r.mine)?.state.reaction === "like"}
        />
        <p className="mt-4 text-xs text-stone-600">
          {listing.ListOfficeName && `Listed by ${listing.ListOfficeName}. `}
          {isSampleListing(listing) && "Sample listing, not a real home for sale."}
        </p>
      </div>
    </article>
  );
}

function CommentRow({ comment, canShare }: { comment: CardComment; canShare: boolean }) {
  const { actions } = useThread();
  const [pending, startTransition] = useTransition();
  // Taking a comment back is always allowed; sharing it needs a like.
  const canToggle =
    comment.mine && actions.setSharing && (comment.sharedPublicly || canShare);
  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold">{comment.mine ? "You" : comment.name}</span>
        {comment.isAgent && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
            Agent
          </span>
        )}
        {comment.tag && <TagChip tag={comment.tag} />}
        <time dateTime={comment.createdAt} suppressHydrationWarning className="ml-auto text-xs text-stone-600">
          {timeAgo(comment.createdAt)}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed">{comment.body}</p>
      {(comment.sharedPublicly || canToggle) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
          {comment.sharedPublicly && (
            <span className="inline-flex items-center gap-1">
              <Globe aria-hidden size={12} /> Shared anonymously on the public page
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
              className="min-h-8 font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50"
            >
              {comment.sharedPublicly ? "Make private" : "Share anonymously"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function TagChip({ tag }: { tag: CommentTag }) {
  const like = tag === "like";
  const Icon = like ? ThumbsUp : ThumbsDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        like ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
      )}
    >
      <Icon aria-hidden size={11} />
      {like ? "Like" : "Don't like"}
    </span>
  );
}

export function CommentComposer({
  listingKey,
  compact = false,
  canShare = false,
}: {
  listingKey: string;
  // A single line, for the feed.
  compact?: boolean;
  canShare?: boolean;
}) {
  const { actions, ensureName } = useThread();
  const [body, setBody] = useState("");
  const [sharePublicly, setSharePublicly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `comment-${listingKey}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || !(await ensureName())) return;
    setError(null);
    startTransition(async () => {
      const result = await actions.comment(listingKey, body, canShare && sharePublicly);
      if (result.ok) {
        setBody("");
        setSharePublicly(false);
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
            Add a comment
          </label>
          <input
            id={inputId}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={1000}
            placeholder="Add a comment…"
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
