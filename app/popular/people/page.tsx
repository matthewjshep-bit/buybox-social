import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { FollowButton } from "@/app/people/[id]/client";
import { PersonRow } from "@/components/person-row";
import { PopularTop, tally } from "@/components/popular";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import type { PeopleViewer } from "@/lib/people";
import { defaultPeriod, getPopularPeople, isPeriod } from "@/lib/popular";
import { getPublicIdentity } from "@/lib/public";
import { card, pageColumn } from "@/lib/ui";

export const metadata = { title: "Popular people · Porchcard" };

// Popular's other half: the people who like and comment the most, number one
// first, over the same three times. Only for someone signed in (people
// aren't a public directory), only people a stranger could find already, and
// only what they did in public: never a pass, and never what a client did on
// a link their agent sent (lib/popular.ts).
export default async function PopularPeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, device, params] = await Promise.all([getCurrentUser(), readDevice(), searchParams]);
  if (!account) redirect("/login?next=/popular/people");
  const { visitor } = await getPublicIdentity(account.role ? account : null, device);
  const viewer: PeopleViewer = {
    visitorId: account.role ? (visitor?.id ?? null) : null,
    accountId: account.id,
    agent: account.role === "agent",
  };
  const period = isPeriod(params.period) ? params.period : await defaultPeriod("people");
  const people = await getPopularPeople(viewer, period);
  return (
    <main className={pageColumn()}>
      <PopularTop on="people" period={period} people />
      {people.length > 0 ? (
        <ol aria-label="Popular people" className={cn(card, "mt-4 divide-y divide-stone-100")}>
          {people.map((person, i) => (
            <PersonRow
              key={person.profileId}
              rank={i + 1}
              href={`/people/${person.profileId}`}
              name={person.me ? `${person.name} (you)` : person.name}
              face={person.face}
              photo={person.photo}
              agent={person.agent}
              line={tally(person.likes, person.comments)}
              action={
                person.me ? undefined : (
                  <FollowButton small stay personId={person.profileId} name={person.name} following={person.iFollow} />
                )
              }
            />
          ))}
        </ol>
      ) : (
        <EmptyState icon={Users} className="mt-4" title={period === "all" ? "No one here yet" : "No one yet in that time"}>
          Like or comment on a home and you&apos;re on the list.
        </EmptyState>
      )}
    </main>
  );
}
