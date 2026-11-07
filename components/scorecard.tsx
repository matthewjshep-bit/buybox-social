"use client";

import { ClipboardList, EyeOff, Hand, Heart, Lock, MapPin, MessageCircle, Sparkles, Tag, ThumbsDown } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AspectSummary } from "@/components/aspect-summary";
import type { SpotRef } from "@/components/listing-thread";
import { Avatar, Badge, HomeThumb } from "@/components/ui";
import type { FeedPost } from "@/lib/feed";
import { agentFirstName, cn, timeAgo } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import { FACTS, mediaKeyOf, spotName, tagPosition, thingOf, type FactTag } from "@/lib/photos";
import {
  buildScorecard,
  namesList,
  type AspectRow,
  type FactRow,
  type PersonTake,
  type Scorecard,
  type ScorecardMode,
  type ScorecardViewer,
  type SpotRow,
} from "@/lib/scorecard";
import type { TimelineComment } from "@/lib/timeline";
import { button, pill } from "@/lib/ui";

// The Scorecard: what everyone thinks of a home, then the home itself, in one
// place, for the sheet (phones), the panel beside the photo (wide) and the
// agent's dashboard. Light, quiet, every row a fingertip to tap.

// The agent, in a sentence: their name, or "your agent".
const agentCalled = (agentName?: string) => (agentName && agentName !== "Your agent" ? agentName : "your agent");
const firstOf = (agentName?: string) => (agentName === "Your agent" ? "your agent" : agentFirstName(agentName));
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function ScorecardBody({
  post,
  mode,
  agentName,
  siblings,
  viewer,
  myName,
  alone = false,
  offLink = false,
  onShowSpot,
  onOpenFact,
  onAllComments,
  onCompose,
  onOpenMore,
  onLike,
  onPass,
  onReply,
}: {
  post: FeedPost;
  mode: ScorecardMode;
  agentName?: string;
  // The other homes on the same link, to compare with.
  siblings?: FeedPost[];
  // You, as you are right now (what you've just tapped counts at once).
  viewer?: ScorecardViewer;
  // Your first name, for your face.
  myName?: string | null;
  // On an agent's link that's known to be yours alone: "Only you and {agent}
  // see this", as the comment box says.
  alone?: boolean;
  // The agent's dashboard: a home they've taken off the link.
  offLink?: boolean;
  // To a spot on the photo (or, for a fact, its card). `keyboard`: pressed
  // with a key, so the card that opens takes the keyboard.
  onShowSpot?: (spot: SpotRef, keyboard?: boolean) => void;
  onOpenFact?: (tag: FactTag, keyboard?: boolean) => void;
  onAllComments?: () => void;
  // The comments, with the cursor in the box.
  onCompose?: () => void;
  // More: to say why, or change your mind.
  onOpenMore?: () => void;
  // "I like it" and "Not for me", as the heart and More do them.
  onLike?: () => void;
  onPass?: () => void;
  // The agent's dashboard: reply to the client.
  onReply?: () => void;
}) {
  const card = useMemo(
    () => buildScorecard(post, mode, { viewer, agentName, siblings, myName }),
    [post, mode, viewer, agentName, siblings, myName],
  );
  const share = mode !== "public";
  const agent = agentCalled(agentName);
  const showSpot = mode === "agent" ? undefined : onShowSpot;

  return (
    <div className="flex flex-col gap-6 pb-2 text-ink">
      {/* (Plain boxes, not a page's banner and footer: the site has those.) */}
      <div>
        <p className="text-body font-semibold leading-snug">{card.header.address}</p>
        <p className="mt-0.5 text-meta text-muted">
          <span className="font-display font-semibold text-ink">{card.header.line.split(" · ")[0]}</span>
          {card.header.line.slice(card.header.line.indexOf(" · "))}
        </p>
        {share && (
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-2xl bg-stone-100 px-2.5 py-1.5 text-meta leading-[18px] text-stone-700">
            <Lock aria-hidden size={12} className="mt-[3px] shrink-0" />
            {mode === "agent"
              ? "From the people on this link · only they and you see this"
              : alone
                ? `Only you and ${agent} see this`
                : `From the people on this link · only they and ${agent} see this`}
          </p>
        )}
        {/* Said first, so nothing below reads as if they can still see it. */}
        {mode === "agent" && offLink && (
          <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-2xl bg-white px-2.5 py-1.5 text-meta font-semibold leading-[18px] text-stone-800 ring-1 ring-stone-300">
            <EyeOff aria-hidden size={12} className="mt-[3px] shrink-0" />
            Off their link · they can&apos;t see it now
          </p>
        )}
      </div>

      {card.quiet ? (
        <>
          <Quiet mode={mode} agent={agent} offLink={mode === "agent" && offLink} />
          {card.compare && <CompareSection compare={card.compare} />}
        </>
      ) : (
        <>
          <Section title="How people feel">
            <Feel card={card} myName={myName} />
          </Section>

          {card.say && (
            <Section title="What people say">
              {card.say.sentences.map((sentence) => (
                <p key={sentence} className="text-body leading-6">
                  {sentence}
                </p>
              ))}
              <p className="mt-1 text-meta text-muted" suppressHydrationWarning>
                {card.say.from}
                {card.say.at && ` · updated ${timeAgo(card.say.at)}`}
              </p>
            </Section>
          )}

          {(card.aspects.liked.length > 0 || card.aspects.disliked) && (
            <Section title="By aspect">
              <AspectSummary
                variant="rows"
                liked={Object.fromEntries(card.aspects.liked.map((row) => [row.aspect, row.count]))}
                disliked={Object.fromEntries((card.aspects.disliked ?? []).map((row) => [row.aspect, row.count]))}
                you={{
                  liked: card.aspects.liked.filter((row) => row.you).map((row) => row.aspect),
                  disliked: (card.aspects.disliked ?? []).filter((row) => row.you).map((row) => row.aspect),
                }}
                // (Someone can like the home and still not like its light.)
                dislikeNote="What people didn't like, whether or not they passed"
                detail={(aspect, tone) => (
                  <AspectDetail
                    row={(tone === "like" ? card.aspects.liked : (card.aspects.disliked ?? [])).find((r) => r.aspect === aspect)}
                    share={share}
                    peek={mode === "agent"}
                    onShowSpot={showSpot}
                  />
                )}
              />
            </Section>
          )}

          {card.agree && (
            // (On the agent's dashboard, "you" is the agent.)
            <Section title={mode === "agent" ? "Where they agree" : "Where you agree"}>
              <ul className="flex flex-col gap-1.5 text-body leading-6">
                {card.agree.map((line) => (
                  <li key={line.label}>
                    <span className="font-semibold">{line.label}:</span> {line.things.join(" · ")}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {card.compare && <CompareSection compare={card.compare} />}

          {card.photos && (
            <Section title="In the photos">
              <div className="flex flex-col gap-4">
                {card.photos.loved.length > 0 && (
                  <SpotList title="Loved in the photos" rows={card.photos.loved} share={share} agent={mode === "agent"} onShowSpot={showSpot} />
                )}
                {card.photos.pause && (
                  <SpotList title="Gave people pause" rows={card.photos.pause} share={share} agent={mode === "agent"} onShowSpot={showSpot} />
                )}
                {card.photos.pauseNone && (
                  <div>
                    <h4 className="text-meta font-semibold text-amber-900">Gave people pause</h4>
                    <p className="mt-1 text-body text-muted">{card.photos.pauseNone}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="What people said">
            <Said
              card={card}
              post={post}
              peek={mode === "agent"}
              onShowSpot={showSpot}
              onAllComments={onAllComments}
              onCompose={onCompose}
            />
          </Section>
        </>
      )}

      {mode === "agent" && card.people ? (
        card.people.length > 0 && (
          <Section title="What each person thinks">
            <ul className="flex flex-col divide-y divide-stone-100">
              {card.people.map((person) => (
                <PersonRow key={person.key} person={person} />
              ))}
            </ul>
          </Section>
        )
      ) : (
        <Section title="Your take">
          <Take card={card} onLike={onLike} onPass={onPass} onOpenMore={onOpenMore} />
        </Section>
      )}

      <Section title="The facts">
        <Facts rows={card.facts} onOpenFact={mode === "agent" ? undefined : onOpenFact} />
      </Section>

      <Section title="About this home" id="about">
        {share && post.note && (
          <div className="mb-3 rounded-2xl bg-stone-50 p-4">
            <p className="text-meta font-semibold text-muted">{mode === "agent" ? "Your note to them" : `From ${agent}`}</p>
            <p className="mt-1 whitespace-pre-line text-base leading-[26px]">{post.note}</p>
          </div>
        )}
        {card.about.remarks && <p className="text-base leading-[26px] text-stone-800">{card.about.remarks}</p>}
        {card.about.listedBy && <p className={cn("text-body text-muted", card.about.remarks && "mt-3")}>{card.about.listedBy}</p>}
        {card.about.sample && <p className="mt-1 text-meta text-muted">Sample listing, fictional and not for sale</p>}
      </Section>

      <div className="border-t border-stone-200 pt-4">
        {mode === "public" ? (
          card.activity && (
            <p aria-label="Activity" className="text-meta text-muted">
              {card.activity}
            </p>
          )
        ) : mode === "agent" ? (
          <>
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className={button({ kind: "primary" })}
              >
                <MessageCircle aria-hidden size={17} />
                Reply to your client
              </button>
            )}
            {offLink && (
              <p className={cn("text-meta text-muted", onReply && "mt-2")}>
                You took this home off their link. What they said about it still counts.
              </p>
            )}
          </>
        ) : (
          <>
            {onCompose && (
              <button
                type="button"
                onClick={onCompose}
                className={button({ kind: "primary" })}
              >
                <MessageCircle aria-hidden size={17} />
                Message {firstOf(agentName)}
              </button>
            )}
            <p className="mt-2 text-meta text-muted">{capital(agent)} sees what you like and say on this link.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section data-section={id}>
      <h3 className="mb-2 text-body font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

// Nobody's weighed in yet: one card in place of everything they'd have said.
// `offLink`: a home the agent has taken off the link, so nothing more can come.
function Quiet({ mode, agent, offLink = false }: { mode: ScorecardMode; agent: string; offLink?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-stone-200">
        <Hand size={17} className="text-stone-500" />
      </span>
      <div>
        <p className="text-body font-semibold">{offLink ? "No one weighed in on it." : "No one has weighed in yet."}</p>
        <p className="mt-0.5 text-body leading-6 text-muted">
          {offLink
            ? "They didn't react to it before you took it off their link."
            : mode === "agent"
              ? "When they like something in its photos, pass on it or say something about it, you'll see it here."
              : "Tap anything in a photo to like it or say something about it."}
          {mode === "share" && ` ${capital(agent)} sees what you like and say.`}
        </p>
      </div>
    </div>
  );
}

// "8 liked it", "1 passed", "9 comments": big numbers, plain labels.
function Factoids({ card }: { card: Scorecard }) {
  const { likes, passes, comments, privateMore } = card.feel;
  const items = [
    { n: likes, label: "liked it", name: `${likes} ${likes === 1 ? "person" : "people"} liked it`, icon: <Heart size={14} className="fill-rose-500 text-rose-500" /> },
    ...(passes > 0
      ? [{ n: passes, label: "passed", name: `${passes} ${passes === 1 ? "person" : "people"} passed`, icon: <ThumbsDown size={14} className="text-amber-700" /> }]
      : []),
    { n: comments, label: comments === 1 ? "comment" : "comments", name: `${comments} ${comments === 1 ? "comment" : "comments"}`, icon: <MessageCircle size={14} className="text-stone-500" /> },
  ];
  return (
    <>
      <ul className={cn("grid gap-3", items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {items.map((item) => (
          <li key={item.label} aria-label={item.name}>
            <p aria-hidden className="font-display text-[28px] font-semibold leading-8 tabular-nums">
              {item.n.toLocaleString("en-US")}
            </p>
            <p aria-hidden className="flex items-center gap-1 text-meta text-muted">
              {item.icon}
              {item.label}
            </p>
          </li>
        ))}
      </ul>
      {card.feel.yours > 0 && (
        <p className="mt-1.5 text-meta text-muted">
          and {card.feel.yours} {card.feel.yours === 1 ? "reply" : "replies"} from you
        </p>
      )}
      {/* On a line of its own, under the numbers, so none of them wraps. */}
      {privateMore > 0 && (
        <p className="mt-1.5 text-meta text-muted">
          and {privateMore} more {privateMore === 1 ? "comment" : "comments"} in private chats
        </p>
      )}
    </>
  );
}

function Feel({ card, myName }: { card: Scorecard; myName?: string | null }) {
  const { named, passes, likedOnly, bar, split, comments, yours } = card.feel;
  if (named) {
    const faces = [...named.liked, ...named.passed].slice(0, 4);
    return (
      <div>
        {faces.length > 0 ? (
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="flex shrink-0 pl-1.5">
              {faces.map((name, i) => (
                <span key={`${name}-${i}`} style={{ zIndex: faces.length - i }} className="-ml-1.5">
                  <Face name={name === "You" ? (myName ?? name) : name} size="sm" ring />
                </span>
              ))}
            </span>
            <p className="min-w-0 text-body leading-6">
              {named.liked.length > 0 && (
                <>
                  <span className="font-semibold">{namesList(named.liked)}</span> liked it
                </>
              )}
              {named.liked.length > 0 && named.passed.length > 0 && " · "}
              {named.passed.length > 0 && (
                <>
                  <span className="font-semibold">{namesList(named.passed)}</span> passed
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-body text-muted">Nobody has liked it or passed on it yet.</p>
        )}
        <p className="mt-1 text-meta text-muted">
          {comments} {comments === 1 ? "comment" : "comments"}
          {/* (The agent's dashboard: their own replies are counted apart.) */}
          {yours > 0 && ` · ${yours} ${yours === 1 ? "reply" : "replies"} from you`}
        </p>
        {named.notYet.length > 0 && <p className="mt-0.5 text-meta text-muted">Not yet: {namesList(named.notYet)}</p>}
      </div>
    );
  }
  return (
    <div>
      <Factoids card={card} />
      {bar && (
        <div aria-hidden className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-stone-100">
          {likedOnly > 0 && <span style={{ flex: likedOnly }} className="bg-rose-500" />}
          {passes > 0 && <span style={{ flex: passes }} className="bg-amber-500" />}
        </div>
      )}
      {split && <p className="mt-1.5 text-meta text-muted">{split}</p>}
    </div>
  );
}

// A face: their initial (the agent's in ink, as in their threads), or
// (unnamed) a person.
function Face({
  name,
  size = "md",
  ring = false,
  agent = false,
}: {
  name: string | null;
  size?: "sm" | "md";
  ring?: boolean;
  agent?: boolean;
}) {
  const anonymous = !name || name === "A buyer";
  return (
    <Avatar
      name={name}
      tone={anonymous ? "anonymous" : agent ? "agent" : "person"}
      size={size === "sm" ? 6 : 8}
      className={cn(ring && "ring-2 ring-white")}
    />
  );
}

// Who and where behind one aspect.
function AspectDetail({
  row,
  share,
  peek = false,
  onShowSpot,
}: {
  row?: AspectRow;
  share: boolean;
  // The agent's dashboard: a tap shows the photo bigger, here.
  peek?: boolean;
  onShowSpot?: (spot: SpotRef, keyboard?: boolean) => void;
}) {
  const [big, setBig] = useState<number | null>(null);
  const ids = useId();
  if (!row) return null;
  const who = [...row.names, ...(row.others > 0 ? [`${row.others} ${share ? (row.others === 1 ? "other" : "others") : row.others === 1 ? "buyer" : "buyers"}`] : [])];
  // Each photo once, with every spot on it, most liked first; a tap goes to
  // the first of them.
  const byPhoto = new Map<number, SpotRow[]>();
  for (const spot of row.spots) byPhoto.set(spot.index, [...(byPhoto.get(spot.index) ?? []), spot]);
  const photos = [...byPhoto.values()].slice(0, 6);
  const shown = photos.find((spots) => spots[0].index === big);
  const then = (spots: SpotRow[]) => (peek ? (big === spots[0].index ? "Show it smaller" : "Show it bigger") : "Show it on the photo");
  return (
    <div className="flex flex-col gap-2.5 pl-0.5">
      {who.length > 0 && <p className="text-meta text-stone-700">{namesList(who)}</p>}
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((spots) => {
            const first = spots[0];
            return (
              <li key={first.id}>
                <button
                  type="button"
                  disabled={!onShowSpot && !peek}
                  onClick={(event) =>
                    peek ? setBig(big === first.index ? null : first.index) : onShowSpot?.(first.spot, event.detail === 0)
                  }
                  aria-expanded={peek ? big === first.index : undefined}
                  aria-controls={peek && big === first.index ? `${ids}-peek` : undefined}
                  aria-label={
                    spots.length === 1
                      ? `${first.name}, photo ${first.index + 1}. ${then(spots)}`
                      : `Photo ${first.index + 1}: ${namesList(spots.map((spot) => spot.name))}. ${then(spots)}`
                  }
                  className="flex flex-col items-start gap-0.5 rounded-xl text-left disabled:cursor-default"
                >
                  <Thumb photo={first.photo} dots={spots.flatMap((spot) => (spot.at ? [spot.at] : []))} tone={first.tone} height={56} />
                  {spots.length > 1 && (
                    <span aria-hidden className="pl-0.5 text-[12px] leading-4 text-muted">
                      {spots.length} spots
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown && (
        <Peek
          id={`${ids}-peek`}
          photo={shown[0].photo}
          index={shown[0].index}
          dots={shown.flatMap((spot) => (spot.at ? [spot.at] : []))}
          tone={shown[0].tone}
          who={[...new Set(shown.flatMap((spot) => spot.names))]}
        />
      )}
      {row.comments.slice(0, 2).map((comment) => (
        <p key={comment.id} className="line-clamp-2 text-meta text-stone-700">
          <span className="font-semibold text-ink">{comment.name}:</span> {comment.body}
        </p>
      ))}
    </div>
  );
}

// A photo in miniature, whole, at its own shape, with a dot where it happened
// (or one for each spot on it). `big`: as wide as there's room for, up to
// 320px, with a larger dot.
function Thumb({
  photo,
  at,
  dots,
  tone,
  width,
  height,
  big = false,
  alt = "",
}: {
  photo: ListingMedia;
  at?: { x: number; y: number } | null;
  dots?: { x: number; y: number }[];
  tone: "like" | "dislike" | "comment";
  width?: number;
  height?: number;
  big?: boolean;
  alt?: string;
}) {
  const ratio = photo.ImageWidth && photo.ImageHeight ? photo.ImageWidth / photo.ImageHeight : 4 / 3;
  const w = width ?? Math.round((height ?? 54) * ratio);
  const h = height ?? Math.round(w / ratio);
  return (
    <span
      style={big ? { aspectRatio: ratio } : { width: w, height: h }}
      className={cn("relative block shrink-0 overflow-hidden rounded-xl bg-stone-200", big && "w-full max-w-80")}
    >
      <Image src={photo.MediaURL} alt={alt} fill sizes={big ? "320px" : `${w}px`} className="object-contain" />
      {(dots ?? (at ? [at] : [])).map((dot, i) => (
        <span
          key={i}
          aria-hidden
          data-spot-dot
          style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-white",
            big ? "size-4 ring-[3px] shadow-[0_0_0_4px_rgb(0_0_0/0.18)]" : "size-2.5 ring-2",
            tone === "like" ? "bg-rose-500" : tone === "dislike" ? "bg-amber-500" : "bg-brand",
          )}
        />
      ))}
    </span>
  );
}

// The photo, big enough to see exactly where someone tapped (the agent's
// dashboard, where a tap shows it here rather than going to the photo).
function Peek({
  id,
  photo,
  index,
  dots,
  tone,
  who,
}: {
  id: string;
  photo: ListingMedia;
  index: number;
  dots: { x: number; y: number }[];
  tone: "like" | "dislike" | "comment";
  // "Bea", "Bea and Cal": whose taps the dots are.
  who: string[];
}) {
  return (
    <figure id={id} data-spot-peek className="w-full max-w-80 pb-2 pt-1.5">
      <Thumb photo={photo} dots={dots} tone={tone} big alt={photo.ShortDescription || `Photo ${index + 1}`} />
      <figcaption className="mt-1 text-[12px] leading-4 text-muted">
        Photo {index + 1}
        {dots.length > 0 && `, where ${who.length > 0 && who.length <= 2 ? namesList(who) : "they"} tapped`}
      </figcaption>
    </figure>
  );
}

const SHOWN = 3;

function SpotList({
  title,
  rows,
  share,
  agent,
  onShowSpot,
}: {
  title: string;
  rows: SpotRow[];
  share: boolean;
  // The agent's dashboard: a tap shows it bigger, here.
  agent: boolean;
  onShowSpot?: (spot: SpotRef, keyboard?: boolean) => void;
}) {
  const [all, setAll] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const like = rows[0]?.tone !== "dislike";
  const shown = all ? rows : rows.slice(0, SHOWN);
  const list = useRef<HTMLUListElement>(null);
  const ids = useId();
  return (
    <div>
      <h4 className={cn("text-meta font-semibold", like ? "text-rose-900" : "text-amber-900")}>{title}</h4>
      <ul ref={list} className="mt-1 flex flex-col">
        {shown.map((row, i) => {
          const what =
            row.tone === "like"
              ? `${row.count} ${row.count === 1 ? "like" : "likes"}`
              : `${row.count} ${row.count === 1 ? "person" : "people"} didn't like it`;
          const who = [...row.names, ...(row.others > 0 ? [`${row.others} ${row.others === 1 ? "other" : "others"}`] : [])];
          // The room and who, as the eye reads them, said after the name.
          const where = `${ids}-${i}-where`;
          const whom = `${ids}-${i}-who`;
          const peek = `${ids}-${i}-peek`;
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-label={`${row.name}, photo ${row.index + 1}, ${what}. ${agent ? (big === row.id ? "Show it smaller" : "Show it bigger") : "Show it on the photo"}`}
                aria-describedby={who.length > 0 ? `${where} ${whom}` : where}
                aria-expanded={agent ? big === row.id : undefined}
                aria-controls={agent && big === row.id ? peek : undefined}
                disabled={!agent && !onShowSpot}
                onClick={(event) => (agent ? setBig(big === row.id ? null : row.id) : onShowSpot?.(row.spot, event.detail === 0))}
                className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-stone-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Thumb photo={row.photo} at={row.at} tone={row.tone} width={72} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold leading-5">{row.name}</span>
                  <span id={where} className="block truncate text-meta leading-[18px] text-muted">
                    {row.where}
                  </span>
                  {who.length > 0 && (
                    <span id={whom} className="block truncate text-meta leading-[18px] text-muted">
                      {share ? who.join(", ") : namesList(who)}
                    </span>
                  )}
                </span>
                <span aria-hidden className="flex shrink-0 items-center gap-1 text-body font-semibold tabular-nums">
                  {row.tone === "like" ? (
                    <Heart size={14} className="fill-rose-500 text-rose-500" />
                  ) : (
                    <ThumbsDown size={14} className="text-amber-700" />
                  )}
                  {row.count}
                </span>
              </button>
              {agent && big === row.id && (
                <Peek id={peek} photo={row.photo} index={row.index} dots={row.at ? [row.at] : []} tone={row.tone} who={row.names} />
              )}
            </li>
          );
        })}
      </ul>
      {!all && rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => {
            // The button goes; the keyboard moves on to the first row it showed.
            flushSync(() => setAll(true));
            list.current?.querySelectorAll<HTMLElement>(":scope > li > button")[SHOWN]?.focus();
          }}
          className={cn(button({ kind: "ghost", flush: true }), "text-brand")}
        >
          Show all {rows.length}
        </button>
      )}
    </div>
  );
}

function Said({
  card,
  post,
  peek = false,
  onShowSpot,
  onAllComments,
  onCompose,
}: {
  card: Scorecard;
  post: FeedPost;
  // The agent's dashboard: a spot a comment is about opens up here.
  peek?: boolean;
  onShowSpot?: (spot: SpotRef, keyboard?: boolean) => void;
  onAllComments?: () => void;
  onCompose?: () => void;
}) {
  const { top, total, privateMore } = card.said;
  const chats = `${privateMore} ${privateMore === 1 ? "comment is" : "comments are"} in private chats.`;
  return (
    <div>
      {top.length === 0 ? (
        // Said only in private: one plain line, never "yet" and "more" at once.
        <p className="text-body text-muted">
          {privateMore > 0
            ? `No one has commented in public yet. ${chats}`
            : total > 0
              ? // (The agent's dashboard, where only what you said yourself is here.)
                "They haven't said anything about it yet."
              : "No one has commented yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {top.map((comment) => (
            <SaidItem key={comment.id} comment={comment} post={post} peek={peek} onShowSpot={onShowSpot} />
          ))}
        </ul>
      )}
      {top.length > 0 && privateMore > 0 && (
        <p className="mt-3 text-meta text-muted">
          {privateMore} more in private chats
        </p>
      )}
      {total > 0 && onAllComments ? (
        <button
          type="button"
          onClick={onAllComments}
          className={cn(button({ kind: "ghost", flush: true }), "mt-2 text-brand")}
        >
          See all {total} {total === 1 ? "comment" : "comments"}
        </button>
      ) : (
        total === 0 &&
        onCompose && (
          <button
            type="button"
            onClick={onCompose}
            className={cn(button({ kind: "ghost", flush: true }), "mt-2 text-brand")}
          >
            Add a comment
          </button>
        )
      )}
    </div>
  );
}

function SaidItem({
  comment,
  post,
  peek,
  onShowSpot,
}: {
  comment: TimelineComment;
  post: FeedPost;
  peek: boolean;
  onShowSpot?: (spot: SpotRef, keyboard?: boolean) => void;
}) {
  const spot = comment.spot;
  return (
    <li className="flex gap-3">
      <Face name={comment.fromPrivateChat ? null : comment.name} agent={comment.isAgent} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-meta leading-5 text-muted">
          <span className="font-semibold text-ink">{comment.name}</span>
          {comment.isAgent && (
            <Badge tone="ink" small>
              Agent
            </Badge>
          )}
          <span suppressHydrationWarning>· {timeAgo(comment.at)}</span>
        </p>
        {spot && <SpotChip listing={post.listing} spot={spot} who={comment.name} peek={peek} onShowSpot={onShowSpot} />}
        <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-body leading-snug">{comment.body}</p>
      </div>
    </li>
  );
}

// "the porch", to go there (or, on the agent's dashboard, to see it here).
function SpotChip({
  listing,
  spot,
  who,
  peek,
  onShowSpot,
}: {
  listing: FeedPost["listing"];
  spot: SpotRef;
  who: string;
  peek: boolean;
  onShowSpot?: (spot: SpotRef, keyboard?: boolean) => void;
}) {
  if (peek) return <AgentSpotChip listing={listing} spot={spot} who={who} />;
  const body = (
    <>
      <MapPin aria-hidden size={12} />
      {spotName(listing, spot)}
    </>
  );
  const chip = "mt-1 inline-flex min-h-7 items-center gap-1 rounded-full bg-stone-100 px-2 text-[12px] font-semibold text-stone-700";
  if (!onShowSpot) return <span className={chip}>{body}</span>;
  return (
    <button type="button" onClick={(event) => onShowSpot(spot, event.detail === 0)} className={cn(chip, "hit-44 hover:bg-stone-200")}>
      <span className="sr-only">About </span>
      {body}
      <span className="sr-only">: show it</span>
    </button>
  );
}

// On the agent's dashboard, a comment's spot looks as it does in the thread
// beside it: a fact with its tag ("Price"), or the photo cropped around the
// spot with a dot where they tapped ("Covered porch"), which a tap shows
// whole, here.
function AgentSpotChip({ listing, spot, who }: { listing: FeedPost["listing"]; spot: SpotRef; who: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (spot.mediaKey === FACTS) {
    return (
      <span className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-meta font-semibold text-stone-700">
        <Tag aria-hidden size={13} />
        <span className="sr-only">About </span>
        {spot.tag}
      </span>
    );
  }
  const index = listing.Media.findIndex((photo) => mediaKeyOf(photo) === spot.mediaKey);
  const photo = listing.Media[index];
  if (!photo) return null;
  const label = thingOf(photo, spot.tag) ?? `A spot in photo ${index + 1}`;
  const at = tagPosition(photo, spot.tag);
  // Cropped around the spot, which keeps the dot where it is on the photo.
  const crop = at ? { objectPosition: `${at.x * 100}% ${at.y * 100}%` } : undefined;
  return (
    <>
      <button
        type="button"
        data-spot-chip
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`About ${label}: ${open ? "hide the photo" : "show it in the photo"}`}
        onClick={() => setOpen((was) => !was)}
        className="mt-1 flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-stone-100 p-0.5 pr-3.5 text-left text-meta font-semibold text-stone-700 hover:bg-stone-200"
      >
        <span aria-hidden className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-stone-200">
          <Image src={photo.MediaURL} alt="" fill sizes="40px" style={crop} className="object-cover" />
          {at && (
            <span
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
            />
          )}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {open && <Peek id={id} photo={photo} index={index} dots={at ? [at] : []} tone="comment" who={[who]} />}
    </>
  );
}

function Take({
  card,
  onLike,
  onPass,
  onOpenMore,
}: {
  card: Scorecard;
  onLike?: () => void;
  onPass?: () => void;
  onOpenMore?: () => void;
}) {
  const { verdict, liked, disliked, reacted, forYou } = card.take;
  // The first button stays the same button as it changes from "I like it"
  // to "Change your take", so the keyboard stays on it.
  const first = reacted ? onOpenMore : onLike;
  return (
    <div className="flex flex-col gap-3">
      {verdict || liked.length > 0 || disliked.length > 0 ? (
        <div className="flex flex-col gap-1 text-body leading-6">
          {verdict && <p>{verdict}</p>}
          {liked.length > 0 && (
            <p>
              <span className="font-semibold">What you liked:</span> {liked.join(" · ")}
            </p>
          )}
          {disliked.length > 0 && (
            <p>
              <span className="font-semibold">What you didn&apos;t like:</span> {disliked.join(" · ")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-body leading-6 text-muted">You haven&apos;t weighed in yet.</p>
      )}
      {forYou && (
        <p className="flex items-start gap-1.5 text-body font-semibold leading-6 text-stone-800">
          <Sparkles aria-hidden size={15} className="mt-1 shrink-0 text-brand" />
          For you: {forYou.join(" · ")}
        </p>
      )}
      {(first || (!reacted && onPass)) && (
        <div className="flex flex-wrap gap-2">
          {first && (
            <button
              type="button"
              onClick={first}
              className={
                reacted
                  ? button({ kind: "secondary" })
                  : // A like, in the colour of liking.
                    cn(pill(), "bg-rose-50 text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100")
              }
            >
              {reacted ? (
                "Change your take"
              ) : (
                <>
                  <Heart aria-hidden size={17} />I like it
                </>
              )}
            </button>
          )}
          {!reacted && onPass && (
            <button type="button" onClick={onPass} className={button({ kind: "secondary" })}>
              <ThumbsDown aria-hidden size={17} />
              Not for me
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Facts({ rows, onOpenFact }: { rows: FactRow[]; onOpenFact?: (tag: FactTag, keyboard?: boolean) => void }) {
  return (
    <dl className="flex flex-col text-body">
      {rows.map((row) => {
        const reacted = row.tag && (row.likes > 0 || row.dislikes > 0 || row.comments > 0);
        const tally = [
          row.likes > 0 && `${row.likes} ${row.likes === 1 ? "like" : "likes"}`,
          row.dislikes > 0 && `${row.dislikes} didn't like it`,
          row.comments > 0 && `${row.comments} ${row.comments === 1 ? "comment" : "comments"}`,
        ].filter(Boolean);
        const value = (
          <>
            {/* (A long address gives way to the counts beside it.) */}
            <span className="min-w-0 truncate font-medium text-ink">
              {row.label === "Price" ? <span className="font-display font-semibold">{row.value}</span> : row.value}
            </span>
            {reacted && (
              <span aria-hidden className="flex shrink-0 items-center gap-2 text-meta text-muted">
                {row.likes > 0 && (
                  <span className="flex items-center gap-0.5 tabular-nums">
                    <Heart size={12} className="fill-rose-500 text-rose-500" />
                    {row.likes}
                  </span>
                )}
                {row.dislikes > 0 && (
                  <span className="flex items-center gap-0.5 tabular-nums">
                    <ThumbsDown size={12} className="text-amber-700" />
                    {row.dislikes}
                  </span>
                )}
                {row.comments > 0 && (
                  <span className="flex items-center gap-0.5 tabular-nums">
                    <MessageCircle size={12} />
                    {row.comments}
                  </span>
                )}
              </span>
            )}
          </>
        );
        return (
          <div key={row.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-stone-100 last:border-b-0">
            <dt className="shrink-0 text-muted">{row.label}</dt>
            <dd className="min-w-0 text-right">
              {reacted && onOpenFact ? (
                <button
                  type="button"
                  onClick={(event) => onOpenFact(row.tag!, event.detail === 0)}
                  aria-label={`${row.label}, ${row.value}: ${tally.join(", ")}. Show it`}
                  className="-mr-2 flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-stone-50"
                >
                  {value}
                </button>
              ) : (
                <span className="flex min-w-0 items-center justify-end gap-3">
                  {value}
                  {/* The counts beside it, in words (the icons are hidden). */}
                  {reacted && <span className="sr-only">: {tally.join(", ")}</span>}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// One person on the link: their verdict at a glance, what they liked and
// didn't, and the last thing they said.
function PersonRow({ person }: { person: PersonTake }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Face name={person.name} />
      <div className="min-w-0 flex-1 text-body leading-6">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold">{person.name}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-px text-[12px] font-semibold leading-5",
              person.tone === "like"
                ? "bg-rose-50 text-rose-800"
                : person.tone === "pass"
                  ? "bg-amber-50 text-amber-900"
                  : "bg-stone-100 text-muted",
            )}
          >
            {person.tone === "like" && <Heart aria-hidden size={12} className="fill-rose-500 text-rose-500" />}
            {person.tone === "pass" && <ThumbsDown aria-hidden size={12} className="text-amber-700" />}
            {person.verdict}
          </span>
        </p>
        {person.likes.length > 0 && (
          <p className="mt-0.5 flex items-start gap-1.5 text-meta leading-5 text-stone-700">
            <Heart aria-hidden size={13} className="mt-[3px] shrink-0 text-rose-600" />
            <span>
              <span className="sr-only">Likes: </span>
              {person.likes.join(" · ")}
              {person.moreLikes > 0 && <span className="whitespace-nowrap text-muted"> · {person.moreLikes} more</span>}
            </span>
          </p>
        )}
        {person.passes.length > 0 && (
          <p className="mt-0.5 flex items-start gap-1.5 text-meta leading-5 text-stone-700">
            <ThumbsDown aria-hidden size={13} className="mt-[3px] shrink-0 text-amber-800" />
            <span>
              <span className="sr-only">Didn&apos;t like: </span>
              {person.passes.join(" · ")}
              {person.morePasses > 0 && <span className="whitespace-nowrap text-muted"> · {person.morePasses} more</span>}
            </span>
          </p>
        )}
        {person.comment && (
          <p className="mt-1 line-clamp-2 text-meta leading-5 text-muted" suppressHydrationWarning>
            <span className="text-ink">“{person.comment.body}”</span> · {timeAgo(person.comment.at)}
          </p>
        )}
      </div>
    </li>
  );
}

// "Compare with the other 2 homes": whether people liked each home, then each
// aspect, a heart or pass count per home, this home first. Wider than a
// phone with several homes, it scrolls sideways, the aspects kept in view:
// the homes slide under them, and a fade at the right says there's more.
function CompareSection({ compare }: { compare: NonNullable<Scorecard["compare"]> }) {
  const others = compare.homes.length - 1;
  const ids = useId();
  const scroller = useRef<HTMLDivElement>(null);
  // Whether it scrolls sideways at all (only then is it a stop for the
  // keyboard), and whether it has been, and has further to go.
  const [edges, setEdges] = useState({ scrolls: false, scrolled: false, more: false });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const scrolls = el.scrollWidth > el.clientWidth + 1;
      const next = {
        scrolls,
        scrolled: scrolls && el.scrollLeft > 1,
        more: scrolls && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      };
      setEdges((was) => (was.scrolls === next.scrolls && was.scrolled === next.scrolled && was.more === next.more ? was : next));
    };
    // (It measures as soon as it starts watching, and again on any change.)
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    if (el.firstElementChild) watch.observe(el.firstElementChild);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      watch.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);
  // The aspects' column, kept in view, with an edge the homes slide under.
  const sticky = cn(
    "sticky left-0 z-10 bg-white pr-3 text-left",
    edges.scrolled &&
      "after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-4 after:border-l after:border-stone-200 after:bg-linear-to-r after:from-white after:to-transparent",
  );
  // The most likes in a row stand out, so the home people liked it best in is plain.
  const most = (cells: { likes: number }[]) => Math.max(...cells.map((cell) => cell.likes));
  const row = (label: string, cells: { likes: number; passes: number }[], strong = false) => {
    const top = most(cells);
    return (
      <tr key={label} className="border-t border-stone-100">
        <th
          scope="row"
          className={cn(
            sticky,
            "py-2.5 align-top text-meta leading-5",
            strong ? "font-semibold text-ink" : "font-normal text-stone-800",
          )}
        >
          {label}
        </th>
        {cells.map((cell, i) => (
          <td key={compare.homes[i].key} className="px-2 py-2.5 align-top text-meta leading-5 tabular-nums text-stone-700">
            {cell.likes + cell.passes === 0 ? (
              <>
                <span aria-hidden className="text-stone-500">
                  –
                </span>
                <span className="sr-only">None</span>
              </>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                {cell.likes > 0 && (
                  <span className={cn("inline-flex items-center gap-1", cell.likes === top && cells.length > 1 && "font-semibold text-ink")}>
                    <Heart aria-hidden size={12} className="fill-rose-500 text-rose-500" />
                    {cell.likes}
                    <span className="sr-only"> {cell.likes === 1 ? "like" : "likes"}</span>
                  </span>
                )}{" "}
                {cell.passes > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ThumbsDown aria-hidden size={12} className="text-amber-700" />
                    {cell.passes}
                    <span className="sr-only"> {cell.passes === 1 ? "pass" : "passes"}</span>
                  </span>
                )}
              </span>
            )}
          </td>
        ))}
      </tr>
    );
  };
  return (
    <Section title={`Compare with the other ${others === 1 ? "home" : `${others} homes`}`}>
      <p id={`${ids}-about`} className="-mt-1 mb-2 text-meta text-muted">
        How many people on this link liked or passed on each, home by home.
      </p>
      <div className="relative -mx-1">
        <div
          ref={scroller}
          className="overflow-x-auto px-1"
          role="region"
          aria-labelledby={`${ids}-caption`}
          tabIndex={edges.scrolls ? 0 : undefined}
        >
          <table aria-describedby={`${ids}-about`} className="w-full border-collapse">
            <caption id={`${ids}-caption`} className="sr-only">
              This home beside the other {others === 1 ? "home" : `${others} homes`} on the link
            </caption>
            <thead>
              <tr>
                <th scope="col" className={cn(sticky, "pb-2 align-top")}>
                  <span className="sr-only">Aspect</span>
                </th>
                {/* Photos in a line along the top, whatever the address under each. */}
                {compare.homes.map((home, i) => (
                  <th key={home.key} scope="col" className="min-w-[4.75rem] max-w-28 px-2 pb-2 text-left align-top font-normal">
                    {home.photo && <HomeThumb src={home.photo.MediaURL} sizes="48px" className="mb-1 h-9 w-12" />}
                    <span className={cn("block text-[12px] leading-4", i === 0 ? "font-semibold text-ink" : "text-stone-700")}>
                      {i === 0 ? (
                        <>
                          This home<span className="sr-only">, {home.address}</span>
                        </>
                      ) : (
                        <span className="line-clamp-2 break-words">{home.address}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row("Overall", compare.overall, true)}
              {compare.rows.map((r) => row(r.label, r.cells))}
            </tbody>
          </table>
        </div>
        {edges.more && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-white to-transparent" />
        )}
      </div>
    </Section>
  );
}

// Wide, in the white panel: how people feel and what they say, in brief, and
// the way into the rest. Nothing anyone wrote (that's in the comments).
export function WhatPeopleThink({
  post,
  mode,
  viewer,
  myName,
  onOpen,
}: {
  post: FeedPost;
  mode: "public" | "share";
  viewer?: ScorecardViewer;
  myName?: string | null;
  onOpen: () => void;
}) {
  const card = useMemo(() => buildScorecard(post, mode, { viewer, myName }), [post, mode, viewer, myName]);
  if (card.quiet) return null;
  return (
    <div className="mt-4 rounded-2xl bg-stone-50 p-4">
      <h3 className="text-body font-semibold">What people think</h3>
      <div className="mt-2">
        <Feel card={card} myName={myName} />
      </div>
      {card.say && <p className="mt-3 text-body leading-6 text-stone-800">{card.say.sentences[0]}</p>}
      <button
        type="button"
        onClick={onOpen}
        className={cn(button({ kind: "ghost", flush: true }), "mt-2 text-brand")}
      >
        <ClipboardList aria-hidden size={17} />
        Open the scorecard
      </button>
    </div>
  );
}

