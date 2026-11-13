import { User, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { avatarColor, card, type AvatarTone } from "@/lib/ui";

// A face's colours, for a face drawn by hand (on the reel's dark ground).
export { avatarColor };

// The few pieces every light page is made of: a card, a face, a home's photo
// in small, a badge, and what to say when there's nothing to show. The class
// names behind buttons, text boxes and cards are in lib/ui.ts.

// A white card with an optional title and something beside it (a link).
export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(card, "p-4 sm:p-5", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type AvatarSize = 6 | 7 | 8 | 9 | 10 | 18;

const FACE: Record<AvatarSize, { box: string; icon: number }> = {
  6: { box: "size-6 text-tiny", icon: 12 },
  7: { box: "size-7 text-xs", icon: 14 },
  8: { box: "size-8 text-meta", icon: 15 },
  9: { box: "size-9 text-sm", icon: 16 },
  10: { box: "size-10 text-base", icon: 18 },
  // The face at the top of someone's page.
  18: { box: "size-18 font-display text-[28px]", icon: 30 },
};

// Where the small mark sits on a face (a heart, a reply), for its size.
const MARK: Record<AvatarSize, string> = {
  6: "-bottom-1 -right-1.5 size-3.5",
  7: "-bottom-1 -right-1.5 size-3.5",
  8: "-bottom-1 -right-1 size-4",
  9: "-bottom-1 -right-1 size-4.5",
  10: "-bottom-0.5 -right-0.5 size-5",
  18: "bottom-0 right-0 size-6",
};

// Someone's face, as their initial: a buyer's (yours too) in the brand's
// colour, an agent's in ink, someone unnamed a plain figure in stone. The
// same everywhere, so a face says who someone is before their name does.
// (An agent's own photo, where they have one, is AgentAvatar; on the dark
// ground, MarkFace.) `badge`: a small mark on its corner for what they did.
// `photo`: their own photo, where they've added one, in place of the initial.
// `className`: its place and any edge (a ring, a margin), never its size or
// colour. `href`: their page, for a pointer or a finger (the name beside it
// is the link for everyone else, so this one is skipped by the keyboard and
// screen readers); it sits above a card's own cover link.
export function Avatar({
  name,
  tone = "person",
  size = 9,
  badge,
  photo,
  href,
  className: edge,
}: {
  name: string | null;
  tone?: AvatarTone;
  size?: AvatarSize;
  badge?: ReactNode;
  photo?: string | null;
  href?: string;
  className?: string;
}) {
  // A link around it takes its place and edge instead.
  const className = href ? undefined : edge;
  const initial = tone === "anonymous" ? undefined : name?.trim()[0]?.toUpperCase();
  const face = FACE[size];
  const shown = photo ? (
    // A small square photo of their own, served as it is.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      aria-hidden
      className={cn("shrink-0 rounded-full bg-stone-200 object-cover", face.box, !badge && className)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        face.box,
        avatarColor(initial ? tone : "anonymous"),
        !badge && className,
      )}
    >
      {initial ?? <User size={face.icon} />}
    </span>
  );
  const marked = !badge ? (
    shown
  ) : (
    // Round, as the face is, so an edge given to it is round too.
    <span aria-hidden className={cn("relative flex shrink-0 rounded-full", className)}>
      {shown}
      <span
        className={cn("absolute flex items-center justify-center rounded-full bg-white ring-1 ring-stone-200", MARK[size])}
      >
        {badge}
      </span>
    </span>
  );
  if (!href) return marked;
  return (
    <Link href={href} tabIndex={-1} aria-hidden className={cn("relative z-20 flex shrink-0 rounded-full", edge)}>
      {marked}
    </Link>
  );
}

// A home's photo in small: always rounded the same, grey until it loads.
// `className` sets its size (and where it sits); `sizes` the photo's width.
export function HomeThumb({
  src,
  alt = "",
  sizes,
  className,
  children,
}: {
  src?: string | null;
  alt?: string;
  sizes: string;
  className: string;
  // Over the photo: a tick when it's picked.
  children?: ReactNode;
}) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-xl bg-stone-200", className)}>
      {src && <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />}
      {children}
    </span>
  );
}

export type BadgeTone = "neutral" | "ink" | "like" | "pass" | "success" | "info" | "attention";

const BADGE: Record<BadgeTone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-1 ring-stone-200",
  // Who someone is: an agent, the owner.
  ink: "bg-ink text-white",
  like: "bg-rose-50 text-rose-900 ring-1 ring-rose-200",
  pass: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  // For sale, done.
  success: "bg-emerald-100 text-emerald-900",
  info: "bg-sky-100 text-sky-900",
  // Waiting on you: someone asked to see a home.
  attention: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
};

// A word or two about something, in a pill. `small`: in capitals, beside a
// name ("Agent").
export function Badge({
  tone = "neutral",
  small = false,
  children,
  className,
}: {
  tone?: BadgeTone;
  small?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full",
        small ? "px-2 py-px text-[10px] font-bold uppercase tracking-wide" : "px-2 py-0.5 text-xs font-semibold",
        BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Nothing to show here, said one way everywhere: an icon, a line, perhaps a
// word more and a way on, in a card of its own. `compact`: just the line,
// small, as a list inside a card says it's empty.
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (compact) return <p className={cn("py-6 text-center text-sm text-muted", className)}>{title}</p>;
  return (
    <div className={cn(card, "px-6 py-8 text-center", className)}>
      {Icon && <Icon aria-hidden size={28} className="mx-auto mb-2 text-stone-500" />}
      <p className="text-balance text-[17px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-balance text-body text-stone-700">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
