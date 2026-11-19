"use client";

import { User } from "lucide-react";
import { useLinkAgent } from "@/components/agent-notes";
import { cn } from "@/lib/format";
import type { TickerEvent } from "@/lib/ticker";
import { avatarColor } from "@/lib/ui";

// The face of whoever did something, beside the line that says what, in the
// caption at a photo's foot: someone's initial on the brand colour (an
// agent's on ink), or, for someone unnamed, a plain figure on grey, as faces
// are everywhere (avatarColor), edged on the dark glass.
export function MarkFace({
  initial,
  agent = false,
  ghost = false,
  image = null,
}: {
  // None for someone unnamed.
  initial: string | undefined;
  agent?: boolean;
  // A copy that's on its way out: the initial drawn, not written.
  ghost?: boolean;
  // Their own photo, where there is one (the agent's, on their link).
  image?: string | null;
}) {
  return (
    <span
      data-face
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full text-meta font-bold ring-1 ring-white/25 [text-shadow:none] split:size-9 split:text-body",
        avatarColor(agent ? "agent" : initial ? "person" : "anonymous", { dark: true }),
      )}
    >
      {image ? (
        // A small resized photo stored inline, so next/image has nothing to add.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 size-full rounded-full object-cover" />
      ) : initial ? (
        ghost ? (
          <span data-text={initial} className="before:content-[attr(data-text)]" />
        ) : (
          initial
        )
      ) : (
        <User size={16} />
      )}
    </span>
  );
}

// The face of whoever did something on the activity line, as a profile
// picture (the words say what they did).
export function EventFace({
  event,
  myName,
  ghost = false,
}: {
  event: TickerEvent;
  // Your name, for your own face.
  myName: string | null;
  ghost?: boolean;
}) {
  const { tone, name, agent } = event.who;
  // On their link, the agent's face is theirs, as it is in the header and on
  // the details they picked out: their photo, or their initials.
  const link = useLinkAgent();
  const theAgent = (tone === "agent" || Boolean(agent)) && link ? link.agent : null;
  // (Yours by your own name; the agent's own, on their link, by theirs, in ink.)
  const initial = theAgent
    ? theAgent.full_name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || undefined
    : (tone === "you" ? (name ?? myName) : tone === "anonymous" ? null : name)?.trim()[0]?.toUpperCase();
  return (
    <MarkFace
      initial={initial}
      image={theAgent?.photo_data_url}
      agent={tone === "agent" || Boolean(agent)}
      ghost={ghost}
    />
  );
}

// Where someone tapped, as a soft circle of light with a fine ring and a bright
// centre: it says "here" without saying what they thought of it, so nobody's
// eye is led before they've looked for themselves. `small`: on a photo in a
// feed card. `strong`: the line about it is being looked at.
export function Hotspot({ small = false, strong = false }: { small?: boolean; strong?: boolean }) {
  return (
    <span aria-hidden data-hotspot className="pointer-events-none absolute size-0">
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
