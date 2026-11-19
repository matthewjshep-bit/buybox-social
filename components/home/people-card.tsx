import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FollowText } from "@/components/home/follow-text";
import { PersonRow } from "@/components/person-row";
import { cn } from "@/lib/format";
import type { FoundPerson } from "@/lib/people";
import { card } from "@/lib/ui";

// As many people as the card offers (and so as many as a home asks for): the
// rest are behind "See all".
export const PEOPLE_SHOWN = 3;

// "People to follow", on a home: three people, each with the reason they're
// here under their name when there's a real one ("Follows you", "Liked 3
// homes you liked"; otherwise an agent's company, or nothing), a quiet Follow,
// and the way to everyone else. Nothing at all when there's nobody to offer.
// A home has it more than once (beside the feed on a wide screen, in the feed
// on a narrow one), only one of them showing: `id` keeps their headings apart.
export function PeopleCard({ people, id, className }: { people: FoundPerson[]; id: string; className?: string }) {
  if (people.length === 0) return null;
  return (
    <section aria-labelledby={id} className={cn(card, "py-3", className)}>
      <h2 id={id} className="px-4 text-body font-semibold">
        People to follow
      </h2>
      {/* (Each row brings 12px of its own: with this, faces line up under the heading.) */}
      <ul className="px-1">
        {people.slice(0, PEOPLE_SHOWN).map((person) => (
          <PersonRow
            key={person.profileId}
            href={`/people/${person.profileId}`}
            name={person.name}
            face={person.face}
            photo={person.photo}
            agent={person.agent}
            line={person.reason ?? person.brokerage ?? undefined}
            action={<FollowText personId={person.profileId} name={person.name} />}
          />
        ))}
      </ul>
      <Link
        href="/search/people"
        className="mx-4 flex min-h-11 items-center justify-center gap-1 border-t border-stone-200 pt-1 text-sm font-semibold text-stone-700 hover:text-ink"
      >
        See all<span className="sr-only"> people to follow</span> <ArrowRight aria-hidden size={14} />
      </Link>
    </section>
  );
}
