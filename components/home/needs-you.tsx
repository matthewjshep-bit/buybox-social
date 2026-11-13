"use client";

import { ArrowRight, Check, CheckCircle2, Share2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { ReplyBox } from "@/components/home/reply-box";
import { Avatar, HomeThumb } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import type { NeedsItem, NeedsKind } from "@/lib/needs-you";
import { button, card } from "@/lib/ui";

// "Needs you": the few things clients are waiting on the agent for, each a
// row with one thing to do. Reply opens a box right under it; Nudge sends the
// link again the way the phone shares things; Done puts a row away on this
// device, for something already answered by text. The list is the one the
// page arrived with: an answer sent doesn't pull the rows around (the one
// answered says so, and is gone next time).

// How many rows show at once; the page sends a few more, to fill in after a Done.
const SHOWN = 5;

const DONE_KEY = "pc:needs-done";
const DONE_EVENT = "pc:needs-done";

// What's been put away on this device (just this browser's own note).
function readDone(): string {
  try {
    return localStorage.getItem(DONE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseDone(raw: string): Set<string> {
  try {
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function markDone(id: string) {
  try {
    // Only the newest few hundred: old ones are long gone from the list anyway.
    const ids = [...parseDone(readDone()), id].slice(-300);
    localStorage.setItem(DONE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be off (a private window): it's hidden for now all the same.
  }
  window.dispatchEvent(new Event(DONE_EVENT));
}

const subscribeDone = (changed: () => void) => {
  window.addEventListener(DONE_EVENT, changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener(DONE_EVENT, changed);
    window.removeEventListener("storage", changed);
  };
};

const CHIP: Record<NeedsKind, { label: string; tone: string }> = {
  showing: { label: "Showing", tone: "bg-amber-100 text-amber-900" },
  question: { label: "Question", tone: "bg-sky-100 text-sky-900" },
  unopened: { label: "Not opened", tone: "bg-stone-100 text-stone-700" },
};

// "sent 3 days ago"
function sentAgo(at: string) {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  return days <= 1 ? "sent yesterday" : `sent ${days} days ago`;
}

// What the row says, after the chip: who, and what they're waiting for.
function headline(item: NeedsItem) {
  if (item.kind === "showing") return { name: item.name, rest: ` wants to see ${item.home?.address ?? "a home"}` };
  if (item.kind === "question") return { name: item.name, rest: ` on ${item.home?.address ?? "a home"}` };
  if (item.people === 0) return { name: item.name, rest: " hasn't been opened yet" };
  const homes = item.homes === 1 ? "the home" : "the homes";
  return { name: item.name, rest: ` ${item.people > 1 ? "haven't" : "hasn't"} opened ${homes} yet` };
}

export function NeedsYou({ items: arrived, more }: { items: NeedsItem[]; more: number }) {
  // The list as the page arrived with it: an answer refreshes the page under
  // it, and the rows stay where they are while the agent works through them.
  const [items] = useState(arrived);
  const doneRaw = useSyncExternalStore(subscribeDone, readDone, () => "[]");
  const done = useMemo(() => parseDone(doneRaw), [doneRaw]);
  const [open, setOpen] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const titleId = useId();

  const waiting = items.filter((item) => !done.has(item.id) || sent.has(item.id));
  const shown = waiting.slice(0, SHOWN);
  const left = waiting.length - shown.length + more;
  const count = waiting.filter((item) => !sent.has(item.id)).length + more;

  return (
    <section aria-labelledby={titleId}>
      <div className="flex items-center gap-2 px-1 pb-2">
        <h2 id={titleId} className="text-[17px] font-semibold">
          Needs you
        </h2>
        {count > 0 && (
          <span className="rounded-full bg-amber-100 px-2 text-meta font-semibold leading-5 text-amber-900 tabular-nums">
            {count}
            <span className="sr-only"> waiting</span>
          </span>
        )}
        <Link
          href="/dashboard?show=new"
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-meta font-semibold text-brand hover:underline"
        >
          All clients <ArrowRight aria-hidden size={14} />
        </Link>
      </div>
      {shown.length === 0 ? (
        <div className={cn(card, "flex flex-col items-center px-6 py-6 text-center")}>
          <CheckCircle2 aria-hidden size={26} className="text-emerald-600" />
          <p className="mt-1.5 text-body font-semibold">You&apos;re all caught up</p>
          <p className="mt-0.5 text-balance text-meta text-muted">
            Questions and showing requests from your clients land here first.
          </p>
        </div>
      ) : (
        <div className={card}>
          <ul className="divide-y divide-stone-200">
            {shown.map((item, i) => (
              <NeedsRow
                key={item.id}
                item={item}
                first={i === 0}
                open={open === item.id}
                sent={sent.has(item.id)}
                onToggle={() => setOpen((now) => (now === item.id ? null : item.id))}
                onClose={() => setOpen(null)}
                onSent={() => {
                  setSent((now) => new Set(now).add(item.id));
                  setOpen(null);
                }}
                onDone={() => {
                  if (open === item.id) setOpen(null);
                  markDone(item.id);
                }}
              />
            ))}
          </ul>
          {left > 0 && (
            <Link
              href="/dashboard?show=new"
              className="flex min-h-11 items-center justify-center gap-1 rounded-b-2xl border-t border-stone-200 text-meta font-semibold text-brand hover:bg-stone-50"
            >
              {left} more in Clients <ArrowRight aria-hidden size={14} />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function NeedsRow({
  item,
  first,
  open,
  sent,
  onToggle,
  onClose,
  onSent,
  onDone,
}: {
  item: NeedsItem;
  first: boolean;
  open: boolean;
  sent: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSent: () => void;
  onDone: () => void;
}) {
  const chip = CHIP[item.kind];
  const { name, rest } = headline(item);
  const [copied, setCopied] = useState(false);
  const boxId = useId();
  const replies = item.kind !== "unopened";
  // The one filled button on the page: the first row's.
  const kind = first ? "primary" : "secondary";
  const address = item.home?.address ?? "";

  // The link again, the way the phone shares things; elsewhere, copied.
  const nudge = async () => {
    const url = `${window.location.origin}${item.nudgePath ?? ""}`;
    const greeting = item.people > 0 ? `Hi ${item.name}, here` : "Hi, here";
    const text = `${greeting} are the homes I picked for you: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // They closed the sheet: nothing more to do.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <Link
          href={item.href}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-offset-4"
        >
          <span className="relative shrink-0">
            <HomeThumb src={item.home?.photo} sizes="48px" className="size-12 rounded-[10px]" />
            <Avatar
              name={item.name}
              photo={item.photo}
              size={6}
              className="absolute -bottom-1.5 -right-1.5 ring-2 ring-white"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body leading-snug">
              <span
                className={cn(
                  "mr-1.5 inline-block rounded px-1.5 align-[1px] text-[11px] font-bold uppercase leading-[18px] tracking-wide",
                  chip.tone,
                )}
              >
                {chip.label}
              </span>
              <strong className="font-semibold">{name}</strong>
              {rest}
            </span>
            <span className="mt-0.5 block truncate text-meta text-muted">
              {/* Ages are worked out from the clock where they render, so the
                  server's and the browser's can differ by a minute (or a day,
                  across time zones): the browser's wins without a warning. */}
              {item.kind === "unopened" ? (
                <>
                  {item.homes} {item.homes === 1 ? "home" : "homes"} ·{" "}
                  <time dateTime={item.at} suppressHydrationWarning>
                    {sentAgo(item.at)}
                  </time>
                </>
              ) : (
                <>
                  {item.quote && <>“{item.quote}” · </>}
                  <time dateTime={item.at} suppressHydrationWarning>
                    {timeAgo(item.at)}
                  </time>
                </>
              )}
            </span>
          </span>
        </Link>
        {sent ? (
          <p role="status" className="flex shrink-0 flex-col items-end text-meta">
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <Check aria-hidden size={14} /> Sent to {item.name}
            </span>
            <Link
              href={`/dashboard/shares/${item.shareId}?tab=homes${item.home ? `#home-${encodeURIComponent(item.home.key)}` : ""}`}
              className="inline-flex min-h-8 items-center font-semibold text-brand hit-44 hover:underline"
            >
              Open their link
            </Link>
          </p>
        ) : (
          <div className="flex shrink-0 items-center">
            {replies ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? boxId : undefined}
                onClick={onToggle}
                className={button({ kind })}
              >
                Reply<span className="sr-only"> to {item.name}</span>
              </button>
            ) : (
              <button type="button" onClick={nudge} className={button({ kind })}>
                {copied ? (
                  "Link copied"
                ) : (
                  <>
                    <Share2 aria-hidden size={15} className="max-[380px]:hidden" /> Nudge
                    <span className="sr-only"> {item.name}</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              aria-label="Mark done"
              title="Done"
              onClick={onDone}
              className={cn(button({ kind: "ghost", icon: true }), "text-muted")}
            >
              <Check aria-hidden size={18} />
            </button>
          </div>
        )}
      </div>
      {copied && (
        <p role="status" className="sr-only">
          Link copied
        </p>
      )}
      {open && replies && item.home && (
        <div id={boxId} className="ml-[74px] mr-3.5 pb-3">
          <ReplyBox
            shareId={item.shareId}
            listingKey={item.home.key}
            name={item.name}
            prefill={item.kind === "showing" ? `Happy to show you ${address}. I'm free ` : ""}
            onSent={onSent}
            onClose={onClose}
          />
        </div>
      )}
    </li>
  );
}
