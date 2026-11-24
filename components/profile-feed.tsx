import { Heart, Lock, ThumbsDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardMenu } from "@/app/people/[id]/client";
import { CommentBubble } from "@/components/comment-bubble";
import { FeedBar } from "@/components/home/feed-bar";
import { PhotoSwipe } from "@/components/photo-swipe";
import { SaidLine } from "@/components/said-line";
import { Avatar, Badge } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { FeedCounts } from "@/lib/home-feed";
import { cardTime, dayHeading, dayName, type FeedFilters, type ProfileCard } from "@/lib/profile";
import type { ReactionState } from "@/lib/reactions";
import { filterParams } from "@/lib/reel-context";
import { button, card as cardClass } from "@/lib/ui";

// Everything someone has done, Facebook-style: one card per home per day,
// under "Today", "Yesterday" and so on. Each card shows the photos (the one
// with the spots they picked out first, the rest a swipe away), the home,
// and what they said, then the bar every feed card has (how many liked the
// home, how many comments, which unfurl right there), and opens the homes
// full screen, in this page's order, on that one.

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
  control,
  bars,
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
  // What the feed shows, to choose from: on the first day's line.
  control?: ReactNode;
  // For the bar under each card: how many liked each home and how many
  // comments it has, by key, and the viewer's own take on each (so the heart
  // starts out right). Unset: no bars (a page with no gate around it).
  bars?: { counts: Record<string, FeedCounts>; mine: Record<string, ReactionState> };
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
      {days.map((day, i) => (
        <section key={day.heading}>
          <div className={cn("flex items-center justify-between gap-3", i === 0 && control && "min-h-11")}>
            <h2 className="px-1 text-body font-semibold text-muted">{day.heading}</h2>
            {i === 0 && control}
          </div>
          <ul className={cn("flex flex-col gap-3", i === 0 && control ? "mt-1" : "mt-2")}>
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
                bar={
                  bars && (
                    <FeedBar
                      listingKey={card.home.key}
                      address={card.home.address}
                      counts={bars.counts[card.home.key] ?? { likes: 0, comments: 0 }}
                      mine={bars.mine[card.home.key] ?? null}
                      active={card.home.active}
                      reelHref={`/reel?${new URLSearchParams({ from: reelFrom, home: card.home.key })}`}
                    />
                  )
                }
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
const reelHref = (from: string, card: Pick<ProfileCard, "home" | "photo">, filters?: Partial<FeedFilters>) =>
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
  only = false,
  header,
  footer,
  bar,
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
  // Only the viewer sees it (an agent's client's card): a lock by the time.
  only?: boolean;
  // Across its top, before who and what: a word on why this card comes first
  // (a client asked to see this home).
  header?: ReactNode;
  // Under it all: the agent's replies, and their own box to reply in.
  footer?: ReactNode;
  // Under the facts: the feed bar (likes, comments that unfurl), where the
  // page has one.
  bar?: ReactNode;
}) {
  const { home } = card;
  // A day when all they did was like someone's comment: a small card, no photo.
  const { quiet } = card;
  // A day they only commented: what they said is the line at the top ("Matt
  // commented “Sketch of the house”"), the newest of it; anything else they
  // said that day stays under the photo.
  const said = /^commented\b/.test(card.sentence) ? card.comments.at(-1) : undefined;
  const rest = said ? card.comments.slice(0, -1) : card.comments;
  const who = nameHref ? name : isMe ? "You" : name;
  const time = cardTime(card.at);
  const tail = said ? counts(said) : null;
  // The letters around what they said: name, time, counts, lock.
  const around = who.length + time.length + 3 + (tail?.length ?? 0) + (only ? 3 : 0);
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
      {header}
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar name={face} tone={agent ? "agent" : "person"} size={8} photo={avatarPhoto} />
        <p
          data-card-line
          className={cn("min-w-0 flex-1 pt-1 text-body leading-snug text-ink", said && "break-words")}
        >
          {nameHref ? (
            <Link
              href={nameHref}
              className="relative z-20 font-semibold underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] hover:underline"
            >
              {name}
            </Link>
          ) : (
            <strong className="font-semibold">{who}</strong>
          )}{" "}
          {said ? <SaidLine said={said} around={around} /> : card.sentence}
          {/* Held to the last word, so the time never starts a line on its own. */}
          {"\u00a0"}
          <span className="whitespace-nowrap text-meta text-muted">
            {"· "}
            <time dateTime={card.at}>{time}</time>
            {tail}
            {only && (
              <>
                {" · "}
                <Lock aria-hidden size={12} className="inline align-[-1px]" />
                <span className="sr-only">Only you see this</span>
              </>
            )}
          </span>
        </p>
        {/* Only on your own page: what you can take back from this card. */}
        {isMe && card.controls.length > 0 && (
          <CardMenu cardId={card.id} address={home.address} day={day} homeKey={home.key} controls={card.controls} />
        )}
      </div>

      {card.photos.length > 0 && !quiet && <CardPhotos card={card} href={href} />}

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

      {rest.length > 0 && (
        <ul className="flex flex-col gap-2 px-4 pt-3">
          {rest.map((comment) => (
            <li key={comment.id}>
              <CommentBubble
                name={isMe ? "You" : name}
                face={face}
                photo={avatarPhoto}
                agent={agent}
                spot={comment.spot}
                meta={commentMeta(comment)}
              >
                {comment.body}
              </CommentBubble>
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
      {bar}
      {footer ? <div className="relative z-20 px-4 pb-1">{footer}</div> : <div className={bar ? "h-1" : "h-4"} />}
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

// " · 3 likes · 2 replies" after the time, or nothing.
function counts(comment: ProfileCard["comments"][number]) {
  const parts = [
    comment.likes > 0 && `${comment.likes} ${comment.likes === 1 ? "like" : "likes"}`,
    comment.replies > 0 && `${comment.replies} ${comment.replies === 1 ? "reply" : "replies"}`,
  ].filter(Boolean);
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}

// The photos, to swipe through: the one they did something on first, whole
// at its own shape, with a soft hotspot on each spot they picked out, as on
// a home's own photos (where, not what they thought of it: the line above
// says that). The frame takes that first photo's shape (within reason), and
// is never taller than 36rem. A tap opens the home full screen on the photo
// showing.
function CardPhotos({ card, href }: { card: ProfileCard; href: string }) {
  const first = card.photos[0];
  const ratio = first.width && first.height ? Math.min(16 / 9, Math.max(3 / 4, first.width / first.height)) : null;
  return (
    <PhotoSwipe
      photos={card.photos}
      total={card.photoCount}
      href={href}
      label={card.home.address}
      fit="contain"
      sizes="(min-width: 1024px) 600px, (min-width: 640px) 576px, 100vw"
      className={cn("w-full bg-stone-100", !ratio && "aspect-[4/3]")}
      style={ratio ? { aspectRatio: String(ratio), maxHeight: "36rem" } : undefined}
    />
  );
}
