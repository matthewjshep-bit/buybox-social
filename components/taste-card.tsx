import { Sparkles } from "lucide-react";
import { AspectSummary } from "@/components/aspect-summary";
import { cn } from "@/lib/format";
import { describeBeds, describePriceRange, hasTaste, TASTE_MIN_REACTIONS, type Taste } from "@/lib/taste";

// "Your taste", learned from your reactions. Seeing it fill in is part of the
// reward for reacting, and it's what today's picks are ranked by.
export function TasteCard({ taste, className }: { taste: Taste | null; className?: string }) {
  const reacted = taste ? taste.likes + taste.passes : 0;
  return (
    <section aria-labelledby="taste-title" className={cn("rounded-2xl bg-white p-5 ring-1 ring-stone-200", className)}>
      <h3 id="taste-title" className="flex items-center gap-2 font-display text-xl">
        <Sparkles aria-hidden size={18} className="text-brand" />
        Your taste
      </h3>
      {!hasTaste(taste) ? (
        <p className="mt-1 text-sm text-stone-700">
          Like or pass on {TASTE_MIN_REACTIONS - reacted} more{" "}
          {TASTE_MIN_REACTIONS - reacted === 1 ? "home" : "homes"} and your picks start matching what you like.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-700">
            From <span className="tabular-nums">{reacted}</span> reactions: liked{" "}
            <span className="tabular-nums">{taste.likes}</span>, passed{" "}
            <span className="tabular-nums">{taste.passes}</span>.
            {taste.priceRange && ` Homes you like: ${describePriceRange(taste.priceRange)}`}
            {taste.bedsRange && `, ${describeBeds(taste.bedsRange)}`}
            {taste.cities.length > 0 && `, in ${taste.cities.slice(0, 3).join(", ")}`}
            {taste.priceRange && "."}
          </p>
          <AspectSummary
            liked={taste.liked}
            disliked={taste.disliked}
            likeLabel="You like"
            dislikeLabel="You pass on"
            limit={6}
            className="mt-3"
          />
        </>
      )}
    </section>
  );
}
