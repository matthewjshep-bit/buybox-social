import { EyeOff, Heart, Lock, Sparkles, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { TopicSide } from "@/lib/profile";
import { updatedLabel, voiceOf, type ShownStory, type TasteChip } from "@/lib/taste-story";

type Current = { key: string; side: TopicSide | null } | null;

// Someone's taste in a few words: a headline from what they like, a sentence
// or two (from a template, or written by AI and labelled so), and the things
// they keep liking and passing on, each a way to see just those homes below.
// The words may wait on the database, never on the model, and the rest of
// the card never waits on them.
export function TasteStoryCard({
  name,
  isMe,
  headline,
  enough,
  loves,
  passes,
  passesPrivate,
  shown,
  template = null,
  counts,
  current,
  chipHref,
  controls,
}: {
  name: string;
  isMe: boolean;
  headline: string | null;
  enough: boolean;
  // Just what this viewer may see.
  loves: TasteChip[];
  passes: TasteChip[];
  // Their own page, with passes kept from everyone else.
  passesPrivate: boolean;
  // The words: here now, or still being read (with the template meanwhile
  // for browsers that won't run the script that swaps them in).
  shown: ShownStory | null | Promise<ShownStory | null>;
  template?: ShownStory | null;
  counts: { likes: number; passes: number; comments: number };
  current: Current;
  chipHref: (key: string, side: TopicSide) => string;
  // "Not quite right?", on their own page.
  controls?: ReactNode;
}) {
  const title = isMe ? "Your taste" : `${name}'s taste`;
  const waiting = shown instanceof Promise;
  return (
    <section aria-labelledby="taste-story-title" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 id="taste-story-title" className="text-[13px] font-semibold text-stone-600">
        {title}
      </h2>
      {headline && <p className="mt-1 text-balance break-words font-display text-[22px] leading-7 text-ink">{headline}</p>}
      {waiting ? (
        <Suspense
          fallback={
            <>
              <SentenceSkeleton />
              <noscript>
                <Sentence shown={template} name={name} isMe={isMe} />
              </noscript>
            </>
          }
        >
          <Later shown={shown}>{(story) => <Sentence shown={story} name={name} isMe={isMe} />}</Later>
        </Suspense>
      ) : (
        <Sentence shown={shown} name={name} isMe={isMe} />
      )}
      {!enough && isMe && (
        <p className="mt-1 text-[15px] leading-snug text-stone-700">
          Like a few more homes and a short description of your taste will appear here.
        </p>
      )}
      <TasteRow side="like" chips={loves} current={current} href={chipHref} isMe={isMe} />
      <TasteRow side="pass" chips={passes} current={current} href={chipHref} isMe={isMe} />
      {passesPrivate && passes.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-stone-600">
          <Lock aria-hidden size={12} className="shrink-0" />
          Only you see what you pass on
        </p>
      )}
      {waiting ? (
        <Suspense
          fallback={
            <>
              <SourceSkeleton />
              <noscript>
                <Source shown={template} name={name} isMe={isMe} counts={counts} />
              </noscript>
            </>
          }
        >
          <Later shown={shown}>{(story) => <Source shown={story} name={name} isMe={isMe} counts={counts} />}</Later>
        </Suspense>
      ) : (
        <Source shown={shown} name={name} isMe={isMe} counts={counts} />
      )}
      {controls}
    </section>
  );
}

// Whatever needs the words, once they've been read.
async function Later({
  shown,
  children,
}: {
  shown: Promise<ShownStory | null>;
  children: (story: ShownStory | null) => ReactNode;
}) {
  return children(await shown);
}

// "Maya tends to like the kitchen and natural light, and usually passes on
// the price." Plain text, in their name, or "You" on their own page.
function Sentence({ shown, name, isMe }: { shown: ShownStory | null; name: string; isMe: boolean }) {
  if (!shown) return null;
  return <p className="mt-2 text-[17px] leading-[26px] text-stone-800">{voiceOf(shown.text, name, isMe)}</p>;
}

// Where the words came from: "Written by AI from Maya's 14 likes, 3 passes
// and 9 comments · updated 2d", or "From your 14 likes and 3 passes · updated today".
function Source({
  shown: story,
  name,
  isMe,
  counts,
}: {
  shown: ShownStory | null;
  name: string;
  isMe: boolean;
  counts: { likes: number; passes: number; comments: number };
}) {
  if (!story) return null;
  const whose = isMe ? "your" : `${name}'s`;
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const parts = [
    counts.likes > 0 && n(counts.likes, "like", "likes"),
    counts.passes > 0 && n(counts.passes, "pass", "passes"),
    story.ai && counts.comments > 0 && n(counts.comments, "comment", "comments"),
  ].filter((part): part is string => Boolean(part));
  const from =
    parts.length === 0 ? `${whose} page` : `${whose} ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`}`;
  const when = story.at ? ` · updated ${updatedLabel(story.at)}` : "";
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-stone-600">
      {story.ai && <Sparkles aria-hidden size={14} className="mt-px shrink-0 text-brand" />}
      <span>
        {story.ai ? `Written by AI from ${from}` : `From ${from}`}
        {when}
      </span>
    </p>
  );
}

// Three lines' worth, pulsing, while the words are read (only where a
// script will swap the words in).
function SentenceSkeleton() {
  return (
    <div aria-hidden className="mt-2 flex animate-pulse flex-col gap-2.5 py-1 [@media(scripting:none)]:hidden">
      <span className="h-4 w-full rounded-full bg-stone-200" />
      <span className="h-4 w-11/12 rounded-full bg-stone-200" />
      <span className="h-4 w-2/3 rounded-full bg-stone-200" />
    </div>
  );
}

function SourceSkeleton() {
  return (
    <span
      aria-hidden
      className="mt-3 block h-3 w-1/2 animate-pulse rounded-full bg-stone-200 [@media(scripting:none)]:hidden"
    />
  );
}

// "Loves Covered porch 3 · Kitchen 5", each one showing just those cards. On
// their own page, a chip they've switched off is marked as only theirs.
function TasteRow({
  side,
  chips,
  current,
  href,
  isMe,
}: {
  side: TopicSide;
  chips: TasteChip[];
  current: Current;
  href: (key: string, side: TopicSide) => string;
  isMe: boolean;
}) {
  if (chips.length === 0) return null;
  const like = side === "like";
  const Icon = like ? Heart : ThumbsDown;
  const title = like ? "Loves" : "Passes on";
  return (
    <div role="group" aria-label={title} className="mt-3 flex flex-wrap items-center gap-1.5">
      <span
        aria-hidden
        className={cn("mr-1 flex items-center gap-1 text-[13px] font-semibold", like ? "text-rose-800" : "text-amber-800")}
      >
        <Icon size={14} className={like ? "fill-current" : undefined} />
        {title}
      </span>
      {chips.map((chip) => {
        const hidden = isMe && chip.hidden;
        return (
          <Link
            key={chip.key}
            href={href(chip.key, side)}
            aria-label={`${title} ${chip.label}, ${chip.homes} ${chip.homes === 1 ? "home" : "homes"}${hidden ? ", only you see this" : ""}`}
            aria-current={current?.key === chip.key.toLowerCase() && current.side === side ? "true" : undefined}
            className={cn(
              "relative inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold leading-5 before:absolute before:inset-x-0 before:-inset-y-1",
              hidden
                ? "border border-dashed border-stone-400 bg-white text-stone-600 hover:bg-stone-50 aria-[current]:border-solid aria-[current]:border-stone-700"
                : like
                  ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100 aria-[current]:ring-2 aria-[current]:ring-rose-700"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 aria-[current]:ring-2 aria-[current]:ring-amber-700",
            )}
          >
            {hidden && <EyeOff aria-hidden size={12} className="shrink-0" />}
            {chip.label} <span className="tabular-nums">{chip.homes}</span>
          </Link>
        );
      })}
    </div>
  );
}
