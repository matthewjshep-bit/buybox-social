import { Heart, Lock, MapPin, Tag, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardMenu, MoreText } from "@/app/people/[id]/client";
import { Hotspot } from "@/components/spot-highlight";
import { Avatar, Badge } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import { cardTime, dayHeading, dayName, type FeedFilters, type ProfileCard } from "@/lib/profile";
import { filterParams } from "@/lib/reel-context";
import { button, card as cardClass, glass } from "@/lib/ui";

// Everything someone has done, Facebook-style: one card per home per day,
// under "Today", "Yesterday" and so on. Each card shows the photo with the
// spots they picked out, the home, and what they said, and opens the homes
// full screen, in this page's order, on that one.

// Where a pin sits, in percent of the photo, to a tenth.
const at = ({ x, y }: { x: number; y: number }) => ({
  left: `${Math.round(x * 1000) / 10}%`,
  top: `${Math.round(y * 1000) / 10}%`,
});

export function ProfileFeed({
  cards,
  name,
  face = name,
  isMe,
  agent = false,
  earlierHref,
  reelFrom,
  photo,
  filters,
}: {
  cards: ProfileCard[];
  name: string;
  // What their initial is from, if not their name ("" for a plain figure).
  face?: string;
  isMe: boolean;
  // An agent's face is ink, as everywhere.
  agent?: boolean;
  earlierHref: string | null;
  // Whose page this is, for the homes full screen (`/reel?from=`).
  reelFrom: string;
  // Their own photo, where they've added one.
  photo?: string | null;
  // The filter the page has on, which the homes full screen keep: only
  // what's shown here, in the same order.
  filters?: Partial<FeedFilters>;
}) {
  const days: { heading: string; cards: ProfileCard[] }[] = [];
  // A home on more than one day here: each card's menu says which day it's for.
  const seen = new Map<string, number>();
  for (const card of cards) seen.set(card.home.key, (seen.get(card.home.key) ?? 0) + 1);
  for (const card of cards) {
    const heading = dayHeading(card.day);
    if (days.at(-1)?.heading === heading) days.at(-1)!.cards.push(card);
    else days.push({ heading, cards: [card] });
  }
  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.heading}>
          <h2 className="px-1 text-body font-semibold text-muted">{day.heading}</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {day.cards.map((card) => (
              <ActivityCard
                key={card.id}
                card={card}
                name={name}
                face={face}
                isMe={isMe}
                agent={agent}
                day={seen.get(card.home.key)! > 1 ? dayName(card.day) : undefined}
                href={reelHref(reelFrom, card, filters)}
                avatarPhoto={photo}
              />
            ))}
          </ul>
        </section>
      ))}
      {earlierHref && (
        <Link href={earlierHref} className={cn(button({ kind: "secondary" }), "mx-auto")}>
          Show earlier
        </Link>
      )}
    </div>
  );
}

// The homes of a feed full screen, opened on this card's (on its photo),
// with the page's filter, when it has one on, just after `from`.
export const reelHref = (from: string, card: Pick<ProfileCard, "home" | "photo">, filters?: Partial<FeedFilters>) =>
  `/reel?${new URLSearchParams([
    ["from", from],
    ...filterParams(filters),
    ["home", card.home.key],
    ...(card.photo ? [["photo", String(card.photo.index)] as [string, string]] : []),
  ])}`;

// One card: who, what they did and when; the photo, the home, what they said.
// The whole card opens `href`; `nameHref`, their page, from their name.
export function ActivityCard({
  card,
  name,
  face,
  isMe,
  agent,
  day,
  href,
  nameHref,
  avatarPhoto,
  footer,
}: {
  card: ProfileCard;
  name: string;
  face: string;
  isMe: boolean;
  agent: boolean;
  day?: string;
  href: string;
  nameHref?: string;
  // Their own photo, where they've added one, in place of their initial.
  avatarPhoto?: string | null;
  // Under it all, above the card's own link: what only the agent sees, Reply.
  footer?: ReactNode;
}) {
  const { home, photo } = card;
  // A day when all they did was like someone's comment: a small card, no photo.
  const { quiet } = card;
  return (
    <li className={cn(cardClass, "relative overflow-hidden")}>
      {/* The whole card opens the home. Links and buttons in it sit above this.
          Its focus ring is drawn inside, where the card's rounded edge can't cut it off. */}
      <Link
        href={href}
        aria-label={`${home.address}: ${card.sentence}`}
        data-card-link={card.id}
        className="absolute inset-0 z-10 scroll-mt-[var(--filters)] rounded-2xl focus-visible:outline-offset-[-3px]!"
      />
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar name={face} tone={agent ? "agent" : "person"} size={8} photo={avatarPhoto} />
        <p className="min-w-0 flex-1 pt-1 text-body leading-snug text-ink">
          {nameHref ? (
            <Link
              href={nameHref}
              className="relative z-20 font-semibold underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] hover:underline"
            >
              {name}
            </Link>
          ) : (
            <strong className="font-semibold">{isMe ? "You" : name}</strong>
          )}{" "}
          {card.sentence}
          {/* Held to the last word, so the time never starts a line on its own. */}
          {"\u00a0"}
          <span className="whitespace-nowrap text-meta text-muted">
            {"· "}
            <time dateTime={card.at}>{cardTime(card.at)}</time>
          </span>
        </p>
        {/* Only on your own page: what you can take back from this card. */}
        {isMe && card.controls.length > 0 && (
          <CardMenu cardId={card.id} address={home.address} day={day} homeKey={home.key} controls={card.controls} />
        )}
      </div>

      {photo && !quiet && <CardPhoto card={card} />}

      <div className={cn("px-4", quiet ? "pt-0" : "pt-3")}>
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-xl font-semibold">{formatPrice(home.price)}</span>
          <span className="text-body text-stone-700">
            · {home.beds} bd · {home.baths} ba · {home.sqft.toLocaleString("en-US")} sq ft
          </span>
          {!home.active && <Badge className="self-center">Off market</Badge>}
        </p>
        <p className="truncate text-meta text-muted">
          {home.address}, {home.city}
        </p>
      </div>

      {card.facts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3">
          {card.facts.map((fact) => (
            <li
              key={`${fact.kind}-${fact.phrase}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-semibold ring-1",
                fact.kind === "like"
                  ? "bg-rose-50 text-rose-900 ring-rose-200"
                  : "bg-amber-50 text-amber-900 ring-amber-200",
              )}
            >
              {fact.kind === "like" ? (
                <Heart aria-hidden size={12} className="fill-current" />
              ) : (
                <ThumbsDown aria-hidden size={12} />
              )}
              <span className="sr-only">{fact.kind === "like" ? "Liked " : "Didn't like "}</span>
              {fact.phrase}
            </li>
          ))}
        </ul>
      )}

      {card.comments.length > 0 && (
        <ul className="flex flex-col gap-2 px-4 pt-3">
          {card.comments.map((comment) => (
            <li key={comment.id} className="rounded-2xl bg-stone-50 p-3">
              {comment.spot && (
                <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-meta font-semibold text-stone-700 ring-1 ring-stone-200">
                  {comment.spot.fact ? <Tag aria-hidden size={12} /> : <MapPin aria-hidden size={12} />}
                  {comment.spot.name}
                </span>
              )}
              <MoreText className="text-body leading-snug text-ink" meta={commentMeta(comment)}>
                {comment.body}
              </MoreText>
            </li>
          ))}
        </ul>
      )}

      {isMe && card.likedComments.length > 0 && (
        <div className="mx-4 mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-2">
          <p className="flex items-center gap-1.5 text-meta font-semibold text-muted">
            <Lock aria-hidden size={12} />
            Only you see this
          </p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {card.likedComments.map((like, i) => (
              <li key={i} className="line-clamp-2 break-words text-meta text-stone-700">
                {quiet ? `${like.author}: ` : `You liked ${like.author}'s comment, `}
                &ldquo;{like.body}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
      {footer ? <div className="relative z-20 px-4 pb-1">{footer}</div> : <div className="h-4" />}
    </li>
  );
}

// "Replied to Sam · 3 likes · 2 replies", or nothing.
function commentMeta(comment: ProfileCard["comments"][number]) {
  const parts: ReactNode[] = [];
  if (comment.replyTo) {
    parts.push(
      <span key="reply">
        Replied to{" "}
        {/* A full-size target, though it reads as a word. */}
        <Link
          href={`/people/${comment.replyTo.profileId}`}
          className="relative z-20 scroll-mt-[var(--filters)] font-semibold text-ink underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-[15px] hover:underline"
        >
          {comment.replyTo.name}
        </Link>
      </span>,
    );
  }
  if (comment.likes > 0) parts.push(`${comment.likes} ${comment.likes === 1 ? "like" : "likes"}`);
  if (comment.replies > 0) parts.push(`${comment.replies} ${comment.replies === 1 ? "reply" : "replies"}`);
  if (parts.length === 0) return null;
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && " · "}
      {part}
    </span>
  ));
}

// The photo at its own shape, with a soft hotspot on each spot they picked
// out, as on a home's own photos: where, not what they thought of it (the
// sentence above says that).
function CardPhoto({ card }: { card: ProfileCard }) {
  const photo = card.photo!;
  const ratio = photo.width && photo.height ? photo.width / photo.height : null;
  return (
    <div className="bg-stone-100">
      <div
        className={cn("relative mx-auto overflow-hidden", !ratio && "aspect-[4/3]")}
        // Never taller than 36rem: a tall photo narrows instead.
        style={ratio ? { aspectRatio: String(ratio), width: `min(100%, ${36 * ratio}rem)` } : undefined}
      >
        <Image
          src={photo.url}
          alt={photo.alt}
          fill
          sizes="(min-width: 1024px) 600px, (min-width: 640px) 576px, 100vw"
          className={ratio ? "object-contain" : "object-cover"}
        />
        {card.pins.map((pin, i) => (
          <span
            key={i}
            aria-hidden
            data-pin={pin.kind}
            data-newest={i === 0 || undefined}
            className="pointer-events-none absolute size-0"
            style={at(pin)}
          >
            <Hotspot small />
          </span>
        ))}
        {card.otherPhotos > 0 && (
          <span className={cn(glass, "absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-meta font-semibold")}>
            +{card.otherPhotos} {card.otherPhotos === 1 ? "photo" : "photos"}
          </span>
        )}
      </div>
    </div>
  );
}
