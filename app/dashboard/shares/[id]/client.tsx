"use client";

import {
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Heart,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Share,
  UserPlus,
} from "lucide-react";
import Image from "next/image";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { ScorecardBody } from "@/components/scorecard";
import { Sheet } from "@/components/sheet";
import type { FeedPost } from "@/lib/feed";
import { cn } from "@/lib/format";
import { button, card, field } from "@/lib/ui";
import { addPerson, markShareSeen, removeComment, renameClient, replyAsAgent, type FormState } from "../../actions";
import { HOME_MESSAGE_TITLE, homeMessage } from "../../message";
import { likeClientComment } from "./actions";

// Looking at this page counts as seeing what's on it, so the dashboard stops
// marking the link as new; something that arrives while it's open counts too.
export function MarkSeen({ shareId, latest }: { shareId: string; latest: string | null }) {
  useEffect(() => {
    if (latest) markShareSeen(shareId, latest).catch(() => {});
  }, [shareId, latest]);
  return null;
}

// Coming from "What's new", the comment or home it was about is marked for a
// few seconds, with the home's name above it in view when there's room.
export function ShowTarget() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      const home = target.parentElement?.closest("section");
      if (home && target.getBoundingClientRect().bottom - home.getBoundingClientRect().top < window.innerHeight * 0.9) {
        home.scrollIntoView({ block: "start" });
      }
      target.dataset.target = "";
      clearTimeout(timer);
      timer = setTimeout(() => delete target.dataset.target, 3000);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => {
      window.removeEventListener("hashchange", show);
      clearTimeout(timer);
    };
  }, []);
  return null;
}

// The client's name as the page title, editable in place.
export function ClientNameEditor({ shareId, name }: { shareId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      const result = await renameClient(shareId, previous, form);
      if (!result.error) setEditing(false);
      return result;
    },
    {},
  );

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl">{name || "Unnamed client"}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(button({ kind: "ghost" }), "text-stone-700")}
        >
          <Pencil aria-hidden size={15} />
          {name ? "Rename" : "Add their name"}
        </button>
      </div>
    );
  }

  return (
    // On a phone the name gets the whole line, and Save and Cancel go under it.
    <form action={action} className="mt-1 flex flex-wrap items-start gap-2">
      <div className="min-w-0 basis-full sm:flex-1 sm:max-w-sm">
        <label htmlFor="clientName" className="sr-only">
          Client&apos;s name
        </label>
        <input
          id="clientName"
          name="clientName"
          defaultValue={name}
          required
          maxLength={60}
          autoFocus
          autoComplete="off"
          placeholder="Client's name"
          aria-describedby={state.error ? "clientName-error" : undefined}
          className={field({ big: true })}
        />
        {state.error && (
          <p id="clientName-error" role="alert" className="mt-1 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={cn(button({ kind: "primary", size: "lg" }), "sm:mt-1")}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className={cn(button({ kind: "ghost", size: "lg" }), "sm:mt-1")}>
        Cancel
      </button>
    </form>
  );
}

// Whether this browser can hand a link to the phone's own share sheet. Only
// known in the browser, so the page first renders without it.
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const never = () => () => {};

export function SendLink({
  url,
  clientName,
  count,
  home,
  label = "Your link is ready",
  status,
}: {
  url: string;
  clientName: string;
  count: number;
  // The home, when the link has just one: the message names it, in the same
  // words as sending a home from its page.
  home?: { address: string; price: number };
  label?: string;
  // Whether it's been opened, and when.
  status?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  const linkBox = useRef<HTMLInputElement>(null);
  const share = useSyncExternalStore(never, canShare, () => false);
  const greeting = clientName ? `Hi ${clientName}, ` : "";
  const one = count === 1 && home;
  const words = `${greeting}${
    one ? homeMessage(home) : `I picked ${count === 1 ? "a home" : `${count} homes`} for you. Tell me what you think.`
  }`;
  const message = `${words} ${url}`;
  return (
    <div className={cn(card, "p-4")}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {status && <p className="mt-0.5 text-sm text-muted">{status}</p>}
      <input
        ref={linkBox}
        id={id}
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        className={cn(field({ quiet: true }), "mt-2")}
      />
      {/* Without the phone's share sheet, three in a row once there's room for
          their words; on a narrower phone Text gets a line of its own. */}
      <div className={cn("mt-3 grid gap-2", share ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 min-[412px]:grid-cols-3")}>
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          className={cn(button({ kind: "primary" }), !share && "col-span-2 min-[412px]:col-span-1")}
        >
          <MessageSquare aria-hidden size={16} /> Text
        </a>
        {/* The phone's share sheet, straight from this tap: WhatsApp, Mail, AirDrop. */}
        {share && (
          <button
            type="button"
            onClick={() => {
              navigator.share({ ...(one && { title: HOME_MESSAGE_TITLE }), text: words, url }).catch(() => {});
            }}
            className={button({ kind: "secondary" })}
          >
            <Share aria-hidden size={16} /> Share…
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Copying isn't allowed here: the link is selected, ready to copy by hand.
              linkBox.current?.focus();
            }
          }}
          className={button({ kind: "secondary" })}
        >
          {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className={button({ kind: "secondary" })}>
          <ExternalLink aria-hidden size={16} /> Preview
        </a>
      </div>
    </div>
  );
}

export function ReplyForm({ shareId, listingKey }: { shareId: string; listingKey: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `reply-${listingKey}`;

  return (
    <form
      className="mt-3 flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        setError(null);
        startTransition(async () => {
          const result = await replyAsAgent(shareId, listingKey, body);
          if (result.error) setError(result.error);
          else setBody("");
        });
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          Reply to your client
        </label>
        <input
          id={inputId}
          value={body}
          maxLength={1000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Reply…"
          className={field()}
        />
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className={button({ kind: "primary", size: "lg" })}
      >
        Reply
      </button>
    </form>
  );
}

// Someone else to send the package to, with a link of their own.
export function AddPersonForm({ shareId }: { shareId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPerson.bind(null, shareId), {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <label htmlFor="new-person" className="sr-only">
          Their first name
        </label>
        <input
          id="new-person"
          name="firstName"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="Their first name"
          className={field()}
        />
        {state.error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={button({ kind: "secondary", size: "lg" })}
      >
        <UserPlus aria-hidden size={16} />
        {pending ? "Adding…" : "Add a person"}
      </button>
    </form>
  );
}

// The spot a comment is about: the photo, small, with a dot where the client
// tapped. Tapped, it opens up so the agent can see exactly where.
export function SpotChip({
  label,
  photo,
  at,
  photoNumber,
  photoCount,
  description,
}: {
  // "Covered porch", or "A spot in photo 2".
  label: string;
  photo: string;
  // Where in the photo, as fractions; none for the photo's subject ("Kitchen").
  at: { x: number; y: number } | null;
  photoNumber: number;
  photoCount: number;
  // What the photo shows, from the listing.
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // The photo is cropped around the spot, which puts the spot at the same
  // place in the crop as in the whole photo.
  const dot = at ? { left: `${at.x * 100}%`, top: `${at.y * 100}%` } : undefined;
  const crop = at ? { objectPosition: `${at.x * 100}% ${at.y * 100}%` } : undefined;
  return (
    <div className="mt-1">
      <button
        type="button"
        data-spot-chip
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        // Said whole, rather than pieced together from hidden words.
        aria-label={`About ${label}: ${open ? "hide the photo" : "show it in the photo"}`}
        className="flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-stone-100 p-0.5 pr-3.5 text-left text-meta font-semibold text-stone-700 hover:bg-stone-200"
      >
        {/* Square, so a spot near a corner isn't cut off. */}
        <span data-spot-thumb className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-stone-200">
          <Image src={photo} alt="" fill sizes="40px" style={crop} className="object-cover" />
          {dot && (
            <span
              aria-hidden
              data-spot-dot
              style={dot}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
            />
          )}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {open && (
        <figure id={id} className="mt-2 w-full max-w-80">
          <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-stone-200">
            <Image
              src={photo}
              alt={description || `Photo ${photoNumber} of ${photoCount}`}
              fill
              sizes="320px"
              style={crop}
              className="object-cover"
            />
            {dot && (
              <span
                aria-hidden
                style={dot}
                className="absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgb(0_0_0/0.25),0_4px_12px_rgb(0_0_0/0.35)]"
              />
            )}
          </div>
          <figcaption className="mt-1 text-xs text-muted">
            Photo {photoNumber} of {photoCount}
            {at ? ", where they tapped" : ""}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

// A heart under a client's comment, as a creator hearts one on a reel: their
// thread then says "Liked by" the agent's first name under it.
export function CommentLike({ commentId, name, liked }: { commentId: string; name: string; liked: boolean }) {
  const [shown, setShown] = useOptimistic(liked);
  const [, startTransition] = useTransition();
  // Refused, the heart goes back and says so, and the page catches up (the
  // home just came off the link, or the comment's gone).
  const [failed, setFailed] = useState(false);
  return (
    <div className="-ml-1.5 mt-0.5 flex flex-wrap items-center gap-x-2">
      <button
        type="button"
        aria-pressed={shown}
        onClick={() => {
          setFailed(false);
          startTransition(async () => {
            setShown(!shown);
            const result = await likeClientComment(commentId, !shown).catch(() => ({ ok: false }));
            if (!result.ok) setFailed(true);
          });
        }}
        className={cn(
          "flex min-h-8 w-fit items-center gap-1.5 rounded-full px-1.5 text-meta font-semibold hit-44 hover:bg-stone-100",
          shown ? "text-rose-700" : "text-muted hover:text-ink",
        )}
      >
        <Heart aria-hidden size={15} className={cn(shown && "fill-rose-600 text-rose-600")} />
        Like
        <span className="sr-only"> {name}&apos;s comment</span>
      </button>
      {failed && (
        <p role="alert" className="text-meta text-red-700">
          That didn&apos;t work. Try again.
        </p>
      )}
    </div>
  );
}

// Where focus goes once a comment is gone: the next comment's "…", else the
// one before, else the reply box (or the home itself, once it's removed).
function focusAfter(trigger: HTMLElement | null) {
  const item = trigger?.closest("li");
  const home = item?.closest("section");
  const near = [item?.nextElementSibling, item?.previousElementSibling]
    .map((li) => li?.querySelector<HTMLElement>("[data-comment-menu]"))
    .find(Boolean);
  return near ?? home?.querySelector<HTMLElement>("input[id^='reply-']") ?? home?.querySelector<HTMLElement>("h3") ?? null;
}

// "…" on a comment: removing it, asked once more first.
export function CommentMenu({ commentId, name }: { commentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    setError(false);
    if (refocus) trigger.current?.focus();
  };

  // A tap anywhere else, or Escape, puts it away.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
      setError(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setError(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className="relative -mr-2 -mt-2 shrink-0 self-start"
      // Tabbing out of it puts it away too, so it never covers what has focus.
      onBlur={(event) => {
        if (!open || pending || event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOpen(false);
        setError(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        data-comment-menu
        aria-label={`More for ${name}'s comment`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={cn(button({ kind: "ghost", icon: true }), "text-stone-500 hover:text-ink aria-expanded:bg-black/5 aria-expanded:text-ink")}
      >
        <MoreHorizontal aria-hidden size={18} />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-labelledby={`${id}-ask`}
          // A tap on its words keeps focus inside it, so it stays open.
          tabIndex={-1}
          className={cn(card, "absolute right-0 top-full z-20 mt-1 w-64 p-3 text-sm shadow-lg outline-none")}
        >
          <p id={`${id}-ask`}>
            <span className="font-semibold">Remove this comment?</span> Your client won&apos;t see it.
          </p>
          {error && (
            <p role="alert" className="mt-1 text-red-700">
              That didn&apos;t work. Try again.
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              disabled={pending}
              onClick={() => close(true)}
              className={cn(button({ kind: "ghost" }), "text-stone-700")}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const next = focusAfter(trigger.current);
                startTransition(async () => {
                  try {
                    await removeComment(commentId);
                  } catch {
                    setError(true);
                    return;
                  }
                  // The comment is going; keep the agent's place in the thread.
                  next?.focus();
                });
              }}
              className={button({ kind: "danger" })}
            >
              {pending ? "Removing…" : "Remove"}
              <span className="sr-only"> comment from {name}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Wide enough for the Scorecard to sit beside the page rather than over it.
const WIDE = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const query = matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const OpenScorecard = createContext<(listingKey: string) => void>(() => {});

// Where a home sits on the screen, to keep it there as the page makes room
// for the Scorecard's panel (or takes the room back).
const topOf = (listingKey: string) => document.getElementById(`home-${listingKey}`)?.getBoundingClientRect().top ?? null;

// Each home's Scorecard, as the people on the link see it, with what each of
// them thinks: a sheet from the bottom on a phone; on a wide screen, a panel
// down the right, under the site's header, with the page making room beside
// it, so nothing is hidden and every home's buttons stay in reach. One at a
// time, opened from the button on each home.
export function HomeScorecards({
  posts,
  offLink,
  agentName,
  children,
}: {
  // Every home the link has had, each built from the link's own conversation.
  posts: FeedPost[];
  // The ones the agent has taken off it.
  offLink: string[];
  agentName: string;
  children: ReactNode;
}) {
  // The home whose Scorecard was opened last, and whether it still is.
  const [shown, setShown] = useState<{ key: string; open: boolean } | null>(null);
  const open = shown?.open ? shown.key : null;
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia(WIDE).matches, () => false);
  const docked = wide && Boolean(open);
  const dock = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const post = posts.find((p) => p.listing.ListingKey === shown?.key) ?? null;
  const removed = Boolean(open && offLink.includes(open));
  // Set beside the homes still on the link.
  const siblings = posts.filter((p) => p !== post && !offLink.includes(p.listing.ListingKey));

  // The home the agent is looking at stays where it is on the screen while
  // the page makes room for the panel, and when it gives the room back.
  const held = useRef<{ key: string; top: number } | null>(null);
  const hold = (key: string) => {
    const top = topOf(key);
    held.current = top === null ? null : { key, top };
  };
  useLayoutEffect(() => {
    const was = held.current;
    held.current = null;
    const now = was && topOf(was.key);
    if (was && now !== null && Math.abs(now - was.top) > 1) window.scrollBy({ top: now - was.top, behavior: "instant" });
  }, [docked]);

  // On a wide screen the panel starts under the site's header, and rises
  // to the top of the window as the header scrolls away.
  useLayoutEffect(() => {
    const el = dock.current;
    if (!docked || !el) return;
    const header = document.querySelector("header");
    const place = () => {
      el.style.top = `${Math.max(12, (header?.getBoundingClientRect().bottom ?? 0) + 12)}px`;
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      el.style.top = "";
    };
  }, [docked]);

  // Each home's Scorecard opens where the agent left it, while the page is open.
  const kept = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !open) return;
    el.scrollTop = kept.current.get(open) ?? 0;
    const keep = () => kept.current.set(open, el.scrollTop);
    el.addEventListener("scroll", keep, { passive: true });
    return () => el.removeEventListener("scroll", keep);
  }, [open]);

  const show = (key: string) => {
    if (wide && !open) hold(key);
    setShown({ key, open: true });
  };
  const close = () => {
    if (wide && open) hold(open);
    setShown((was) => was && { ...was, open: false });
  };

  // From the Scorecard to a place on the page. On a phone the sheet is over
  // everything, so it shuts first and the page can take the keyboard; beside
  // the page it stays open. The place comes into view.
  const goTo = (target: HTMLElement | null, block: ScrollLogicalPosition = "center") => {
    if (!wide) flushSync(close);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <OpenScorecard value={show}>
      {children}
      {/* The panel's place on a wide screen (the page pads itself clear of
          it while it's open); on a phone the sheet rises over the whole page
          instead. Never in the way of a tap when it's shut. */}
      <div
        ref={dock}
        data-scorecard-docked={docked ? "" : undefined}
        className="pointer-events-none fixed inset-y-3 right-3 z-40 w-[min(28rem,calc(100vw-1.5rem))]"
      >
        {/* A home of its own each time: opening another home's Scorecard
            while one is open moves the keyboard to it, and closing it goes
            back to the button that opened it. */}
        <Sheet
          key={shown?.key}
          open={Boolean(open && post)}
          onClose={close}
          label={post ? `Scorecard for ${post.listing.UnparsedAddress}` : "Scorecard"}
          title="Scorecard"
          anchor={wide ? dock : undefined}
          docked={wide}
          bodyRef={body}
          // Beside the page it fills its place as that follows the header.
          className={cn("pointer-events-auto", wide && "top-0! left-0! h-full! w-full!")}
        >
          {open && post && (
            <ScorecardBody
              post={post}
              mode="agent"
              agentName={agentName}
              siblings={siblings.length > 0 ? siblings : undefined}
              offLink={removed}
              onReply={removed ? undefined : () => goTo(document.getElementById(`reply-${post.listing.ListingKey}`))}
              onAllComments={() =>
                goTo(
                  document.getElementById(`home-${post.listing.ListingKey}`)?.querySelector<HTMLElement>("[aria-label='Comments']") ??
                    null,
                  "start",
                )
              }
            />
          )}
        </Sheet>
      </div>
    </OpenScorecard>
  );
}

// "Scorecard" on a home: everything the people on the link think of it.
export function ScorecardButton({ listingKey, address }: { listingKey: string; address: string }) {
  const open = useContext(OpenScorecard);
  return (
    <button
      type="button"
      onClick={() => open(listingKey)}
      className={button({ kind: "secondary" })}
    >
      <ClipboardList aria-hidden size={16} />
      Scorecard
      <span className="sr-only"> for {address}</span>
    </button>
  );
}
