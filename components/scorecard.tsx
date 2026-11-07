"use client";

import { ClipboardList, Hand, Heart, Lock, MapPin, MessageCircle, Sparkles, ThumbsDown, User } from "lucide-react";
import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import { AspectSummary } from "@/components/aspect-summary";
import type { SpotRef } from "@/components/listing-thread";
import type { FeedPost } from "@/lib/feed";
import { cn, timeAgo } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import { spotName, type FactTag } from "@/lib/photos";
import {
  buildScorecard,
  namesList,
  type AspectRow,
  type FactRow,
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
  // To a spot on the photo (or, for a fact, its card).
  onShowSpot?: (spot: SpotRef) => void;
  onOpenFact?: (tag: FactTag) => void;
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
    () => buildScorecard(post, mode, { viewer, agentName, siblings }),
    [post, mode, viewer, agentName, siblings],
  );
  const share = mode !== "public";
  const agent = agentCalled(agentName);
  const showSpot = mode === "agent" ? undefined : onShowSpot;

  return (
    <div className="flex flex-col gap-6 pb-2 text-ink">
      <header>
        <p className="text-[15px] font-semibold leading-snug">{card.header.address}</p>
        <p className="mt-0.5 text-[13px] text-stone-600">
          <span className="font-display font-semibold text-ink">{card.header.line.split(" · ")[0]}</span>
          {card.header.line.slice(card.header.line.indexOf(" · "))}
        </p>
        {share && (
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-2xl bg-stone-100 px-2.5 py-1.5 text-[13px] leading-[18px] text-stone-700">
            <Lock aria-hidden size={12} className="mt-[3px] shrink-0" />
            From the people on this link · only they and {agent} see this
          </p>
        )}
      </header>

      {card.quiet ? (
        <Quiet share={share} agent={agent} />
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
                detail={(aspect, tone) => (
                  <AspectDetail
                    row={(tone === "like" ? card.aspects.liked : (card.aspects.disliked ?? [])).find((r) => r.aspect === aspect)}
                    share={share}
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
            <Said card={card} post={post} onShowSpot={showSpot} onAllComments={onAllComments} onCompose={onCompose} />
          </Section>
        </>
      )}

      {mode === "agent" && card.people ? (
        <Section title="What each person thinks">
          <ul className="flex flex-col gap-4">
            {card.people.map((person) => (
              <li key={person.key} className="flex gap-3">
                <Face name={person.name} />
                <div className="min-w-0 flex-1 text-[15px] leading-6">
                  <p>
                    <span className="font-semibold">{person.name}</span>{" "}
                    <span className="text-stone-600">· {person.verdict}</span>
                  </p>
                  {person.likes.length > 0 && <p className="text-[13px] text-stone-700">Likes: {person.likes.join(" · ")}</p>}
                  {person.passes.length > 0 && <p className="text-[13px] text-stone-700">Passes on: {person.passes.join(" · ")}</p>}
                  {person.comment && (
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-stone-600" suppressHydrationWarning>
                      “{person.comment.body}” · {timeAgo(person.comment.at)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
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
            <p className="text-[13px] font-semibold text-stone-600">From {agent}</p>
            <p className="mt-1 whitespace-pre-line text-base leading-[26px]">{post.note}</p>
          </div>
        )}
        {card.about.remarks && <p className="text-base leading-[26px] text-stone-800">{card.about.remarks}</p>}
        {card.about.listedBy && <p className={cn("text-[15px] text-stone-600", card.about.remarks && "mt-3")}>{card.about.listedBy}</p>}
        {card.about.sample && <p className="mt-1 text-[13px] text-stone-600">Sample listing, fictional and not for sale</p>}
      </Section>

      {card.compare && (
        <Section title={`Compare with the other ${card.compare.homes.length === 2 ? "home" : `${card.compare.homes.length - 1} homes`}`}>
          <Compare compare={card.compare} />
        </Section>
      )}

      <footer className="border-t border-stone-200 pt-4">
        {mode === "public" ? (
          card.activity && (
            <p aria-label="Activity" className="text-[13px] text-stone-600">
              {card.activity}
            </p>
          )
        ) : mode === "agent" ? (
          onReply && (
            <button
              type="button"
              onClick={onReply}
              className="flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-semibold text-white hover:opacity-90"
            >
              <MessageCircle aria-hidden size={17} />
              Reply to your client
            </button>
          )
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
      </footer>
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
function Quiet({ share, agent }: { share: boolean; agent: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-stone-200">
        <Hand size={17} className="text-stone-500" />
      </span>
      <div>
        <p className="text-[15px] font-semibold">No one has weighed in yet.</p>
        <p className="mt-0.5 text-[15px] leading-6 text-stone-600">
          Tap anything in a photo to like it or say something about it.
          {share && ` ${capital(agent)} sees what you like and say.`}
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
          {item.label.startsWith("comment") && privateMore > 0 && (
            <p className="mt-0.5 text-[13px] text-stone-600">and {privateMore} in private chats</p>
          )}
        </li>
      ))}
    </ul>
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
      {people >= 5 && (
        <p className="mt-1.5 text-[13px] text-stone-600">
          {likedOnly} of {people} liked it
        </p>
      )}
    </div>
  );
}

// A face: their initial, or (unnamed) a person.
function Face({ name, size = "md", ring = false }: { name: string | null; size?: "sm" | "md"; ring?: boolean }) {
  const anonymous = !name || name === "A buyer";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[11px]" : "size-8 text-[13px]",
        anonymous ? "bg-stone-200 text-stone-600" : "bg-brand text-white",
        ring && "ring-2 ring-white",
      )}
    >
      {anonymous ? <User size={size === "sm" ? 12 : 15} /> : name[0]?.toUpperCase()}
    </span>
  );
}

// Who and where behind one aspect.
function AspectDetail({ row, share, onShowSpot }: { row?: AspectRow; share: boolean; onShowSpot?: (spot: SpotRef) => void }) {
  if (!row) return null;
  const who = [...row.names, ...(row.others > 0 ? [`${row.others} ${share ? (row.others === 1 ? "other" : "others") : row.others === 1 ? "buyer" : "buyers"}`] : [])];
  return (
    <div className="flex flex-col gap-2.5 pl-0.5">
      {who.length > 0 && <p className="text-[13px] text-stone-700">{namesList(who)}</p>}
      {row.spots.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {row.spots.slice(0, 6).map((spot) => (
            <li key={spot.id}>
              <button
                type="button"
                disabled={!onShowSpot}
                onClick={() => onShowSpot?.(spot.spot)}
                aria-label={`${spot.name}, photo ${spot.index + 1}. Show it on the photo`}
                className="block rounded-xl disabled:cursor-default"
              >
                <Thumb photo={spot.photo} at={spot.at} tone={spot.tone} height={56} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {row.comments.slice(0, 2).map((comment) => (
        <p key={comment.id} className="line-clamp-2 text-[13px] text-stone-700">
          <span className="font-semibold text-ink">{comment.name}:</span> {comment.body}
        </p>
      ))}
    </div>
  );
}

// A photo in miniature, whole, at its own shape, with a dot where it happened.
function Thumb({
  photo,
  at,
  tone,
  width,
  height,
}: {
  photo: ListingMedia;
  at: { x: number; y: number } | null;
  tone: "like" | "dislike";
  width?: number;
  height?: number;
}) {
  const ratio = photo.ImageWidth && photo.ImageHeight ? photo.ImageWidth / photo.ImageHeight : 4 / 3;
  const w = width ?? Math.round((height ?? 54) * ratio);
  const h = height ?? Math.round(w / ratio);
  return (
    <span style={{ width: w, height: h }} className="relative block shrink-0 overflow-hidden rounded-xl bg-stone-200">
      <Image src={photo.MediaURL} alt="" fill sizes={`${w}px`} className="object-contain" />
      {at && (
        <span
          style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
          className={cn(
            "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white",
            tone === "like" ? "bg-rose-500" : "bg-amber-500",
          )}
        />
      )}
    </span>
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
  onShowSpot?: (spot: SpotRef) => void;
}) {
  const [all, setAll] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const like = rows[0]?.tone !== "dislike";
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div>
      <h4 className={cn("text-[13px] font-semibold", like ? "text-rose-900" : "text-amber-900")}>{title}</h4>
      <ul className="mt-1 flex flex-col">
        {shown.map((row) => {
          const what =
            row.tone === "like"
              ? `${row.count} ${row.count === 1 ? "like" : "likes"}`
              : `${row.count} ${row.count === 1 ? "person" : "people"} didn't like it`;
          const who = [...row.names, ...(row.others > 0 ? [`${row.others} ${row.others === 1 ? "other" : "others"}`] : [])];
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-label={`${row.name}, photo ${row.index + 1}, ${what}. ${agent ? (big === row.id ? "Show it smaller" : "Show it bigger") : "Show it on the photo"}`}
                aria-expanded={agent ? big === row.id : undefined}
                disabled={!agent && !onShowSpot}
                onClick={() => (agent ? setBig(big === row.id ? null : row.id) : onShowSpot?.(row.spot))}
                className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-stone-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Thumb photo={row.photo} at={row.at} tone={row.tone} width={72} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-5">{row.name}</span>
                  <span className="block truncate text-[13px] leading-[18px] text-stone-600">{row.where}</span>
                  {who.length > 0 && (
                    <span className="block truncate text-[13px] leading-[18px] text-stone-600">
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
                <div className="pb-2 pt-1">
                  <Thumb photo={row.photo} at={row.at} tone={row.tone} width={320} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!all && rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll(true)}
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
  onShowSpot,
  onAllComments,
  onCompose,
}: {
  card: Scorecard;
  post: FeedPost;
  onShowSpot?: (spot: SpotRef) => void;
  onAllComments?: () => void;
  onCompose?: () => void;
}) {
  const { top, total, privateMore } = card.said;
  return (
    <div>
      {top.length === 0 ? (
        <p className="text-[15px] text-stone-600">No one has commented yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {top.map((comment) => (
            <SaidItem key={comment.id} comment={comment} post={post} onShowSpot={onShowSpot} />
          ))}
        </ul>
      )}
      {privateMore > 0 && (
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

function SaidItem({ comment, post, onShowSpot }: { comment: TimelineComment; post: FeedPost; onShowSpot?: (spot: SpotRef) => void }) {
  const spot = comment.spot;
  return (
    <li className="flex gap-3">
      <Face name={comment.fromPrivateChat ? null : comment.name} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-stone-600">
          <span className="font-semibold text-ink">{comment.name}</span>
          {comment.isAgent && (
            <span className="rounded-full bg-ink px-2 py-px text-[10px] font-bold uppercase tracking-wide text-white">Agent</span>
          )}
          <span suppressHydrationWarning>· {timeAgo(comment.at)}</span>
        </p>
        {spot && (
          <SpotChip listing={post.listing} spot={spot} onShowSpot={onShowSpot} />
        )}
        <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-[15px] leading-snug">{comment.body}</p>
      </div>
    </li>
  );
}

// "the porch", to go there.
function SpotChip({ listing, spot, onShowSpot }: { listing: FeedPost["listing"]; spot: SpotRef; onShowSpot?: (spot: SpotRef) => void }) {
  const name = spotName(listing, spot);
  const body = (
    <>
      <MapPin aria-hidden size={12} />
      {name}
    </>
  );
  const chip = "mt-1 inline-flex min-h-7 items-center gap-1 rounded-full bg-stone-100 px-2 text-[12px] font-semibold text-stone-700";
  if (!onShowSpot) return <span className={chip}>{body}</span>;
  return (
    <button type="button" onClick={() => onShowSpot(spot)} className={cn(chip, "hit-44 hover:bg-stone-200")}>
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
  const { line, reacted, forYou } = card.take;
  const button = "flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold";
  return (
    <div className="flex flex-col gap-3">
      {line ? (
        <p className="text-[15px] leading-6">{line}</p>
      ) : (
        <p className="text-[15px] leading-6 text-stone-600">You haven&apos;t weighed in yet.</p>
      )}
      {forYou && (
        <p className="flex items-start gap-1.5 text-[15px] font-semibold leading-6 text-stone-800">
          <Sparkles aria-hidden size={15} className="mt-1 shrink-0 text-brand" />
          For you: {forYou.join(" · ")}
        </p>
      )}
      {reacted
        ? onOpenMore && (
            <button type="button" onClick={onOpenMore} className={cn(button, "self-start border border-stone-300 hover:border-stone-500")}>
              Change your take
            </button>
          )
        : (onLike || onPass) && (
            <div className="flex flex-wrap gap-2">
              {onLike && (
                <button type="button" onClick={onLike} className={cn(button, "bg-rose-50 text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100")}>
                  <Heart aria-hidden size={17} />I like it
                </button>
              )}
              {onPass && (
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

function Facts({ rows, onOpenFact }: { rows: FactRow[]; onOpenFact?: (tag: FactTag) => void }) {
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
            <span className="font-medium text-ink">{row.label === "Price" ? <span className="font-display font-semibold">{row.value}</span> : row.value}</span>
            {reacted && (
              <span aria-hidden className="flex items-center gap-2 text-[13px] text-stone-600">
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
            <dt className="text-stone-600">{row.label}</dt>
            <dd className="min-w-0 text-right">
              {reacted && onOpenFact ? (
                <button
                  type="button"
                  onClick={() => onOpenFact(row.tag!)}
                  aria-label={`${row.label}, ${row.value}: ${tally.join(", ")}. Show it`}
                  className="-mr-2 flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-stone-50"
                >
                  {value}
                </button>
              ) : (
                <span className="flex items-center justify-end gap-3">{value}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Compare({ compare }: { compare: NonNullable<Scorecard["compare"]> }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-max border-collapse text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-3 text-left font-semibold text-stone-600">
              <span className="sr-only">Aspect</span>
            </th>
            {compare.homes.map((home, i) => (
              <th key={home} scope="col" className="max-w-28 truncate px-2 py-2 text-left font-semibold text-stone-700">
                {i === 0 ? "This home" : home}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {compare.rows.map((row) => (
            <tr key={row.aspect} className="border-t border-stone-100">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={i} className="px-2 py-2 tabular-nums text-stone-700">
                  {cell.likes > 0 && (
                    <span className="mr-2 inline-flex items-center gap-0.5">
                      <Heart aria-hidden size={11} className="fill-rose-500 text-rose-500" />
                      {cell.likes}
                      <span className="sr-only"> {cell.likes === 1 ? "like" : "likes"}</span>
                    </span>
                  )}
                  {cell.passes > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <ThumbsDown aria-hidden size={11} className="text-amber-700" />
                      {cell.passes}
                      <span className="sr-only"> {cell.passes === 1 ? "pass" : "passes"}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const card = useMemo(() => buildScorecard(post, mode, { viewer }), [post, mode, viewer]);
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

