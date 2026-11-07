"use client";

import { ClipboardList, Hand, Heart, Lock, MapPin, MessageCircle, Sparkles, ThumbsDown, User } from "lucide-react";
import Image from "next/image";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AspectSummary } from "@/components/aspect-summary";
import type { SpotRef } from "@/components/listing-thread";
import type { FeedPost } from "@/lib/feed";
import { cn, timeAgo } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import { mediaKeyOf, spotName, tagPosition, type FactTag } from "@/lib/photos";
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

// The Scorecard: what everyone thinks of a home, then the home itself, in one
// place, for the sheet (phones), the panel beside the photo (wide) and the
// agent's dashboard. Light, quiet, every row a fingertip to tap.

// The agent, in a sentence: their name, or "your agent".
const agentCalled = (agentName?: string) => (agentName && agentName !== "Your agent" ? agentName : "your agent");
const firstOf = (agentName?: string) =>
  agentName && agentName !== "Your agent" ? (agentName.split(" ")[0] ?? agentName) : "your agent";
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
        <p className="text-[15px] font-semibold leading-snug">{card.header.address}</p>
        <p className="mt-0.5 text-[13px] text-stone-600">
          <span className="font-display font-semibold text-ink">{card.header.line.split(" · ")[0]}</span>
          {card.header.line.slice(card.header.line.indexOf(" · "))}
        </p>
        {share && (
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-2xl bg-stone-100 px-2.5 py-1.5 text-[13px] leading-[18px] text-stone-700">
            <Lock aria-hidden size={12} className="mt-[3px] shrink-0" />
            {mode === "agent"
              ? "From the people on this link · only they and you see this"
              : alone
                ? `Only you and ${agent} see this`
                : `From the people on this link · only they and ${agent} see this`}
          </p>
        )}
      </div>

      {card.quiet ? (
        <>
          <Quiet mode={mode} agent={agent} />
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
                <p key={sentence} className="text-[15px] leading-6">
                  {sentence}
                </p>
              ))}
              <p className="mt-1 text-[13px] text-stone-600" suppressHydrationWarning>
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
            <Section title="Where you agree">
              <ul className="flex flex-col gap-1.5 text-[15px] leading-6">
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
                    <h4 className="text-[13px] font-semibold text-amber-900">Gave people pause</h4>
                    <p className="mt-1 text-[15px] text-stone-600">{card.photos.pauseNone}</p>
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
            <p className="text-[13px] font-semibold text-stone-600">{mode === "agent" ? "Your note to them" : `From ${agent}`}</p>
            <p className="mt-1 whitespace-pre-line text-base leading-[26px]">{post.note}</p>
          </div>
        )}
        {card.about.remarks && <p className="text-base leading-[26px] text-stone-800">{card.about.remarks}</p>}
        {card.about.listedBy && <p className={cn("text-[15px] text-stone-600", card.about.remarks && "mt-3")}>{card.about.listedBy}</p>}
        {card.about.sample && <p className="mt-1 text-[13px] text-stone-600">Sample listing, fictional and not for sale</p>}
      </Section>

      <div className="border-t border-stone-200 pt-4">
        {mode === "public" ? (
          card.activity && (
            <p aria-label="Activity" className="text-[13px] text-stone-600">
              {card.activity}
            </p>
          )
        ) : mode === "agent" ? (
          <>
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className="flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-semibold text-white hover:opacity-90"
              >
                <MessageCircle aria-hidden size={17} />
                Reply to your client
              </button>
            )}
            {offLink && (
              <p className={cn("text-[13px] text-stone-600", onReply && "mt-2")}>
                You took this home off their link, so they can&apos;t see it now. What they said still counts.
              </p>
            )}
          </>
        ) : (
          <>
            {onCompose && (
              <button
                type="button"
                onClick={onCompose}
                className="flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-semibold text-white hover:opacity-90"
              >
                <MessageCircle aria-hidden size={17} />
                Message {firstOf(agentName)}
              </button>
            )}
            <p className="mt-2 text-[13px] text-stone-600">{capital(agent)} sees what you like and say on this link.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section data-section={id}>
      <h3 className="mb-2 text-[15px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

// Nobody's weighed in yet: one card in place of everything they'd have said.
function Quiet({ mode, agent }: { mode: ScorecardMode; agent: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-stone-200">
        <Hand size={17} className="text-stone-500" />
      </span>
      <div>
        <p className="text-[15px] font-semibold">No one has weighed in yet.</p>
        <p className="mt-0.5 text-[15px] leading-6 text-stone-600">
          {mode === "agent"
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
            <p aria-hidden className="flex items-center gap-1 text-[13px] text-stone-600">
              {item.icon}
              {item.label}
            </p>
          </li>
        ))}
      </ul>
      {/* On a line of its own, under the numbers, so none of them wraps. */}
      {privateMore > 0 && (
        <p className="mt-1.5 text-[13px] text-stone-600">
          and {privateMore} more {privateMore === 1 ? "comment" : "comments"} in private chats
        </p>
      )}
    </>
  );
}

function Feel({ card, myName }: { card: Scorecard; myName?: string | null }) {
  const { named, passes, people, likedOnly, bar, comments } = card.feel;
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
            <p className="min-w-0 text-[15px] leading-6">
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
          <p className="text-[15px] text-stone-600">Nobody has liked it or passed on it yet.</p>
        )}
        <p className="mt-1 text-[13px] text-stone-600">
          {comments} {comments === 1 ? "comment" : "comments"}
        </p>
        {named.notYet.length > 0 && <p className="mt-0.5 text-[13px] text-stone-600">Not yet: {namesList(named.notYet)}</p>}
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
      {/* With passes, every one of them is said: someone who passed but
          liked a thing in the photos counts above among the likes, and here
          among the passes, so the numbers add up. */}
      {people >= 5 && (
        <p className="mt-1.5 text-[13px] text-stone-600">
          {passes > 0 ? `Of ${people} people, ${likedOnly} liked it and ${passes} passed` : `${likedOnly} of ${people} liked it`}
        </p>
      )}
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
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[11px]" : "size-8 text-[13px]",
        anonymous ? "bg-stone-200 text-stone-600" : agent ? "bg-ink text-white" : "bg-brand text-white",
        ring && "ring-2 ring-white",
      )}
    >
      {anonymous ? <User size={size === "sm" ? 12 : 15} /> : name[0]?.toUpperCase()}
    </span>
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
      {who.length > 0 && <p className="text-[13px] text-stone-700">{namesList(who)}</p>}
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
                    <span aria-hidden className="pl-0.5 text-[12px] leading-4 text-stone-600">
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
        <p key={comment.id} className="line-clamp-2 text-[13px] text-stone-700">
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
      <figcaption className="mt-1 text-[12px] leading-4 text-stone-600">
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
      <h4 className={cn("text-[13px] font-semibold", like ? "text-rose-900" : "text-amber-900")}>{title}</h4>
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
                  <span className="block truncate text-[15px] font-semibold leading-5">{row.name}</span>
                  <span id={where} className="block truncate text-[13px] leading-[18px] text-stone-600">
                    {row.where}
                  </span>
                  {who.length > 0 && (
                    <span id={whom} className="block truncate text-[13px] leading-[18px] text-stone-600">
                      {share ? who.join(", ") : namesList(who)}
                    </span>
                  )}
                </span>
                <span aria-hidden className="flex shrink-0 items-center gap-1 text-[15px] font-semibold tabular-nums">
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
          className="-mx-2 flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-brand hover:bg-stone-50"
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
        <p className="text-[15px] text-stone-600">
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
        <p className="mt-3 text-[13px] text-stone-600">
          {privateMore} more in private chats
        </p>
      )}
      {total > 0 && onAllComments ? (
        <button
          type="button"
          onClick={onAllComments}
          className="-mx-2 mt-2 flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-brand hover:bg-stone-50"
        >
          See all {total} {total === 1 ? "comment" : "comments"}
        </button>
      ) : (
        total === 0 &&
        onCompose && (
          <button
            type="button"
            onClick={onCompose}
            className="-mx-2 mt-2 flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-brand hover:bg-stone-50"
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
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-stone-600">
          <span className="font-semibold text-ink">{comment.name}</span>
          {comment.isAgent && (
            <span className="rounded-full bg-ink px-2 py-px text-[10px] font-bold uppercase tracking-wide text-white">Agent</span>
          )}
          <span suppressHydrationWarning>· {timeAgo(comment.at)}</span>
        </p>
        {spot && <SpotChip listing={post.listing} spot={spot} who={comment.name} peek={peek} onShowSpot={onShowSpot} />}
        <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-[15px] leading-snug">{comment.body}</p>
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
  const [open, setOpen] = useState(false);
  const id = useId();
  const name = spotName(listing, spot);
  const body = (
    <>
      <MapPin aria-hidden size={12} />
      {name}
    </>
  );
  const chip = "mt-1 inline-flex min-h-7 items-center gap-1 rounded-full bg-stone-100 px-2 text-[12px] font-semibold text-stone-700";
  const index = listing.Media.findIndex((photo) => mediaKeyOf(photo) === spot.mediaKey);
  const photo = listing.Media[index];
  if (peek && photo) {
    const at = tagPosition(photo, spot.tag);
    return (
      <>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((was) => !was)}
          className={cn(chip, "hit-44 hover:bg-stone-200")}
        >
          <span className="sr-only">About </span>
          {body}
          <span className="sr-only">{open ? ": hide the photo" : ": show it in the photo"}</span>
        </button>
        {open && <Peek id={id} photo={photo} index={index} dots={at ? [at] : []} tone="comment" who={[who]} />}
      </>
    );
  }
  if (!onShowSpot) return <span className={chip}>{body}</span>;
  return (
    <button type="button" onClick={(event) => onShowSpot(spot, event.detail === 0)} className={cn(chip, "hit-44 hover:bg-stone-200")}>
      <span className="sr-only">About </span>
      {body}
      <span className="sr-only">: show it</span>
    </button>
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
  const button = "flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold";
  // The first button stays the same button as it changes from "I like it"
  // to "Change your take", so the keyboard stays on it.
  const first = reacted ? onOpenMore : onLike;
  return (
    <div className="flex flex-col gap-3">
      {verdict || liked.length > 0 || disliked.length > 0 ? (
        <div className="flex flex-col gap-1 text-[15px] leading-6">
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
        <p className="text-[15px] leading-6 text-stone-600">You haven&apos;t weighed in yet.</p>
      )}
      {forYou && (
        <p className="flex items-start gap-1.5 text-[15px] font-semibold leading-6 text-stone-800">
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
              className={cn(
                button,
                reacted
                  ? "border border-stone-300 hover:border-stone-500"
                  : "bg-rose-50 text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100",
              )}
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
            <button type="button" onClick={onPass} className={cn(button, "border border-stone-300 hover:border-stone-500")}>
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
    <dl className="flex flex-col text-[15px]">
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
              <span aria-hidden className="flex shrink-0 items-center gap-2 text-[13px] text-stone-600">
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
            <dt className="shrink-0 text-stone-600">{row.label}</dt>
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
                <span className="flex min-w-0 items-center justify-end gap-3">{value}</span>
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
      <div className="min-w-0 flex-1 text-[15px] leading-6">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold">{person.name}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-px text-[12px] font-semibold leading-5",
              person.tone === "like"
                ? "bg-rose-50 text-rose-800"
                : person.tone === "pass"
                  ? "bg-amber-50 text-amber-900"
                  : "bg-stone-100 text-stone-600",
            )}
          >
            {person.tone === "like" && <Heart aria-hidden size={12} className="fill-rose-500 text-rose-500" />}
            {person.tone === "pass" && <ThumbsDown aria-hidden size={12} className="text-amber-700" />}
            {person.verdict}
          </span>
        </p>
        {person.likes.length > 0 && (
          <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-5 text-stone-700">
            <Heart aria-hidden size={13} className="mt-[3px] shrink-0 text-rose-600" />
            <span>
              <span className="sr-only">Likes: </span>
              {person.likes.join(" · ")}
              {person.moreLikes > 0 && <span className="whitespace-nowrap text-stone-600"> · {person.moreLikes} more</span>}
            </span>
          </p>
        )}
        {person.passes.length > 0 && (
          <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-5 text-stone-700">
            <ThumbsDown aria-hidden size={13} className="mt-[3px] shrink-0 text-amber-800" />
            <span>
              <span className="sr-only">Didn&apos;t like: </span>
              {person.passes.join(" · ")}
              {person.morePasses > 0 && <span className="whitespace-nowrap text-stone-600"> · {person.morePasses} more</span>}
            </span>
          </p>
        )}
        {person.comment && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-stone-600" suppressHydrationWarning>
            <span className="text-ink">“{person.comment.body}”</span> · {timeAgo(person.comment.at)}
          </p>
        )}
      </div>
    </li>
  );
}

// "Compare with the other 2 homes": whether people liked each home, then each
// aspect, a heart or pass count per home, this home first. Wider than a
// phone with several homes, it scrolls sideways, the aspects kept in view.
function CompareSection({ compare }: { compare: NonNullable<Scorecard["compare"]> }) {
  const others = compare.homes.length - 1;
  const ids = useId();
  // The most likes in a row stand out, so the home people liked it best in is plain.
  const most = (cells: { likes: number }[]) => Math.max(...cells.map((cell) => cell.likes));
  const row = (label: string, cells: { likes: number; passes: number }[], strong = false) => {
    const top = most(cells);
    return (
      <tr key={label} className="border-t border-stone-100">
        <th
          scope="row"
          className={cn(
            "sticky left-0 z-10 bg-white py-2.5 pr-3 text-left align-top text-[13px] leading-5",
            strong ? "font-semibold text-ink" : "font-normal text-stone-800",
          )}
        >
          {label}
        </th>
        {cells.map((cell, i) => (
          <td key={compare.homes[i].key} className="px-2 py-2.5 align-top text-[13px] leading-5 tabular-nums text-stone-700">
            {cell.likes + cell.passes === 0 ? (
              <>
                <span aria-hidden className="text-stone-300">
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
      <p id={`${ids}-about`} className="-mt-1 mb-2 text-[13px] text-stone-600">
        How many people on this link liked or passed on each, home by home.
      </p>
      <div className="-mx-1 overflow-x-auto px-1" role="region" aria-labelledby={`${ids}-caption`} tabIndex={0}>
        <table aria-describedby={`${ids}-about`} className="w-full border-collapse">
          <caption id={`${ids}-caption`} className="sr-only">
            This home beside the other {others === 1 ? "home" : `${others} homes`} on the link
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white pb-2 pr-3 text-left align-bottom">
                <span className="sr-only">Aspect</span>
              </th>
              {compare.homes.map((home, i) => (
                <th key={home.key} scope="col" className="min-w-[4.75rem] max-w-28 px-2 pb-2 text-left align-bottom font-normal">
                  {home.photo && (
                    <span aria-hidden className="relative mb-1 block h-9 w-12 overflow-hidden rounded-lg bg-stone-200">
                      <Image src={home.photo.MediaURL} alt="" fill sizes="48px" className="object-cover" />
                    </span>
                  )}
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
      <h3 className="text-[15px] font-semibold">What people think</h3>
      <div className="mt-2">
        <Feel card={card} myName={myName} />
      </div>
      {card.say && <p className="mt-3 text-[15px] leading-6 text-stone-800">{card.say.sentences[0]}</p>}
      <button
        type="button"
        onClick={onOpen}
        className="-mx-2 mt-2 flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-brand hover:bg-white"
      >
        <ClipboardList aria-hidden size={17} />
        Open the scorecard
      </button>
    </div>
  );
}

