import { Users } from "lucide-react";
import Form from "next/form";
import { redirect } from "next/navigation";
import { FollowButton } from "@/app/people/[id]/client";
import { PersonRow } from "@/components/person-row";
import { SearchField, SearchSwitch } from "@/components/search-switch";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import { findPeople, FOUND_MOST, NAME_LONGEST, suggestPeopleFor, type PeopleViewer } from "@/lib/people";
import { getPublicIdentity } from "@/lib/public";
import { card, groupLabel, pageColumn } from "@/lib/ui";

export const metadata = { title: "Find people · Porchcard" };

// How many people to follow are offered before anything is typed.
const SUGGESTED = 12;

// Why a name that was typed found nobody, in a few words. (An email says the
// same whoever's it is, so typing one can't tell whether they're here.)
function nobody(typed: string) {
  if (typed.includes("@")) return "Search by name, not email.";
  if (typed.length < 2) return "Type at least two letters.";
  return "No one by that name.";
}

// Search's other side: people. One box, "Name", and a list: each person's
// face, name ("Agent" and their company for an agent) and Follow. Before
// anything is typed, people worth following. Only for someone signed in
// (people aren't a public directory), and only ever what's on someone's
// public page: a first name, or an agent's own name and company (lib/people.ts).
export default async function PeopleSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, device, params] = await Promise.all([getCurrentUser(), readDevice(), searchParams]);
  if (!account) redirect("/login?next=/search/people");
  const typed = (typeof params.q === "string" ? params.q : "").trim().replace(/\s+/g, " ").slice(0, 100);
  const { visitor } = await getPublicIdentity(account.role ? account : null, device);
  const viewer: PeopleViewer = {
    visitorId: account.role ? (visitor?.id ?? null) : null,
    accountId: account.id,
    agent: account.role === "agent",
  };
  const people = typed ? await findPeople(viewer, typed) : await suggestPeopleFor(viewer, SUGGESTED);
  const heading = typed ? `People matching “${typed}”` : "People to follow";

  return (
    <>
      {/* The same row, on the same white, as over the map: switching between
          the two, nothing under the pointer moves. */}
      <div className="bg-white">
        <SearchSwitch on="people" className="px-4" />
      </div>
      <main className={pageColumn()}>
        <h1 className="sr-only">Find people</h1>
        {/* One round box with the magnifier in it, as for homes. */}
        <Form action="/search/people" role="search" aria-label="Find people">
          <SearchField
            // (A new search, or none: the box says what the page is showing.)
            key={typed}
            id="people-q"
            name="q"
            label="Name"
            defaultValue={typed}
            placeholder="Name or company"
            maxLength={NAME_LONGEST}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            aria-describedby="people-q-hint"
          />
          <p id="people-q-hint" className="sr-only">
            A first name, or an agent&apos;s name or company.
          </p>
        </Form>

        {people.length > 0 ? (
          <section aria-labelledby="people-found" className="mt-6">
            <h2 id="people-found" className={groupLabel}>
              {heading}
            </h2>
            <ul aria-label={heading} className={cn(card, "mt-2 divide-y divide-stone-100")}>
              {people.map((person) => (
                <PersonRow
                  key={person.profileId}
                  href={`/people/${person.profileId}`}
                  name={person.name}
                  face={person.face}
                  photo={person.photo}
                  agent={person.agent}
                  kind={person.kind}
                  line={[person.brokerage, person.reason].filter(Boolean).join(" · ") || undefined}
                  action={
                    <FollowButton small stay personId={person.profileId} name={person.name} following={person.iFollow} />
                  }
                />
              ))}
            </ul>
            {/* As many as are ever shown: the rest are a letter or two away. */}
            {typed && people.length >= FOUND_MOST && (
              <p className="mt-3 text-sm text-muted">Showing the first {FOUND_MOST}. Type more of the name to see fewer.</p>
            )}
          </section>
        ) : typed ? (
          <EmptyState icon={Users} className="mt-6" title={nobody(typed)} />
        ) : (
          <EmptyState icon={Users} className="mt-6" title="No one to suggest yet">
            Search for someone by name.
          </EmptyState>
        )}
      </main>
    </>
  );
}
