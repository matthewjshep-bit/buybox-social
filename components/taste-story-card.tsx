import { EyeOff, Heart, Lock, Sparkles, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { TopicSide } from "@/lib/profile";
import { voiceOf, type ShownStory, type TasteChip } from "@/lib/taste-story";
import { card } from "@/lib/ui";

type Current = { key: string; side: TopicSide | null } | null;

// Someone's taste in a few words: a headline from what they like, and the
// things they keep liking and passing on, each a way to see just those homes
// below. The chips say it all, so a sentence (from a template, or written by
// AI and labelled so) shows only when there are no chips to show.
// The words may wait on the database, never on the model, and the rest of
// the card never waits on them.
export function TasteStoryCard({
  name,
  isMe,
  headline,
  prompt,
  loves,
  passes,
  passesPrivate,
  shown,
  template = null,
  current,
  chipHref,
  controls,
}: {
  name: string;
  isMe: boolean;
  headline: string | null;
  // On their own page, with nothing to say yet: how to get a description.
  prompt: boolean;
  // Just what this viewer may see.
  loves: TasteChip[];
  passes: TasteChip[];
  // Their own page, with passes kept from everyone else.
  passesPrivate: boolean;
  // The words: here now, or still being read (with the template meanwhile
  // for browsers that won't run the script that swaps them in).
  shown: ShownStory | null | Promise<ShownStory | null>;
  template?: ShownStory | null;
  current: Current;
  chipHref: (key: string, side: TopicSide) => string;
  // "Not quite right?", on their own page.
  controls?: ReactNode;
}) {
  const title = isMe ? "Your taste" : `${name}'s taste`;
  const hasChips = loves.length + passes.length > 0;
  const chips = (
    <>
      <TasteRow side="like" chips={loves} current={current} href={chipHref} isMe={isMe} />
      <TasteRow side="pass" chips={passes} current={current} href={chipHref} isMe={isMe} />
      {passesPrivate && passes.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-meta text-muted">
          <Lock aria-hidden size={12} className="shrink-0" />
          Only you see passes
        </p>
      )}
    </>
  );
  return (
    <section aria-labelledby="taste-story-title" className={cn(card, "p-4")}>
      <h2 id="taste-story-title" className="text-meta font-semibold text-muted">
        {title}
      </h2>
      {headline && <Headline text={headline} />}
      {prompt && (
        <p className="mt-1 text-body leading-snug text-stone-700">
          Like a few more homes to see your taste.
        </p>
      )}
      {hasChips ? (
        chips
      ) : shown instanceof Promise ? (
        // The words and the line saying who wrote them arrive together, so a
        // sentence never shows under another's label, scripts or not.
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
          <Later shown={shown}>
            {(story) => (
              <>
                <Sentence shown={story} name={name} isMe={isMe} />
                <Source ai={Boolean(story?.ai)} />
              </>
            )}
          </Later>
        </Suspense>
      ) : (
        <>
          <Sentence shown={shown} name={name} isMe={isMe} />
          <Source ai={Boolean(shown?.ai)} />
        </>
      )}
      {controls}
    </section>
  );
}

// "Exterior · Bellevue · $689K–$1.9M · 2–4 beds". Parts wrap whole, so a
// price range never splits, and the dot before whichever part starts a line
// is tucked out of sight, so no line starts or ends on one. (Read aloud and
// copied, the dots are plain text.)
export function Headline({ text }: { text: string }) {
  return (
    <p className="mt-1 overflow-hidden font-display text-[22px] leading-7 text-ink">
      <span className="-ml-[0.8em] flex flex-wrap">
        {text.split(" · ").map((part, i) => (
          <span
            key={i}
            className="min-w-0 break-words before:inline-block before:w-[0.8em] before:text-center before:content-['·'_/_'']"
          >
            {i > 0 && <span className="sr-only"> · </span>}
            {part}
          </span>
        ))}
      </span>
    </p>
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

// Words the model wrote say so.
function Source({ ai }: { ai: boolean }) {
  if (!ai) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 text-meta leading-snug text-muted">
      <Sparkles aria-hidden size={14} className="mt-px shrink-0 text-brand" />
      Written by AI
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

// "Loves Covered porch 3 · Kitchen 5", each one showing just those cards. On
// their own page, a chip they've switched off is marked as only theirs.
export function TasteRow({
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
        className={cn("mr-1 flex items-center gap-1 text-meta font-semibold", like ? "text-rose-800" : "text-amber-800")}
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
            aria-label={`${title} ${chip.label}${hidden ? ", only you see this" : ""}`}
            aria-current={current?.key === chip.key.toLowerCase() && current.side === side ? "true" : undefined}
            className={cn(
              "relative inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-meta font-semibold leading-5 before:absolute before:inset-x-0 before:-inset-y-1",
              hidden
                ? "border border-dashed border-stone-400 bg-white text-muted hover:bg-stone-50 aria-[current]:border-solid aria-[current]:border-stone-700"
                : like
                  ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100 aria-[current]:ring-2 aria-[current]:ring-rose-700"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 aria-[current]:ring-2 aria-[current]:ring-amber-700",
            )}
          >
            {hidden && <EyeOff aria-hidden size={12} className="shrink-0" />}
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}
