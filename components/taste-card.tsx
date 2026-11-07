import { ChevronRight, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { Headline, TasteRow } from "@/components/taste-story-card";
import { cn } from "@/lib/format";
import { getProfilePerson, getProfileRows, type TopicSide } from "@/lib/profile";
import { hasTaste, TASTE_MIN_REACTIONS, type Taste } from "@/lib/taste";
import { readStory, shownStory, storyOf, voiceOf, type TasteChip } from "@/lib/taste-story";

// Your taste as your own page tells it, for the end of the feed: the same
// headline, words and chips, so "See your taste" opens a card that agrees.
export type ReelTaste = {
  visitorId: string;
  headline: string | null;
  // In your voice ("You tend to like…"), or none yet.
  sentence: string | null;
  // Written by AI (and so labelled), rather than from the template.
  ai: boolean;
  loves: TasteChip[];
  passes: TasteChip[];
  // Passes kept off your page for everyone else.
  passesPrivate: boolean;
};

// The card with your story in it, once it's read. Read from what's stored,
// never written here: only your own page ever asks the model.
export async function StoryTasteCard({
  taste,
  visitorId,
  className,
}: {
  taste: Taste | null;
  visitorId: string | null;
  className?: string;
}) {
  return <TasteCard taste={taste} story={await reelTaste(visitorId, taste)} className={className} />;
}

async function reelTaste(visitorId: string | null, taste: Taste | null): Promise<ReelTaste | null> {
  if (!visitorId || !hasTaste(taste)) return null;
  const person = await getProfilePerson(visitorId);
  if (!person) return null;
  // (Not the comments of others you liked: nothing on the card comes from them.)
  const story = storyOf(await getProfileRows(person.id, false), {
    hidden: person.tasteHidden,
    hidePasses: person.hidePasses,
  });
  const shown = shownStory(await readStory(person.id), story, false);
  return {
    visitorId: person.id,
    headline: story.headline,
    sentence: shown ? voiceOf(shown.text, person.name, true) : null,
    ai: shown?.ai ?? false,
    loves: story.own.loves,
    passes: story.own.passes,
    passesPrivate: person.hidePasses,
  };
}

// "Your taste", learned from your reactions. Seeing it fill in is part of the
// reward for reacting, and it's what today's picks are ranked by.
export function TasteCard({
  taste,
  story = null,
  className,
}: {
  taste: Taste | null;
  story?: ReelTaste | null;
  className?: string;
}) {
  const reacted = taste ? taste.likes + taste.passes : 0;
  // Each chip shows just those homes on your page, as it does there.
  const chipHref = (key: string, side: TopicSide) =>
    `/people/${story?.visitorId}?${new URLSearchParams({ about: key, side })}`;
  return (
    <section
      data-light
      aria-labelledby="taste-title"
      className={cn("rounded-2xl bg-white p-5 ring-1 ring-stone-200", className)}
    >
      <h3 id="taste-title" className="text-[13px] font-semibold text-stone-600">
        Your taste
      </h3>
      {!hasTaste(taste) ? (
        <p className="mt-1 text-[15px] leading-snug text-stone-700">
          Like or pass on {TASTE_MIN_REACTIONS - reacted} more{" "}
          {TASTE_MIN_REACTIONS - reacted === 1 ? "home" : "homes"} and your picks start matching what you like.
        </p>
      ) : (
        <>
          {story?.headline && <Headline text={story.headline} />}
          {story?.sentence && <p className="mt-2 text-[15px] leading-6 text-stone-800">{story.sentence}</p>}
          {story && (
            <>
              <TasteRow side="like" chips={story.loves} current={null} href={chipHref} isMe />
              <TasteRow side="pass" chips={story.passes} current={null} href={chipHref} isMe />
              {story.passesPrivate && story.passes.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-stone-600">
                  <Lock aria-hidden size={12} className="shrink-0" />
                  Only you see what you pass on
                </p>
              )}
            </>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-stone-600">
            {story?.ai && <Sparkles aria-hidden size={14} className="mt-px shrink-0 text-brand" />}
            <span>
              {story?.ai && "Written by AI. "}
              From <span className="tabular-nums">{reacted}</span> reactions: liked{" "}
              <span className="tabular-nums">{taste.likes}</span>, passed{" "}
              <span className="tabular-nums">{taste.passes}</span>.
            </span>
          </p>
          {/* The whole story, in words, on their own page. */}
          <Link
            href="/people/me"
            className="-mb-2 mt-1 inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-brand underline-offset-2 hover:underline"
          >
            See your taste
            <ChevronRight aria-hidden size={16} />
          </Link>
        </>
      )}
    </section>
  );
}
