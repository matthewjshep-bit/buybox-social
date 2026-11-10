"use client";

import { Heart, MessageCircle, Send, ThumbsDown, User } from "lucide-react";
import { cn } from "@/lib/format";
import type { TickerEvent } from "@/lib/ticker";
import { avatarColor } from "@/lib/ui";

// Who did something and what, as a face with a small mark: the same in the
// line above the price and on the photo where they did it, so the two read as
// one. A heart for a like, a thumbs-down for a dislike or a pass, a speech
// bubble for a comment, a paper plane for a home sent.

export type Mark = "like" | "dislike" | "comment" | "sent";

export const markOf = (event: TickerEvent): Mark =>
  event.kind === "comment" || event.kind === "private-comment"
    ? "comment"
    : event.kind === "sent"
      ? "sent"
      : event.kind === "spot-dislike" || event.kind === "fact-dislike" || event.state?.reaction === "dislike"
        ? "dislike"
        : "like";

// The colour of the dot at a spot, for a mark.
export const markDot: Record<Mark, string> = {
  like: "bg-rose-500",
  dislike: "bg-amber-500",
  comment: "bg-brand",
  sent: "bg-stone-400",
};

function MarkIcon({ mark, size }: { mark: Mark; size: number }) {
  if (mark === "comment") return <MessageCircle size={size} strokeWidth={3} className="text-brand" />;
  if (mark === "sent") return <Send size={size - 1} strokeWidth={3} className="text-muted" />;
  if (mark === "dislike") return <ThumbsDown size={size - 1} strokeWidth={3} className="text-amber-700" />;
  return <Heart size={size} strokeWidth={0} className="fill-rose-500" />;
}

// The face: someone's initial on the brand colour (an agent's on ink), or,
// for someone unnamed, a plain figure on grey, as faces are everywhere
// (avatarColor); with its mark on the corner. The same on a profile's
// photos, where someone liked or said something.
export function MarkFace({
  initial,
  agent = false,
  mark,
  plane = false,
  pin = false,
  caption = false,
  ghost = false,
  className,
}: {
  // None for someone unnamed.
  initial: string | undefined;
  agent?: boolean;
  // What they did, on the corner (null: just the face).
  mark: Mark | null;
  // Unnamed, and it's a home sent: a paper plane rather than a figure.
  plane?: boolean;
  // On the photo: a little smaller, ringed in white, with a shadow.
  pin?: boolean;
  // In the caption at the photo's foot: a little bigger, edged on the dark glass.
  caption?: boolean;
  // A copy that's on its way out: the initial drawn, not written.
  ghost?: boolean;
  className?: string;
}) {
  const icon = pin ? 12 : caption ? 16 : 14;
  return (
    <span
      data-face
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-bold [text-shadow:none]",
        pin
          ? "size-7 text-[12px] shadow-[0_2px_8px_rgb(0_0_0/0.45)] ring-white"
          : caption
            ? "size-8 text-meta ring-1 ring-white/25 split:size-9 split:text-body"
            : "size-8 text-meta",
        avatarColor(agent ? "agent" : initial ? "person" : "anonymous", { dark: true }),
        // (Ink on the dark ground needs an edge to be seen.)
        agent && !pin && !caption && "ring-1 ring-white/30 split:ring-0",
        className,
      )}
    >
      {initial ? (
        ghost ? (
          <span data-text={initial} className="before:content-[attr(data-text)]" />
        ) : (
          initial
        )
      ) : plane ? (
        <Send size={icon} />
      ) : (
        <User size={icon} />
      )}
      {mark && (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-white",
            pin ? "-bottom-1 -right-1 size-3.5" : "-bottom-0.5 -right-0.5 size-4 split:ring-1 split:ring-stone-200",
          )}
        >
          <MarkIcon mark={mark} size={pin ? 8 : 10} />
        </span>
      )}
    </span>
  );
}

// The face of whoever did something on the activity line.
export function EventFace({
  event,
  myName,
  pin = false,
  caption = false,
  ghost = false,
  className,
}: {
  event: TickerEvent;
  // Your name, for your own face.
  myName: string | null;
  pin?: boolean;
  // In the caption: just the face, as a profile picture (the words say what they did).
  caption?: boolean;
  ghost?: boolean;
  className?: string;
}) {
  const { tone, name, agent } = event.who;
  // (Yours by your own name; the agent's own, on their link, by theirs, in ink.)
  const initial = (tone === "you" ? (name ?? myName) : tone === "anonymous" ? null : name)?.trim()[0]?.toUpperCase();
  return (
    <MarkFace
      initial={initial}
      agent={tone === "agent" || Boolean(agent)}
      mark={caption ? null : markOf(event)}
      plane={event.kind === "sent" && tone !== "you"}
      pin={pin}
      caption={caption}
      ghost={ghost}
      className={className}
    />
  );
}

// Where someone tapped, as a soft circle of light with a fine ring and a bright
// centre: it says "here" without saying what they thought of it, so nobody's
// eye is led before they've looked for themselves. `small`: on a photo in a
// feed card. `strong`: the line about it is being looked at.
export function Hotspot({ small = false, strong = false, className }: { small?: boolean; strong?: boolean; className?: string }) {
  return (
    <span aria-hidden data-hotspot className={cn("pointer-events-none absolute size-0", className)}>
      <span
        className={cn(
          "absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full",
          "bg-[radial-gradient(circle,rgb(255_255_255/0.5)_0%,rgb(255_255_255/0.2)_40%,rgb(255_255_255/0)_70%)]",
          small ? "size-10" : strong ? "size-24" : "size-20",
        )}
      />
      <span
        className={cn(
          "absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.18),0_0_14px_rgb(0_0_0/0.3)] transition-[box-shadow,width,height]",
          small ? "size-4 ring-2 ring-white/90" : cn("size-8 ring-white/90", strong ? "ring-[3px]" : "ring-2"),
        )}
      />
      <span
        className={cn(
          "absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgb(0_0_0/0.35)]",
          small ? "size-1.5" : "size-2.5",
        )}
      />
    </span>
  );
}

// On the photo, right where they did it, while the line at its foot says who
// and what: the hotspot, easing in, with one ring that spreads from it and
// fades (twice the first time it shows) to catch the eye. Only to look at: a
// tap goes to whatever's under it. `emphasis`: the line is being looked at
// (hovered, or the keyboard is on it), so the ring shows a little bolder,
// without the ripple. `still`: reduced motion, so no easing in and no ripple.
export function SpotHighlight({
  event,
  x,
  y,
  ripples,
  emphasis,
  still,
  showing,
}: {
  event: TickerEvent;
  // Where, in fractions of the photo.
  x: number;
  y: number;
  ripples: number;
  emphasis: boolean;
  still: boolean;
  // Counts showings, so the motion plays again each time.
  showing: number;
}) {
  return (
    <span
      aria-hidden
      data-spot-highlight={event.id}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      className="pointer-events-none absolute z-10 size-0"
    >
      {!still && !emphasis && ripples > 0 && (
        <span
          key={`ripple-${showing}`}
          style={{ animationIterationCount: ripples }}
          className="absolute left-0 top-0 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 ring-2 ring-white/70 animate-[spot-ripple_900ms_cubic-bezier(0,0,0.2,1)]"
        />
      )}
      <span key={`spot-${showing}`} className={cn("absolute left-0 top-0", !still && "animate-[pin-in_300ms_cubic-bezier(0.05,0.7,0.1,1)_both]")}>
        <Hotspot strong={emphasis} />
      </span>
    </span>
  );
}
