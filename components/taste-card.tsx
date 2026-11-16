import { ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { TasteRow } from "@/components/taste-story-card";
import { cn } from "@/lib/format";
import { getProfilePerson, getProfileRows, type TopicSide } from "@/lib/profile";
import { hasTaste, TASTE_MIN_REACTIONS, type Taste } from "@/lib/taste";
import { storyOf, type TasteChip } from "@/lib/taste-story";
import { card } from "@/lib/ui";

// Your taste as your own page tells it, for the end of the feed: the same
// chips, so "See your taste" opens a card that agrees.
type ReelTaste = {
  visitorId: string;
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
  return {
    visitorId: person.id,
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
      className={cn(card, "p-5", className)}
    >
      <h3 id="taste-title" className="text-meta font-semibold text-muted">
        Your taste
      </h3>
      {!hasTaste(taste) ? (
        <p className="mt-1 text-body leading-snug text-stone-700">
          Rate {TASTE_MIN_REACTIONS - reacted} more {TASTE_MIN_REACTIONS - reacted === 1 ? "home" : "homes"} to get
          better picks.
        </p>
      ) : (
        <>
          {story && (
            <>
              <TasteRow side="like" chips={story.loves} current={null} href={chipHref} isMe />
              <TasteRow side="pass" chips={story.passes} current={null} href={chipHref} isMe />
              {story.passesPrivate && story.passes.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-meta text-muted">
                  <Lock aria-hidden size={12} className="shrink-0" />
                  Only you see passes
                </p>
              )}
            </>
          )}
          {/* Their own profile, where a chip shows just those homes (an agent's is
              under Activity, after their listings). */}
          <Link
            href="/people/me?tab=activity"
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
