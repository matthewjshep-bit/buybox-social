"use client";

import { ArrowUp, Globe, Lock } from "lucide-react";
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
import type { ActionResult } from "@/lib/engagement";
import { cn } from "@/lib/format";
import type { SpotReaction } from "@/lib/photos";
import type { ReactionState } from "@/lib/reactions";
import type { TimelineComment } from "@/lib/timeline";
import { button, field } from "@/lib/ui";

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
  // Public pages only: saving a home to come back to (or taking it off the list).
  save?: (listingKey: string, saved: boolean) => Promise<ActionResult>;
};

// A spot in one of a home's photos: a named thing ("Front door") or a place ("@42,61").
export type SpotRef = { mediaKey: string; tag: string };

// How a list of comments names a spot, and takes you to it on the photo.
// Who sees what you write here, said under every comment box: "Everyone can
// see your comment and first name." `private`: only some people (a lock).
export type SeenBy = { text: string; private: boolean };

// `canReact`: they can like and say things now (signed in, or just joined).
// Anyone else is asked to sign up first, before anything else opens.
type ThreadValue = { actions: ThreadActions; ensureName: () => Promise<boolean>; seenBy?: SeenBy; canReact: boolean };
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
  // How it ended, said once the sheet has gone (see `finish`).
  const outcome = useRef<boolean | null>(null);
  const joined = useRef(false);
  // The same, for what's drawn: once joined, a tap does what it says.
  const [joinedNow, setJoinedNow] = useState(false);
  const markJoined = () => {
    joined.current = true;
    setJoinedNow(true);
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A page and the pop-out over it can each have one of these.
  const id = useId();

  const ask = (as: "join" | "name") => {
    outcome.current = null;
    flushSync(() => {
      setError(null);
      setMode(as);
      setAsking(true);
    });
    // With a mouse, the cursor starts in the first box. On a touchscreen the
    // whole sheet shows first, with the keyboard down, so nothing of it is
    // hidden under the keyboard before it's read; a tap on a box brings the
    // keyboard up, and the sheet rises over it.
    if (!matchMedia("(pointer: fine)").matches) {
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
      });
    }
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
      markJoined();
      router.refresh();
      return true;
    }
    return ask("name");
  };
  const canReact = signedIn || joinedNow;

  // Whatever was waiting on it goes on only once the sheet has shut and
  // given the keyboard back (to what opened it): what opens next (the
  // comments) then starts from there, and gives the keyboard back there
  // when it closes, rather than to a box in the sheet that's gone.
  // (The first word is the one that counts: the sheet's own close, after
  // joining, comes after it.)
  const finish = (result: boolean) => {
    if (outcome.current !== null) return;
    if (resolver.current) outcome.current = result;
    setAsking(false);
  };
  useEffect(() => {
    if (asking || outcome.current === null) return;
    const result = outcome.current;
    outcome.current = null;
    resolver.current?.(result);
    resolver.current = null;
  }, [asking]);

  return (
    <ThreadContext.Provider value={{ actions, ensureName, seenBy, canReact }}>
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
            {/* Why: what they like is kept, and brings more like it. */}
            <p className="text-balance text-center text-body font-semibold text-ink">
              Save what you like, and get more homes like it.
            </p>
            <p className="mt-1 text-center text-sm text-muted">{prompt}</p>
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
                note="Free. No password. Signed up before? The same email works."
                onDone={async ({ firstName }) => {
                  // Now on this page's conversation too, as themselves.
                  const result = await actions.join(firstName ?? "").catch(() => ({ ok: false as const, error: "" }));
                  router.refresh();
                  if (result.ok) {
                    markJoined();
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
                markJoined();
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

// What a reply answers: a comment, or someone's likes ("like:…"). `mention`:
// it answers a reply in that thread, so it starts with "@" and their name.
export type ReplyTarget = { id: string; name: string; mine: boolean; mention?: boolean };

type CommentLike = { liked: boolean; count: number; toggle: () => Promise<void> };

// Your like on a comment shows at once and stays once it's saved, even where
// the page doesn't reload after it (the home page feed); a fresh copy of the
// comment from the server takes over when one comes.
export function useCommentLike(comment: TimelineComment): CommentLike {
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
  dark = false,
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
  // On the dark ground under a home's photo (the thread there), rather than on white.
  dark?: boolean;
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
      ? { text: "Also public, without your name.", private: false }
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
        <p className={cn("flex min-h-9 items-center justify-between gap-2 px-2 text-meta", dark ? "text-white/70" : "text-muted")}>
          <span>
            Replying to <span className={cn("font-semibold", dark ? "text-white" : "text-ink")}>{who}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onCancelReply?.();
              textBox.current?.focus();
            }}
            className={cn("flex min-h-9 items-center px-1 font-semibold hit-44", dark ? "hover:text-white" : "hover:text-ink")}
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
              className={cn(
                "flex size-10 items-center justify-center rounded-full text-[22px] transition-transform hit-44 active:scale-90",
                dark ? "hover:bg-white/10" : "hover:bg-stone-100",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {/* The box itself is 44px tall, so a tap anywhere on the pill but its
          thin edge lands in it. */}
      <div
        className={cn(
          "flex items-end gap-2 rounded-3xl py-0.5 pl-4 pr-1 focus-within:ring-2 focus-within:ring-brand/80",
          dark ? "bg-white/10 ring-1 ring-white/20" : "bg-stone-100",
        )}
      >
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
          className={cn(
            "max-h-29 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none [field-sizing:content]",
            dark ? "text-white placeholder:text-white/60" : "placeholder:text-stone-500",
          )}
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
        <label className={cn("mt-1.5 flex min-h-9 cursor-pointer items-center gap-2.5 px-2 text-meta hit-44", dark ? "text-white/80" : "text-stone-700")}>
          <input
            type="checkbox"
            checked={sharePublicly}
            onChange={(event) => setSharePublicly(event.target.checked)}
            // Above the line's touch area, so a tap on the box is on the box.
            className="relative z-[1] size-4.5 shrink-0 accent-[var(--brand)]"
          />
          <span>Also share publicly, without my name</span>
        </label>
      )}
      {error && (
        <p role="alert" className={cn("mt-1 px-2 text-sm", dark ? "text-rose-300" : "text-red-700")}>
          {error}
        </p>
      )}
      {seen && (
        <p className={cn("mt-1.5 flex items-center gap-1.5 px-2 text-meta leading-[18px]", dark ? "text-white/65" : "text-muted")}>
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
