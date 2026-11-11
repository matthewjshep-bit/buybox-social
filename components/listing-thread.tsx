"use client";

import { ArrowUp, Globe, Heart, Lock, MapPin, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { CodeSignIn } from "@/components/code-sign-in";
import { useSignedIn } from "@/components/session";
import { Sheet } from "@/components/sheet";
import { Hotspot } from "@/components/spot-highlight";
import { Avatar, Badge } from "@/components/ui";
import type { ActionResult } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { FACTS, mediaKeyOf, tagPosition, type SpotReaction } from "@/lib/photos";
import { describeReaction, type ReactionState } from "@/lib/reactions";
import type { TimelineComment, TimelineItem, TimelineReaction } from "@/lib/timeline";
import { button, card, field } from "@/lib/ui";

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

// The first time someone likes or says something: signed out, a sheet that
// rises like everything else to sign up (or in) right here, a first name, an
// email and the code we email them, and then what they did goes through;
// signed in, they're simply in, by their account's name (asked for only if
// it has none).
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
  // Signing up, or (signed in, with no name yet) just the name.
  const [mode, setMode] = useState<"join" | "name">("join");
  const signedIn = useSignedIn();
  const router = useRouter();
  const nameBox = useRef<HTMLInputElement>(null);
  const resolver = useRef<((joined: boolean) => void) | null>(null);
  const joined = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A page and the pop-out over it can each have one of these.
  const id = useId();

  const ask = (as: "join" | "name") => {
    // Open, and the cursor in the first box, in the same tap: a phone only
    // shows its keyboard for that.
    flushSync(() => {
      setError(null);
      setMode(as);
      setAsking(true);
    });
    const first = as === "name" ? nameBox.current : document.querySelector<HTMLInputElement>(`[data-join="${id}"] input`);
    first?.focus();
    first?.select();
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  };

  const ensureName = async () => {
    if (joined.current || (signedIn && myName)) return true;
    if (!signedIn) return ask("join");
    // Signed in, and new to this conversation: in by their account's name.
    const result = await actions.join("").catch(() => ({ ok: false as const, error: "" }));
    if (result.ok) {
      joined.current = true;
      router.refresh();
      return true;
    }
    return ask("name");
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
        label={mode === "join" ? "Sign up to like and comment" : "What's your first name?"}
        title={mode === "join" ? "Sign up to like and comment" : "What's your first name?"}
        anchor={anchor}
      >
        {mode === "join" ? (
          <div data-join={id} className="mx-auto max-w-sm px-1 pb-1">
            <p className="text-center text-sm text-muted">{prompt}</p>
            {nameHint && (
              <p id={`${id}-hint`} className="mt-2 text-balance text-center text-meta text-muted">
                {nameHint}
              </p>
            )}
            <div className="mt-4">
              <CodeSignIn
                withName
                suggestedName={suggestedName}
                nameHint={nameHint ? `${id}-hint` : undefined}
                note="Free, and no password. Signed up before? Use the same email."
                onDone={async ({ firstName }) => {
                  // Now on this page's conversation too, as themselves.
                  const result = await actions.join(firstName ?? "").catch(() => ({ ok: false as const, error: "" }));
                  router.refresh();
                  if (result.ok) {
                    joined.current = true;
                    finish(true);
                  } else {
                    setError(result.error || "That didn't save. Try again.");
                  }
                }}
              />
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => finish(false)}
              className={cn(button({ kind: "ghost", block: true }), "mt-2 text-stone-700")}
            >
              Not now
            </button>
          </div>
        ) : (
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
          <p className="text-center text-sm text-muted">{prompt}</p>
          {nameHint && (
            <p id={`${id}-hint`} className="mt-3 text-balance text-center text-meta text-muted">
              {nameHint}
            </p>
          )}
          <label htmlFor={`${id}-name`} className="sr-only">
            First name
          </label>
          <input
            ref={nameBox}
            id={`${id}-name`}
            name="firstName"
            required
            maxLength={40}
            autoComplete="given-name"
            aria-describedby={nameHint ? `${id}-hint` : undefined}
            defaultValue={suggestedName}
            placeholder="First name"
            className={cn(field(), nameHint ? "mt-1.5" : "mt-4")}
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
              className={cn(button({ kind: "secondary", size: "lg" }), "flex-1")}
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn(button({ kind: "primary", size: "lg" }), "flex-1")}
            >
              {pending ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
        )}
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
  listing,
  limit,
  onSeeAll,
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
  // The home, for the photo each card is about.
  listing?: Listing;
  // Only the newest few, then "See all".
  limit?: number;
  onSeeAll?: () => void;
}) {
  const top = items.filter((item) => item.kind === "reaction" || !item.parentId);
  if (top.length === 0) {
    return (
      empty ?? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <p className="text-lg font-semibold">No comments yet</p>
          <p className="mt-1 text-sm text-muted">Start the conversation.</p>
        </div>
      )
    );
  }
  // A feed, newest first, as on a profile: one card for each thing someone
  // said, and one for what each person liked (or passed on), each with the
  // photo it was about and where on it.
  const feed = [...top].sort((a, b) => b.at.localeCompare(a.at));
  const shown = limit ? feed.slice(0, limit) : feed;
  return (
    <>
      <ul aria-label="Comments and likes" className="flex flex-col gap-3">
        {shown.map((item) =>
          item.kind === "comment" ? (
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
              listing={listing}
            />
          ) : (
            <ReactionItem
              key={item.id}
              listingKey={listingKey}
              item={item}
              replies={items.filter(
                (reply): reply is TimelineComment => reply.kind === "comment" && reply.parentId === item.id,
              )}
              opened={opened}
              onReply={onReply}
              listing={listing}
              spots={spots}
            />
          ),
        )}
      </ul>
      {shown.length < feed.length && onSeeAll && (
        <button type="button" onClick={onSeeAll} className={cn(button({ kind: "secondary" }), "mt-3 w-full")}>
          See all {feed.length}
        </button>
      )}
    </>
  );
}

// The photo a card is about, whole and at its own shape (never taller than
// 12rem), with a soft hotspot on each spot: no hearts, just where. A tap
// takes you there on the home's photo.
function FeedPhoto({
  listing,
  mediaKey,
  tags,
  spots,
}: {
  listing: Listing;
  mediaKey: string;
  tags: string[];
  spots?: SpotLinks;
}) {
  const photo = listing.Media.find((media) => mediaKeyOf(media) === mediaKey);
  if (!photo) return null;
  const ratio = photo.ImageWidth && photo.ImageHeight ? photo.ImageWidth / photo.ImageHeight : 4 / 3;
  const marks = tags.flatMap((tag) => {
    const at = tagPosition(photo, tag);
    return at ? [{ tag, ...at }] : [];
  });
  const picture = (
    <span
      className="relative block overflow-hidden rounded-xl bg-stone-100"
      style={{ aspectRatio: String(ratio), width: `min(100%, ${12 * ratio}rem)` }}
    >
      <Image src={photo.MediaURL} alt="" fill sizes="(min-width: 64rem) 360px, 90vw" className="object-cover" />
      {marks.map((mark) => (
        <span
          key={mark.tag}
          data-spot-tag={mark.tag}
          className="absolute size-0"
          style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
        >
          <Hotspot small />
        </span>
      ))}
    </span>
  );
  const first = marks[0];
  if (!spots || !first) return <span className="mt-2 block">{picture}</span>;
  return (
    <button
      type="button"
      onClick={() => spots.show({ mediaKey, tag: first.tag })}
      aria-label={`Show ${spots.name({ mediaKey, tag: first.tag })} on the photo`}
      // (As wide as the card, so the photo inside can size itself from it.)
      className="mt-2 block w-full rounded-xl text-left transition-opacity hover:opacity-90"
    >
      {picture}
    </button>
  );
}

// Passed on the home, or only said what they didn't like.
const passedOn = (item: TimelineReaction) =>
  item.state.reaction === "dislike" || (!item.state.reaction && !item.photos.length && item.photoDislikes.length > 0);

// What a reply answers: a comment, or someone's likes ("like:…"). `mention`:
// it answers a reply in that thread, so it starts with "@" and their name.
export type ReplyTarget = { id: string; name: string; mine: boolean; mention?: boolean };

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

// "Morgan liked the marble counters and the front door", with the photo of
// the latest of them and a hotspot on each thing they picked out in it.
function ReactionItem({
  listingKey,
  item,
  replies,
  opened,
  onReply,
  listing,
  spots,
}: {
  listingKey: string;
  item: TimelineReaction;
  // Said in answer to their likes.
  replies: TimelineComment[];
  opened?: string;
  onReply?: (target: ReplyTarget) => void;
  listing?: Listing;
  spots?: SpotLinks;
}) {
  const badge = passedOn(item) ? (
    <ThumbsDown size={8} className="text-amber-800" />
  ) : (
    <Heart size={8} className="fill-rose-600 text-rose-600" />
  );
  // The photo of the latest thing they picked out, and everything they
  // picked out in it.
  const things = [...item.photos, ...item.photoDislikes].filter((thing) => thing.mediaKey && thing.mediaKey !== FACTS);
  const latest = things.reduce<(typeof things)[number] | null>(
    (now, thing) => (!now || (thing.at ?? "") > (now.at ?? "") ? thing : now),
    null,
  );
  const onLatest = latest ? things.filter((thing) => thing.mediaKey === latest.mediaKey).map((thing) => thing.spot ?? thing.tag) : [];
  return (
    <li className={cn(card, "p-3.5")}>
      <div className="flex items-start gap-3">
        <Avatar name={item.name} tone={item.fromPrivateChat ? "anonymous" : "person"} size={9} badge={badge} />
        <p className="min-w-0 flex-1 break-words pt-0.5 text-body leading-snug">
          <Who name={item.mine ? "You" : item.name} profileId={item.profileId} />{" "}
          {describeReaction(
            item.state,
            item.photos.map((photo) => photo.tag),
            item.photoDislikes.map((photo) => photo.tag),
          )}
          <span className="text-meta text-stone-500">
            {" "}
            · <When at={item.at} />
            {item.fromPrivateChat && " · private chat"}
          </span>
        </p>
      </div>
      <div className="pl-12">
        {listing && latest?.mediaKey && (
          <FeedPhoto listing={listing} mediaKey={latest.mediaKey} tags={onLatest} spots={spots} />
        )}
        {/* Anyone named can be answered, as a comment can. */}
        {item.replyRef && onReply && (
          <div className="flex text-meta font-semibold text-stone-500">
            <button
              type="button"
              onClick={() => onReply({ id: item.replyRef!, name: item.name, mine: item.mine })}
              className="flex min-h-9 items-center hit-44 hover:text-ink"
            >
              Reply
              <span className="sr-only"> to {item.mine ? "your likes" : `${item.name}'s likes`}</span>
            </button>
          </div>
        )}
        <Replies
          listingKey={listingKey}
          replies={replies}
          opened={opened}
          label={item.mine ? "your likes" : `${item.name}'s likes`}
          thread={item.replyRef}
          onReply={onReply}
        />
      </div>
    </li>
  );
}

// The replies under a comment, or under someone's likes: folded away under
// "View 2 replies", like on a reel; open when you came to see one of them, or
// when you've just added one. Each can be answered too, in the same thread.
function Replies({
  listingKey,
  replies,
  opened,
  label,
  thread,
  onReply,
}: {
  listingKey: string;
  replies: TimelineComment[];
  opened?: string;
  // What they answer, for screen readers: "Maya's comment", "Sam's likes".
  label: string;
  // What a reply among them answers (the comment, or the likes).
  thread?: string;
  onReply?: (target: ReplyTarget) => void;
}) {
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
        // (Over the edge of a Reply's touch area just above it.)
        className="relative flex min-h-11 items-center gap-2.5 text-meta font-semibold text-stone-500 hover:text-ink"
      >
        <span aria-hidden className="h-px w-6 bg-stone-300" />
        {open ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
      </button>
      {open && (
        <ul aria-label={`Replies to ${label}`} className="mt-2 flex flex-col gap-4">
          {replies.map((child) => (
            <CommentItem key={child.id} listingKey={listingKey} comment={child} canShare={false} thread={thread} onReply={onReply} />
          ))}
        </ul>
      )}
    </>
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
  listing,
  thread,
}: {
  listingKey: string;
  comment: TimelineComment;
  replies?: TimelineComment[];
  // A comment someone came to see: if it's one of these replies, they show.
  opened?: string;
  canShare: boolean;
  onReply?: (target: ReplyTarget) => void;
  spots?: SpotLinks;
  // The home, for the photo a comment about a spot shows.
  listing?: Listing;
  // A reply: what its thread answers, so answering it stays in that thread.
  thread?: string;
}) {
  const { actions } = useThread();
  const [pending, startTransition] = useTransition();
  const reply = Boolean(comment.parentId);
  // Taking a comment back is always allowed; sharing it needs a like.
  const canToggle = comment.mine && actions.setSharing && (comment.sharedPublicly || canShare);
  const likeable = Boolean(actions.likeComment) && !comment.fromPrivateChat;
  const like = useCommentLike(comment);
  // Anything named can be answered: a comment, in a thread of its own; a
  // reply, in the thread it's in, starting with their name. (Shared from a
  // private chat, there's no one to answer.)
  const replyable = Boolean(onReply) && !comment.fromPrivateChat && (!reply || Boolean(thread));

  return (
    <li data-comment={comment.id} className={cn("flex gap-3", !reply && cn(card, "p-3.5"))}>
      <Avatar
        name={comment.name}
        tone={comment.fromPrivateChat ? "anonymous" : comment.isAgent ? "agent" : "person"}
        size={reply ? 7 : 9}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1 text-meta leading-snug text-stone-500">
          <Who name={comment.name} profileId={comment.profileId} />
          {comment.isAgent && (
            <Badge tone="ink" small>
              Agent
            </Badge>
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
        <p className="mt-0.5 whitespace-pre-line break-words text-body leading-snug">{comment.body}</p>
        {!reply && listing && comment.spot && comment.spot.mediaKey !== FACTS && (
          <FeedPhoto listing={listing} mediaKey={comment.spot.mediaKey} tags={[comment.spot.tag]} spots={spots} />
        )}
        {/* The agent hearted it, as a creator does on a reel: in stone, so it
            never reads as something the agent said, and outlined, not filled,
            so it reads as a note, not a button like the spot chip. */}
        {comment.likedBy && (
          <p className="mt-1.5 flex">
            <span className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-muted ring-1 ring-inset ring-stone-200">
              <Heart aria-hidden size={11} className="fill-rose-600 text-rose-600" />
              Liked by {comment.likedBy}
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 text-meta font-semibold text-stone-500">
          {replyable && (
            <button
              type="button"
              onClick={() =>
                onReply!(
                  reply
                    ? { id: thread!, name: comment.name, mine: comment.mine, mention: !comment.mine }
                    : { id: comment.id, name: comment.name, mine: comment.mine },
                )
              }
              className="flex min-h-9 items-center hit-44 hover:text-ink"
            >
              Reply
              <span className="sr-only"> to {comment.mine ? "your comment" : comment.name}</span>
            </button>
          )}
          {like.count > 0 && likeable && (
            <span>
              {like.count} {like.count === 1 ? "like" : "likes"}
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
        <Replies
          listingKey={listingKey}
          replies={replies}
          opened={opened}
          label={comment.name}
          thread={comment.id}
          onReply={onReply}
        />
      </div>
      {likeable && <CommentHeart comment={comment} like={like} />}
    </li>
  );
}

type CommentLike = { liked: boolean; count: number; toggle: () => Promise<void> };

// Your like on a comment shows at once and stays once it's saved, even where
// the page doesn't reload after it (the home page feed); a fresh copy of the
// comment from the server takes over when one comes.
function useCommentLike(comment: TimelineComment): CommentLike {
  const { actions, ensureName } = useThread();
  const server = { liked: comment.likedByMe, count: comment.likes };
  const [saved, setSaved] = useState(server);
  const [from, setFrom] = useState(server);
  if (from.liked !== server.liked || from.count !== server.count) {
    setFrom(server);
    setSaved(server);
  }
  const [state, setState] = useOptimistic(saved);
  const [, startTransition] = useTransition();
  const toggle = async () => {
    if (!(await ensureName())) return;
    const next = { liked: !state.liked, count: Math.max(0, state.count + (state.liked ? -1 : 1)) };
    startTransition(async () => {
      setState(next);
      const result = await actions.likeComment!(comment.id, next.liked);
      if (result.ok) startTransition(() => setSaved(next));
    });
  };
  return { ...state, toggle };
}

function CommentHeart({ comment, like }: { comment: TimelineComment; like: CommentLike }) {
  return (
    <button
      type="button"
      aria-pressed={like.liked}
      aria-label={`Like ${comment.mine ? "your" : `${comment.name}'s`} comment${like.count ? `, ${like.count} ${like.count === 1 ? "like" : "likes"}` : ""}`}
      onClick={like.toggle}
      className={cn(
        "-mr-1 flex size-9 shrink-0 flex-col items-center justify-center rounded-full text-tiny font-semibold tabular-nums hit-44 hover:bg-stone-100",
        like.liked ? "text-rose-600" : "text-stone-500",
      )}
    >
      <Heart aria-hidden size={15} className={cn(like.liked && "fill-current")} />
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
  const textBox = useRef<HTMLTextAreaElement>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [quick, setQuick] = useState(!quickOnFocus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The same home can show a composer twice (a page and its pop-out), so ids are per instance.
  const inputId = useId();
  const who = replyTo ? (replyTo.mine ? "yourself" : replyTo.name) : null;
  // Answering a reply in its thread: it starts with their name.
  const [mentioned, setMentioned] = useState<ReplyTarget | null>(null);
  if (replyTo !== mentioned) {
    setMentioned(replyTo);
    if (replyTo?.mention) {
      const at = `@${replyTo.name} `;
      setBody((now) => (now.startsWith(at) ? now : at + now));
    }
  }
  // Ready to type, as it opens, without moving the page: a card's box can
  // mount for a moment before its card is placed, and focusing it then would
  // scroll the feed to wherever it first was.
  useEffect(() => {
    if (autoFocus) textBox.current?.focus({ preventScroll: true });
    // (Only as it opens.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
        textBox.current?.focus();
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
        <p className="flex min-h-9 items-center justify-between gap-2 px-2 text-meta text-muted">
          <span>
            Replying to <span className="font-semibold text-ink">{who}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onCancelReply?.();
              textBox.current?.focus();
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
                textBox.current?.focus();
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
          ref={textBox}
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
        <label className="mt-1.5 flex min-h-9 cursor-pointer items-center gap-2.5 px-2 text-meta text-stone-700 hit-44">
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
        <p className="mt-1.5 flex items-center gap-1.5 px-2 text-meta leading-[18px] text-muted">
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
