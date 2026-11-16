import { EyeOff, Heart, Lock, ThumbsDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import type { TopicSide } from "@/lib/profile";
import type { TasteChip } from "@/lib/taste-story";
import { card } from "@/lib/ui";

type Current = { key: string; side: TopicSide | null } | null;

// Someone's taste, as plainly as it can be said: the things they keep liking
// in homes' photos (and, where they show them, passing on), each a way to see
// just those homes below. No description, and nothing written for them.
export function TasteStoryCard({
  name,
  isMe,
  prompt,
  loves,
  passes,
  passesPrivate,
  current,
  chipHref,
  controls,
}: {
  name: string;
  isMe: boolean;
  // On their own page, with nothing to show yet: how to get there.
  prompt: boolean;
  // Just what this viewer may see.
  loves: TasteChip[];
  passes: TasteChip[];
  // Their own page, with passes kept from everyone else.
  passesPrivate: boolean;
  current: Current;
  chipHref: (key: string, side: TopicSide) => string;
  // What others see of it, on their own page: a small button by the title.
  controls?: ReactNode;
}) {
  const title = isMe ? "Your taste" : `${name}'s taste`;
  return (
    <section aria-labelledby="taste-story-title" className={cn(card, "p-4")}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="taste-story-title" className="text-meta font-semibold text-muted">
          {title}
        </h2>
        {controls}
      </div>
      {prompt && <p className="mt-1 text-body leading-snug text-stone-700">Like a few more homes to see your taste.</p>}
      <TasteRow side="like" chips={loves} current={current} href={chipHref} isMe={isMe} />
      <TasteRow side="pass" chips={passes} current={current} href={chipHref} isMe={isMe} />
      {passesPrivate && passes.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-meta text-muted">
          <Lock aria-hidden size={12} className="shrink-0" />
          Only you see passes
        </p>
      )}
    </section>
  );
}

// "Loves Covered porch 3 · Kitchen 5", each one showing just those cards. On
// their own page, a chip they've switched off is marked as only theirs.
export function TasteRow({
  side,
  chips,
  current,
  href,
  isMe,
}: {
  side: TopicSide;
  chips: TasteChip[];
  current: Current;
  href: (key: string, side: TopicSide) => string;
  isMe: boolean;
}) {
  if (chips.length === 0) return null;
  const like = side === "like";
  const Icon = like ? Heart : ThumbsDown;
  const title = like ? "Loves" : "Passes on";
  return (
    <div role="group" aria-label={title} className="mt-3 flex flex-wrap items-center gap-1.5">
      <span
        aria-hidden
        className={cn("mr-1 flex items-center gap-1 text-meta font-semibold", like ? "text-rose-800" : "text-amber-800")}
      >
        <Icon size={14} className={like ? "fill-current" : undefined} />
        {title}
      </span>
      {chips.map((chip) => {
        const hidden = isMe && chip.hidden;
        return (
          <Link
            key={chip.key}
            href={href(chip.key, side)}
            aria-label={`${title} ${chip.label}${hidden ? ", only you see this" : ""}`}
            aria-current={current?.key === chip.key.toLowerCase() && current.side === side ? "true" : undefined}
            className={cn(
              "relative inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-meta font-semibold leading-5 before:absolute before:inset-x-0 before:-inset-y-1",
              hidden
                ? "border border-dashed border-stone-400 bg-white text-muted hover:bg-stone-50 aria-[current]:border-solid aria-[current]:border-stone-700"
                : like
                  ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100 aria-[current]:ring-2 aria-[current]:ring-rose-700"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 aria-[current]:ring-2 aria-[current]:ring-amber-700",
            )}
          >
            {hidden && <EyeOff aria-hidden size={12} className="shrink-0" />}
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}
