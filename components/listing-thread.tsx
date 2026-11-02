"use client";

import { Globe, Heart, HelpCircle, ThumbsDown, ThumbsUp, X } from "lucide-react";
import {
  createContext,
  useContext,
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
import type { CommentTag, Reaction } from "@/lib/shares";
import { ListingFacts } from "./listing-facts";
import { ViewTracker } from "./view-tracker";

// The same reactions and comments UI serves private share links and public
// listing pages. Each passes in Server Actions bound to its own thread.
export type ThreadActions = {
  join: (firstName: string) => Promise<ActionResult>;
  react: (listingKey: string, reaction: Reaction | null) => Promise<ActionResult>;
  comment: (
    listingKey: string,
    body: string,
    tag: CommentTag | null,
    sharePublicly: boolean,
  ) => Promise<ActionResult>;
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

const REACTIONS: { value: Reaction; label: string; verb: string; icon: typeof Heart }[] = [
  { value: "love", label: "Love", verb: "love it", icon: Heart },
  { value: "maybe", label: "Maybe", verb: "maybe", icon: HelpCircle },
  { value: "pass", label: "Pass", verb: "pass", icon: X },
];

const MAX_NAMED_REACTIONS = 6;

export type CardReaction = { name: string; reaction: Reaction; mine: boolean };
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

export function ReactionBar({
  listingKey,
  reactions,
}: {
  listingKey: string;
  reactions: CardReaction[];
}) {
  const { actions, ensureName } = useThread();
  const serverMine = reactions.find((r) => r.mine)?.reaction ?? null;
  const [mine, setOptimisticMine] = useOptimistic(serverMine);
  const [, startReaction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const others = reactions.filter((r) => !r.mine);

  const react = async (value: Reaction) => {
    if (!(await ensureName())) return;
    const next = mine === value ? null : value;
    setError(null);
    startReaction(async () => {
      setOptimisticMine(next);
      const result = await actions.react(listingKey, next);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <>
      <div role="group" aria-label="Your reaction" className="grid grid-cols-3 gap-2">
        {REACTIONS.map(({ value, label, icon: Icon }) => {
          const selected = mine === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => react(value)}
              className={cn(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors",
                selected
                  ? "border-brand bg-brand text-white"
                  : "border-stone-300 bg-white text-stone-800 hover:border-stone-500",
              )}
            >
              <Icon aria-hidden size={18} fill={selected && value === "love" ? "currentColor" : "none"} />
              {label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {others.length > 0 && (
        <p className="mt-3 text-sm text-stone-700">
          {others
            .slice(0, MAX_NAMED_REACTIONS)
            .map((r) => `${r.name}: ${REACTIONS.find((x) => x.value === r.reaction)?.verb}`)
            .join(" · ")}
          {others.length > MAX_NAMED_REACTIONS && ` · and ${others.length - MAX_NAMED_REACTIONS} more`}
        </p>
      )}
    </>
  );
}

export function CommentThread({
  listingKey,
  comments,
}: {
  listingKey: string;
  comments: CardComment[];
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
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ul>
      )}
      <CommentComposer listingKey={listingKey} />
    </>
  );
}

// A whole listing in one card: the layout used on share links.
export function ListingCard({
  listing,
  priority,
  reactions,
  comments,
}: {
  listing: Listing;
  priority: boolean;
  reactions: CardReaction[];
  comments: CardComment[];
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
          <ReactionBar listingKey={listing.ListingKey} reactions={reactions} />
        </div>
      </div>
      <div className="border-t border-stone-200 bg-stone-50/70 p-5">
        <CommentThread listingKey={listing.ListingKey} comments={comments} />
        <p className="mt-4 text-xs text-stone-600">
          {listing.ListOfficeName && `Listed by ${listing.ListOfficeName}. `}
          {isSampleListing(listing) && "Sample listing, not a real home for sale."}
        </p>
      </div>
    </article>
  );
}

function CommentRow({ comment }: { comment: CardComment }) {
  const { actions } = useThread();
  const [pending, startTransition] = useTransition();
  const canToggle = comment.mine && comment.tag === "like" && actions.setSharing;
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

function CommentComposer({ listingKey }: { listingKey: string }) {
  const { actions, ensureName } = useThread();
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<CommentTag | null>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `comment-${listingKey}`;
  const canShare = Boolean(actions.setSharing) && tag === "like";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || !(await ensureName())) return;
    setError(null);
    startTransition(async () => {
      const result = await actions.comment(listingKey, body, tag, canShare && sharePublicly);
      if (result.ok) {
        setBody("");
        setTag(null);
        setSharePublicly(false);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="mt-3">
      <div role="group" aria-label="Comment type" className="flex gap-2">
        {(["like", "dislike"] as const).map((value) => {
          const like = value === "like";
          const Icon = like ? ThumbsUp : ThumbsDown;
          const selected = tag === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTag(selected ? null : value)}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                selected
                  ? like
                    ? "border-emerald-800 bg-emerald-100 text-emerald-900"
                    : "border-amber-800 bg-amber-100 text-amber-900"
                  : "border-stone-300 bg-white text-stone-800",
              )}
            >
              <Icon aria-hidden size={14} />
              {like ? "Like" : "Don't like"}
            </button>
          );
        })}
      </div>
      <label htmlFor={inputId} className="sr-only">
        Add a comment
      </label>
      <textarea
        id={inputId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={
          tag === "like"
            ? "What do you like about it?"
            : tag === "dislike"
              ? "What don't you like about it?"
              : "Add a comment…"
        }
        className="mt-2 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
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
