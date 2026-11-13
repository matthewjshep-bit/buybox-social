"use client";

import { ChevronDown, Heart, Lock, MessageCircle, Sparkles, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import type { SpotRef } from "@/components/listing-thread";
import { avatarColor } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import { FACTS } from "@/lib/photos";
import type { ContextTake, ContextWho, HomeContext } from "@/lib/reel-context";

// Why a home is here, on the home itself: whose take it is and what they did
// on it ("Maya liked the porch and the kitchen"), the spots they picked out
// (a tap opens that photo, on the spot), what they said (a tap opens the
// comments on it), or why it was picked for you. Side by side, a small card
// at the top of the white panel, above the price ("panel"). On a phone, in the
// blurred band over the photo, one line until it's tapped open ("band"),
// under whose homes these are and how far through them you are. Nothing is
// drawn on the photo until a spot is tapped.

// How many people's takes it shows on one home (a link with a few people on it).
const TAKES_SHOWN = 3;

export type TakeEyebrow = { title: string; place: string | null };

export function TakeCard({
  home,
  eyebrow,
  look,
  low = false,
  hidden = false,
  onSpot,
  onComment,
  onAll,
}: {
  home: HomeContext | undefined;
  // Whose homes these are, and which of them this is: "Maya's highlights · 2 of 7".
  eyebrow?: TakeEyebrow | null;
  look: "panel" | "band";
  // On a phone, further down the band: the full page has its Back button up there.
  low?: boolean;
  // The photo's held, shown alone, or a sheet is over the home.
  hidden?: boolean;
  onSpot: (spot: SpotRef) => void;
  onComment: (commentId: string) => void;
  onAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const takes = home?.takes.slice(0, TAKES_SHOWN) ?? [];
  const forYou = home?.forYou?.length ? home.forYou : null;
  const something = takes.length > 0 || Boolean(forYou);
  const body = something ? <TakeBody takes={takes} forYou={forYou} onSpot={onSpot} onComment={onComment} onAll={onAll} /> : null;

  if (look === "panel") {
    if (!body) return null;
    return (
      <section
        aria-label="Why it's here"
        className="mb-3 rounded-xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10 [text-shadow:none]"
      >
        {body}
      </section>
    );
  }

  if (!something && !eyebrow) return null;
  const where = eyebrow ? [eyebrow.title, eyebrow.place].filter(Boolean).join(" · ") : null;
  const lead = takes[0];
  return (
    <section
      aria-label="Why it's here"
      data-keep-clear
      data-take
      className={cn(
        "pointer-events-auto absolute left-3 right-16 z-30 max-w-md rounded-2xl bg-black/55 text-white shadow-[0_4px_20px_rgb(0_0_0/0.35)] ring-1 ring-white/10 backdrop-blur-md transition-[opacity,visibility] duration-300 [text-shadow:none] motion-reduce:transition-none",
        low ? "top-[calc(env(safe-area-inset-top)+7rem)]" : "top-[calc(env(safe-area-inset-top)+3.5rem)]",
        hidden && "invisible opacity-0",
      )}
    >
      {something ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            {where && (
              <span className="block truncate text-[11px] font-semibold uppercase leading-4 tracking-wide text-white/70">
                {where}
              </span>
            )}
            <span className="block truncate text-meta leading-5">
              {lead ? (
                <>
                  <strong className="font-semibold">{lead.who.name}</strong>
                  {afterName(lead)}
                </>
              ) : (
                <>
                  <strong className="font-semibold">Picked for you</strong> · {forYou?.join(" · ")}
                </>
              )}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            size={18}
            className={cn("shrink-0 text-white/70 transition-transform motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>
      ) : (
        <p className="truncate px-3 py-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-white/70">{where}</p>
      )}
      {something && (
        <div id={bodyId} hidden={!open} className="max-h-[45dvh] overflow-y-auto overscroll-contain px-3 pb-3">
          {body}
        </div>
      )}
    </section>
  );
}

// What follows a name: " liked the porch"; why it's in your feed first
// (", who you follow · liked this"); a sentence that stands on its own
// (" · Passed on this home") after a dot; or nothing, just the name.
const afterName = (take: ContextTake) => {
  if (take.reason) return `, ${take.reason}${take.sentence ? ` · ${take.sentence}` : ""}`;
  if (!take.sentence) return "";
  return /^[A-Z]/.test(take.sentence) ? ` · ${take.sentence}` : ` ${take.sentence}`;
};

function TakeBody({
  takes,
  forYou,
  onSpot,
  onComment,
  onAll,
}: {
  takes: ContextTake[];
  forYou: string[] | null;
  onSpot: (spot: SpotRef) => void;
  onComment: (commentId: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {takes.map((take, i) => (
        <div key={`${take.who.profileId ?? take.who.name}-${i}`} className="flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <Face who={take.who} />
            <p className="min-w-0 flex-1 pt-1 text-body leading-snug text-white/90">
              {take.who.profileId ? (
                <Link
                  href={`/people/${take.who.profileId}`}
                  className="font-semibold text-white underline-offset-2 hit-44 hover:underline"
                >
                  {take.who.name}
                </Link>
              ) : (
                <strong className="font-semibold text-white">{take.who.name}</strong>
              )}
              {afterName(take)}
              {"\u00a0"}
              <span className="whitespace-nowrap text-meta text-white/55">
                {"· "}
                <time dateTime={take.at} suppressHydrationWarning>
                  {timeAgo(take.at)}
                </time>
              </span>
            </p>
          </div>
          {(take.spots.length > 0 || take.facts.length > 0) && (
            <ul aria-label={`What ${take.who.name === "You" ? "you" : take.who.name} picked out`} className="flex flex-wrap gap-1.5">
              {take.spots.map((spot) => (
                <li key={`${spot.kind}-${spot.mediaKey}-${spot.tag}`}>
                  <Chip kind={spot.kind} name={spot.name} onClick={() => onSpot({ mediaKey: spot.mediaKey, tag: spot.tag })} />
                </li>
              ))}
              {take.facts.map((fact) => (
                <li key={`${fact.kind}-fact-${fact.tag}`}>
                  <Chip kind={fact.kind} name={fact.phrase} onClick={() => onSpot({ mediaKey: FACTS, tag: fact.tag })} />
                </li>
              ))}
            </ul>
          )}
          {take.comments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {take.comments.map((comment, n) => (
                <li key={comment.id || n}>
                  <button
                    type="button"
                    onClick={() => (comment.id ? onComment(comment.id) : onAll())}
                    className="w-full rounded-xl bg-white/[0.06] px-3 py-2 text-left text-body leading-snug text-white/90 transition-colors hover:bg-white/10"
                  >
                    <span className="line-clamp-3 break-words">&ldquo;{comment.body}&rdquo;</span>
                    {(comment.spot || comment.likes > 0 || comment.replies > 0) && (
                      <span className="mt-0.5 block text-meta text-white/55">
                        {[
                          comment.spot && `On ${comment.spot.name}`,
                          comment.likes > 0 && `${comment.likes} ${comment.likes === 1 ? "like" : "likes"}`,
                          comment.replies > 0 && `${comment.replies} ${comment.replies === 1 ? "reply" : "replies"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {Boolean(take.moreComments) && (
            <button
              type="button"
              onClick={onAll}
              className="-ml-1 flex min-h-11 w-fit items-center rounded-full px-1 text-meta font-semibold text-white/80 hover:text-white"
            >
              +{take.moreComments} more
            </button>
          )}
          {take.private && (
            <p className="flex items-center gap-1.5 text-meta text-white/60">
              <Lock aria-hidden size={12} />
              Only you see this
            </p>
          )}
        </div>
      ))}
      {forYou && (
        <p className="flex items-start gap-2 text-body leading-snug text-white/90">
          <Sparkles aria-hidden size={16} className="mt-0.5 shrink-0 text-white/70" />
          <span>
            <strong className="font-semibold text-white">Picked for you</strong> · {forYou.join(" · ")}
          </span>
        </p>
      )}
    </div>
  );
}

// Their face: their own photo where they've added one, else their initial
// (an agent's in ink, as everywhere).
function Face({ who }: { who: ContextWho }) {
  const initial = who.name.trim()[0]?.toUpperCase();
  return who.photo ? (
    // A small square photo of their own, served as it is.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={who.photo} alt="" aria-hidden className="size-8 shrink-0 rounded-full bg-white/10 object-cover" />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-meta font-bold",
        avatarColor(who.agent ? "agent" : initial ? "person" : "anonymous", { dark: true }),
        who.agent && "ring-1 ring-white/30",
      )}
    >
      {initial}
    </span>
  );
}

// A spot or a fact they picked out, as a chip: a tap goes to it.
function Chip({ kind, name, onClick }: { kind: "like" | "dislike" | "comment"; name: string; onClick: () => void }) {
  const said = kind === "like" ? "Liked" : kind === "dislike" ? "Didn't like" : "Commented on";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${said} ${name}: show it`}
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-meta font-semibold ring-1 ring-inset transition-colors hit-44",
        kind === "like"
          ? "bg-rose-500/15 text-rose-100 ring-rose-300/30 hover:bg-rose-500/25"
          : kind === "dislike"
            ? "bg-amber-500/15 text-amber-100 ring-amber-300/30 hover:bg-amber-500/25"
            : "bg-white/[0.08] text-white/90 ring-white/15 hover:bg-white/15",
      )}
    >
      {kind === "like" ? (
        <Heart aria-hidden size={12} className="fill-current" />
      ) : kind === "dislike" ? (
        <ThumbsDown aria-hidden size={12} />
      ) : (
        <MessageCircle aria-hidden size={12} />
      )}
      {name}
    </button>
  );
}
