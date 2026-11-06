import { Heart, Lock, MapPin, MessageCircle, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MoreText } from "@/app/people/[id]/client";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { dayHeading, type PinKind, type ProfileCard } from "@/lib/profile";

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
  isMe,
  earlierHref,
}: {
  cards: ProfileCard[];
  name: string;
  isMe: boolean;
  earlierHref: string | null;
}) {
  const days: { heading: string; cards: ProfileCard[] }[] = [];
  for (const card of cards) {
    const heading = dayHeading(card.day);
    if (days.at(-1)?.heading === heading) days.at(-1)!.cards.push(card);
    else days.push({ heading, cards: [card] });
  }
  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.heading}>
          <h2 className="px-1 text-[15px] font-semibold text-stone-600">{day.heading}</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {day.cards.map((card) => (
              <Card key={card.id} card={card} name={name} isMe={isMe} />
            ))}
          </ul>
        </section>
      ))}
      {earlierHref && (
        <Link
          href={earlierHref}
          className="mx-auto flex min-h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-ink ring-1 ring-stone-300 hover:bg-stone-50"
        >
          Show earlier
        </Link>
      )}
    </div>
  );
}

function Card({ card, name, isMe }: { card: ProfileCard; name: string; isMe: boolean }) {
  const { home, photo } = card;
  const href = `/homes/${encodeURIComponent(home.key)}${photo ? `?photo=${photo.index}` : ""}`;
  // A day when all they did was like someone's comment: a small card, no photo.
  const quiet = !card.liked && !card.passed && !card.commented;
  return (
    <li className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      {/* The whole card opens the home. Links and buttons in it sit above this. */}
      <Link
        href={href}
        aria-label={`${home.address}: ${card.sentence}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-[-3px]"
      />
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar name={name} />
        <p className="min-w-0 pt-1 text-[15px] leading-snug text-ink">
          <strong className="font-semibold">{isMe ? "You" : name}</strong> {card.sentence}
          {" "}
          <span className="whitespace-nowrap text-[13px] text-stone-600">
            {"· "}
            <time dateTime={card.at}>{timeAgo(card.at)}</time>
          </span>
        </p>
      </div>

      {photo && !quiet && <CardPhoto card={card} name={name} />}

      <div className={cn("px-4", quiet ? "pt-0" : "pt-3")}>
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-xl font-semibold">{formatPrice(home.price)}</span>
          <span className="text-[15px] text-stone-700">
            · {home.beds} bd · {home.baths} ba · {home.sqft.toLocaleString("en-US")} sq ft
          </span>
          {!home.active && (
            <span className="self-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
              Off market
            </span>
          )}
        </p>
        <p className="truncate text-[13px] text-stone-600">
          {home.address}, {home.city}
        </p>
      </div>

      {card.facts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3">
          {card.facts.map((fact) => (
            <li
              key={`${fact.kind}-${fact.phrase}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1",
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
                <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[13px] font-semibold text-stone-700 ring-1 ring-stone-200">
                  <MapPin aria-hidden size={12} />
                  {comment.spot}
                </span>
              )}
              <MoreText className="text-[15px] leading-snug text-ink">{comment.body}</MoreText>
              <CommentMeta comment={comment} />
            </li>
          ))}
        </ul>
      )}

      {isMe && card.likedComments.length > 0 && (
        <div className="mx-4 mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-600">
            <Lock aria-hidden size={12} />
            Only you see this
          </p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {card.likedComments.map((like, i) => (
              <li key={i} className="truncate text-[13px] text-stone-700">
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

function CommentMeta({ comment }: { comment: ProfileCard["comments"][number] }) {
  const parts: ReactNode[] = [];
  if (comment.replyTo) {
    parts.push(
      <span key="reply">
        Replied to{" "}
        <Link
          href={`/people/${comment.replyTo.profileId}`}
          className="relative z-20 font-semibold text-ink underline-offset-2 hover:underline"
        >
          {comment.replyTo.name}
        </Link>
      </span>,
    );
  }
  if (comment.likes > 0) parts.push(`${comment.likes} ${comment.likes === 1 ? "like" : "likes"}`);
  if (comment.replies > 0) parts.push(`${comment.replies} ${comment.replies === 1 ? "reply" : "replies"}`);
  if (parts.length === 0) return null;
  return (
    <p className="mt-1 text-[13px] text-stone-600">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {part}
        </span>
      ))}
    </p>
  );
}

// The photo at its own shape, so each spot lands where it was picked: dots for
// what they liked (rose), didn't (amber) and talked about, and their initial
// on the newest, as on the photo in the feed.
function CardPhoto({ card, name }: { card: ProfileCard; name: string }) {
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
        {newest && <AvatarPin name={name} kind={newest.kind} x={newest.x} y={newest.y} />}
        {card.otherPhotos > 0 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[13px] font-semibold text-white backdrop-blur-md">
            +{card.otherPhotos} {card.otherPhotos === 1 ? "photo" : "photos"}
          </span>
        )}
      </div>
    </div>
  );
}

// The same pin the feed draws where someone liked or said something.
function AvatarPin({ name, kind, x, y }: { name: string; kind: PinKind; x: number; y: number }) {
  return (
    <span
      aria-hidden
      data-pin={kind}
      data-newest
      className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white shadow-[0_2px_8px_rgb(0_0_0/0.45)] ring-2 ring-white"
      style={at({ x, y })}
    >
      {name[0]?.toUpperCase()}
      <span className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-white">
        {kind === "like" ? (
          <Heart size={9} className="fill-rose-500 text-rose-500" />
        ) : kind === "dislike" ? (
          <ThumbsDown size={9} className="text-amber-600" strokeWidth={3} />
        ) : (
          <MessageCircle size={9} className="text-brand" strokeWidth={3} />
        )}
      </span>
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white"
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
