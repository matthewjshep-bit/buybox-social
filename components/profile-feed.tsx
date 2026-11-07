import { Heart, Lock, MapPin, MessageCircle, Tag, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardMenu, MoreText } from "@/app/people/[id]/client";
import { MarkFace } from "@/components/spot-highlight";
import { Avatar, Badge } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import { cardTime, dayHeading, dayName, type PinKind, type ProfileCard } from "@/lib/profile";
import { button, card as cardClass, glass } from "@/lib/ui";

// Everything someone has done, Facebook-style: one card per home per day,
// under "Today", "Yesterday" and so on. Each card shows the photo with the
// spots they picked out, the home, and what they said, and opens the home.

const PIN: Record<PinKind, string> = { like: "bg-rose-500", dislike: "bg-amber-500", comment: "bg-brand" };

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
}: {
  cards: ProfileCard[];
  name: string;
  // What their initial is from, if not their name ("" for a plain figure).
  face?: string;
  isMe: boolean;
  // An agent's face is ink, as everywhere.
  agent?: boolean;
  earlierHref: string | null;
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
              <Card
                key={card.id}
                card={card}
                name={name}
                face={face}
                isMe={isMe}
                agent={agent}
                day={seen.get(card.home.key)! > 1 ? dayName(card.day) : undefined}
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

function Card({
  card,
  name,
  face,
  isMe,
  agent,
  day,
}: {
  card: ProfileCard;
  name: string;
  face: string;
  isMe: boolean;
  agent: boolean;
  day?: string;
}) {
  const { home, photo } = card;
  const href = `/homes/${encodeURIComponent(home.key)}${photo ? `?photo=${photo.index}` : ""}`;
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
        <Avatar name={face} tone={agent ? "agent" : "person"} size={8} />
        <p className="min-w-0 flex-1 pt-1 text-body leading-snug text-ink">
          <strong className="font-semibold">{isMe ? "You" : name}</strong> {card.sentence}
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

      {photo && !quiet && <CardPhoto card={card} name={face} agent={agent} />}

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
      <div className="h-4" />
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

// The photo at its own shape, so each spot lands where it was picked: dots for
// what they liked (rose), didn't (amber) and talked about, and their initial
// on the newest, as on the photo in the feed.
function CardPhoto({ card, name, agent }: { card: ProfileCard; name: string; agent: boolean }) {
  const photo = card.photo!;
  const ratio = photo.width && photo.height ? photo.width / photo.height : null;
  const [newest, ...rest] = card.pins;
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
        {rest.reverse().map((pin, i) => (
          <span
            key={i}
            aria-hidden
            data-pin={pin.kind}
            className={cn(
              "pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.45)] ring-2 ring-white",
              pin.kind === "comment" ? "size-4 text-white" : "size-3",
              PIN[pin.kind],
            )}
            style={at(pin)}
          >
            {pin.kind === "comment" && <MessageCircle size={9} strokeWidth={3} />}
          </span>
        ))}
        {newest && <AvatarPin name={name} agent={agent} kind={newest.kind} x={newest.x} y={newest.y} />}
        {card.otherPhotos > 0 && (
          <span className={cn(glass, "absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-meta font-semibold")}>
            +{card.otherPhotos} {card.otherPhotos === 1 ? "photo" : "photos"}
          </span>
        )}
      </div>
    </div>
  );
}

// The same face the feed draws on the photo where someone liked or said something.
function AvatarPin({ name, agent, kind, x, y }: { name: string; agent: boolean; kind: PinKind; x: number; y: number }) {
  return (
    <span
      aria-hidden
      data-pin={kind}
      data-newest
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
      style={at({ x, y })}
    >
      <MarkFace initial={name.trim()[0]?.toUpperCase()} agent={agent} mark={kind} pin className="ring-2" />
    </span>
  );
}
