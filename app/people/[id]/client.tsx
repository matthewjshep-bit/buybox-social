"use client";

import { HeartOff, LoaderCircle, MoreHorizontal, Share2, Trash2, Undo2 } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { commentInReel, joinPublic, reactInStream } from "@/app/homes/actions";
import { NameGate, useThread } from "@/components/listing-thread";
import { Sheet } from "@/components/sheet";
import type { ActionResult } from "@/lib/engagement";
import { cn } from "@/lib/format";
import type { CardControl } from "@/lib/profile";
import { button } from "@/lib/ui";
import { deleteMyComment, removeMyReaction, removeMySpots } from "./actions";

const noop = () => () => {};

const TOAST = "profile:toast";

// A word about what just happened ("Link copied", "Like removed"), from
// anywhere on your page, even a card that's gone once it's done.
const say = (text: string) => window.dispatchEvent(new CustomEvent(TOAST, { detail: text }));

// Where those words show: one line at the foot of the screen, above
// everything, read out as it changes, gone after a couple of seconds.
export function Toast() {
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inBrowser = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => {
    const show = (event: Event) => {
      clearTimeout(timer.current);
      // The same words twice are still news.
      setToast((now) => ({ text: (event as CustomEvent<string>).detail, n: (now?.n ?? 0) + 1 }));
      timer.current = setTimeout(() => setToast(null), 2200);
    };
    window.addEventListener(TOAST, show);
    return () => {
      window.removeEventListener(TOAST, show);
      clearTimeout(timer.current);
    };
  }, []);

  if (!inBrowser) return null;
  return createPortal(
    <p
      role="status"
      className={cn(
        "fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg",
        !toast && "sr-only",
      )}
    >
      {toast && <span key={toast.n}>{toast.text}</span>}
    </p>,
    document.body,
  );
}

// Your own page, shared the way your phone shares things; elsewhere, or if
// that fails, copied.
export function ShareMyPage({ title }: { title: string }) {
  const share = async () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the share sheet isn't an error.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied");
    } catch {
      say("Couldn't copy the link");
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      // It can't share or copy without scripts, so without them it isn't there.
      className={cn(button({ kind: "secondary" }), "mt-3 [@media(scripting:none)]:hidden")}
    >
      <Share2 aria-hidden size={16} />
      Share my page
    </button>
  );
}

// Your page before you've said your first name (you signed in with just an
// email): the same prompt the homes ask with, from a link under the heading.
// Once it's saved the page says your name, and the keyboard goes to it.
export function AddFirstName() {
  return (
    <NameGate
      actions={{ join: joinPublic, react: reactInStream, comment: commentInReel }}
      myName={null}
      prompt="It shows at the top of your page and next to what you like and say, and anyone visiting can see it."
    >
      <AddFirstNameLink />
    </NameGate>
  );
}

function AddFirstNameLink() {
  const { ensureName } = useThread();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await ensureName())) return;
        say("Name saved");
        // Once the page says the name and the prompt has gone, so neither takes the keyboard back.
        const land = (tries: number) => {
          const heading = document.getElementById("profile-name");
          const settled = heading?.textContent !== "Your page" && !document.querySelector("dialog[open]");
          if (settled) heading?.focus({ preventScroll: true });
          else if (tries < 120) requestAnimationFrame(() => land(tries + 1));
        };
        land(0);
      }}
      // It can't ask without scripts, so without them it isn't there.
      className="-my-1 min-h-11 text-body font-semibold text-brand underline-offset-2 hover:underline [@media(scripting:none)]:hidden"
    >
      Add your first name
    </button>
  );
}

// What each way to take something back says, and what it says once done.
const labelOf = (control: CardControl) =>
  control.kind === "reaction"
    ? control.sentiment === "like"
      ? "Remove my like"
      : "Remove my pass"
    : control.kind === "spots"
      ? `Remove my ${control.sentiment === "like" ? "like" : "dislike"} of ${control.name}`
      : "Delete my comment";
const doneOf = (control: CardControl) =>
  control.kind === "comment"
    ? "Comment deleted"
    : control.kind === "reaction" && control.sentiment === "dislike"
      ? "Pass removed"
      : control.sentiment === "like"
        ? "Like removed"
        : "Dislike removed";
const keyOf = (control: CardControl) =>
  control.kind === "comment"
    ? `comment-${control.id}`
    : control.kind === "spots"
      ? `${control.sentiment}-${control.name}`
      : control.sentiment;

const take = (homeKey: string, control: CardControl): Promise<ActionResult> =>
  control.kind === "reaction"
    ? removeMyReaction(homeKey, control.sentiment)
    : control.kind === "spots"
      ? removeMySpots(homeKey, control.sentiment, control.spots)
      : deleteMyComment(control.id);

// "…" on a card on your own page: take back your like, what you liked in its
// photos, or a comment (after a second tap, since that can't be undone). The
// card changes as soon as it's done; if nothing's left on it, it goes, and
// the next card takes its focus. `day` tells apart two cards of one home.
export function CardMenu({
  cardId,
  address,
  day,
  homeKey,
  controls,
}: {
  cardId: string;
  address: string;
  day?: string;
  homeKey: string;
  controls: CardControl[];
}) {
  const [open, setOpen] = useState(false);
  // The comment being asked about before it's deleted.
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The row being taken back, which says so until it's done.
  const [running, setRunning] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes if this menu is gone once the page catches up: its own
  // card if that's still there, else the cards after it, then those before,
  // then the filters.
  const next = useRef<string[] | null>(null);
  const id = useId();

  useEffect(
    () => () => {
      const after = next.current;
      if (!after) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      const target =
        after
          .map((card) => document.querySelector<HTMLElement>(`[data-card-link="${CSS.escape(card)}"]`))
          .find(Boolean) ??
        document.querySelector<HTMLElement>('nav[aria-label="Show"] [aria-current="page"]') ??
        document.querySelector<HTMLElement>("main a[href]");
      target?.focus();
    },
    [],
  );

  // Done, and the card's still here (with less on it): nowhere else to go.
  useEffect(() => {
    if (!pending) next.current = null;
  }, [pending]);

  const close = () => {
    setOpen(false);
    setAsking(null);
    setError(null);
    setRunning(null);
  };

  const run = (control: CardControl) => {
    if (pending) return;
    setError(null);
    setRunning(keyOf(control));
    const ids = [...document.querySelectorAll<HTMLElement>("[data-card-link]")].map((el) => el.dataset.cardLink!);
    const at = ids.indexOf(cardId);
    next.current = [cardId, ...ids.slice(at + 1), ...ids.slice(0, Math.max(0, at)).reverse()];
    start(async () => {
      let result: ActionResult;
      try {
        result = await take(homeKey, control);
      } catch {
        result = { ok: false, error: "Couldn't do that. Try again." };
      }
      if (!result.ok) {
        next.current = null;
        setRunning(null);
        setError(result.error);
        return;
      }
      close();
      say(doneOf(control));
    });
  };

  const comment = asking ? controls.find((c) => c.kind === "comment" && c.id === asking) : undefined;
  const label = day ? `Options for ${address}, ${day}` : `Options for ${address}`;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(true)}
        // Nothing to open without scripts, so without them it isn't there.
        className={cn(
          button({ kind: "ghost", icon: true }),
          "relative z-20 -mr-2 -mt-1.5 shrink-0 text-muted hover:text-ink [@media(scripting:none)]:hidden",
        )}
      >
        <MoreHorizontal aria-hidden size={22} />
      </button>
      <Sheet
        open={open}
        onClose={close}
        label={label}
        title={
          <>
            {address}
            {day && <span className="block text-meta font-normal text-muted">{day}</span>}
          </>
        }
      >
        {comment?.kind === "comment" ? (
          // Focus starts on Cancel: a second Enter shouldn't delete for good.
          <div role="group" aria-labelledby={`${id}-ask`} className="flex flex-col gap-3 pb-1">
            <h3 id={`${id}-ask`} className="text-[17px] font-semibold">
              Delete your comment?
            </h3>
            <p
              id={`${id}-quote`}
              className="line-clamp-3 break-words rounded-2xl bg-stone-50 p-3 text-body leading-snug text-ink"
            >
              &ldquo;{comment.body}&rdquo;
            </p>
            <p id={`${id}-warn`} className="text-body leading-snug text-stone-700">
              It comes off this home and your page for everyone
              {comment.replies > 0 ? ", with your replies to it" : ""}. You can&apos;t undo this.
            </p>
            <button
              type="button"
              aria-disabled={pending || undefined}
              aria-describedby={`${id}-quote ${id}-warn`}
              onClick={() => run(comment)}
              className={cn(button({ kind: "danger", size: "lg" }), "aria-disabled:opacity-70")}
            >
              <Trash2 aria-hidden size={18} />
              {pending ? "Deleting…" : "Delete comment"}
            </button>
            <button
              type="button"
              autoFocus
              aria-disabled={pending || undefined}
              onClick={() => {
                if (pending) return;
                setAsking(null);
                setError(null);
                // Back on the row it came from.
                requestAnimationFrame(() => rows.current.get(`comment-${comment.id}`)?.focus());
              }}
              className={button({ kind: "secondary", size: "lg" })}
            >
              Cancel
            </button>
          </div>
        ) : (
          <ul className="-mx-2 flex flex-col pb-1">
            {controls.map((control) => {
              const key = keyOf(control);
              const locked = control.kind === "comment" && control.answered;
              // This one is on its way; the rest wait, dimmed, until it's done.
              const busy = pending && running === key;
              const waiting = pending && running !== key;
              const text = busy ? "Removing…" : labelOf(control);
              const hint = `${id}-${key}`;
              const Icon = busy
                ? LoaderCircle
                : control.kind === "comment"
                  ? Trash2
                  : control.sentiment === "like"
                    ? HeartOff
                    : Undo2;
              return (
                <li key={key}>
                  <button
                    ref={(el) => {
                      if (el) rows.current.set(key, el);
                      else rows.current.delete(key);
                    }}
                    type="button"
                    // Named for what it does; the comment it's about is read after.
                    aria-label={text}
                    aria-disabled={locked || pending || undefined}
                    aria-describedby={control.kind === "comment" ? hint : undefined}
                    onClick={() => {
                      if (locked || pending) return;
                      if (control.kind === "comment") {
                        setError(null);
                        setAsking(control.id);
                      } else run(control);
                    }}
                    className={cn(
                      "flex min-h-12 w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition-opacity",
                      locked ? "cursor-not-allowed" : pending ? "cursor-wait" : "hover:bg-stone-50",
                      waiting && "opacity-60",
                    )}
                  >
                    <Icon
                      aria-hidden
                      size={20}
                      className={cn(
                        "mt-px shrink-0",
                        busy
                          ? "animate-spin text-muted"
                          : locked
                            ? "text-stone-400"
                            : control.kind === "comment"
                              ? "text-red-700"
                              : control.sentiment === "like"
                                ? "text-rose-600"
                                : "text-amber-700",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block break-words text-body font-semibold",
                          locked ? "text-stone-500" : control.kind === "comment" ? "text-red-700" : "text-ink",
                        )}
                      >
                        {text}
                      </span>
                      {control.kind === "comment" && (
                        <span id={hint} className="block text-meta leading-snug text-muted">
                          <span className="block truncate">&ldquo;{control.body}&rdquo;</span>
                          {locked && <span className="block">Comments with replies can&apos;t be deleted here</span>}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-2 text-meta font-semibold text-red-700">
            {error}
          </p>
        )}
      </Sheet>
    </>
  );
}

// Long words stop after four lines, with a way to read the rest; without
// scripts they show in full. `meta` ("2 likes · Replied to Sam") sits beside
// the way to read more.
export function MoreText({ children, meta, className }: { children: ReactNode; meta?: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const text = ref.current;
    if (!text) return;
    const check = () => setClamped(text.scrollHeight > text.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(text);
    return () => observer.disconnect();
  }, []);

  const more = clamped || open;
  return (
    <>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-line break-words",
          !open && "line-clamp-4 [@media(scripting:none)]:line-clamp-none",
          className,
        )}
      >
        {children}
      </p>
      {(meta || more) && (
        <div className={cn("flex items-center justify-between gap-3", more ? "mt-0.5" : "mt-1")}>
          <p className="min-w-0 text-meta text-muted">{meta}</p>
          {more && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="relative z-20 -mr-2 min-h-11 min-w-11 shrink-0 scroll-mt-[var(--filters)] rounded-full px-2 text-meta font-semibold text-muted hover:text-ink"
            >
              {open ? "less" : "more"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
