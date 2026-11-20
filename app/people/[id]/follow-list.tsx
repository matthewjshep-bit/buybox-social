import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonRow } from "@/components/person-row";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getFollowCounts, getFollowedIds, getFollowList } from "@/lib/follows";
import { cn } from "@/lib/format";
import { getProfilePerson } from "@/lib/profile";
import { getPublicIdentity } from "@/lib/public";
import { ANONYMOUS_BUYER } from "@/lib/timeline";
import { yourClientNames } from "@/lib/your-client";
import { backLink, button, card, pageColumn, pageTitle, tab as tabClass } from "@/lib/ui";
import { FollowButton } from "./client";

type Which = "followers" | "following";

// What a list calls someone with no name yet: as their page does, to others
// (to an agent, their own client by the first name the agent gave them).
const calledBy =
  (clients: Map<string, string>) =>
  (person: { id: string; name: string; isAgent: boolean }) =>
    person.name.trim() || clients.get(person.id) || (person.isAgent ? "An agent" : ANONYMOUS_BUYER);

// Someone's followers, or the people they follow, newest first: each to their
// page (the same row as Search's people: an agent by their whole name, with
// "Agent" and their company), with Follow beside them for whoever's looking
// (never beside themselves). Your own empty Following list offers the way to
// find people.
export async function FollowListPage({ id, which }: { id: string; which: Which }) {
  if (id.length > 64) notFound();
  const person = await getProfilePerson(id);
  if (!person) notFound();
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  const isMe = visitor?.id === person.id;
  const [list, counts, mine] = await Promise.all([
    // (Told who's looking: an agent's clients show only to the two of them.)
    getFollowList(person.id, which, visitor?.id ?? null),
    getFollowCounts(person.id, visitor?.id ?? null),
    getFollowedIds(visitor?.id),
  ]);
  // An agent's own clients, among them (or whose page this is), by name.
  const calledAs = calledBy(
    account?.role === "agent"
      ? await yourClientNames(account.id, [person.id, ...list.map((someone) => someone.id)])
      : new Map(),
  );
  const name = calledAs(person);
  const title =
    which === "followers"
      ? isMe
        ? "Your followers"
        : `${name}'s followers`
      : isMe
        ? "People you follow"
        : `People ${name} follows`;
  const signIn = account?.role ? undefined : `/login?next=${encodeURIComponent(`/people/${person.id}/${which}`)}`;
  const tabs: { key: Which; label: string; count: number }[] = [
    { key: "followers", label: counts.followers === 1 ? "Follower" : "Followers", count: counts.followers },
    { key: "following", label: "Following", count: counts.following },
  ];

  return (
    <main className={pageColumn()}>
      <Link href={`/people/${person.id}`} className={backLink}>
        <ArrowLeft aria-hidden size={18} /> {isMe ? "Your profile" : name}
      </Link>
      <h1 className={cn(pageTitle, "mt-2")}>{title}</h1>
      <nav aria-label="Followers and following" className="mt-3 flex gap-1 border-b border-stone-200">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/people/${person.id}/${tab.key}`}
            aria-current={tab.key === which ? "page" : undefined}
            className={cn(tabClass(tab.key === which), "-mb-px")}
          >
            <span className="tabular-nums">{tab.count}</span> {tab.label}
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState
          icon={Users}
          className="mt-4"
          title={
            which === "followers"
              ? isMe
                ? "No followers yet"
                : `No one follows ${name} yet`
              : isMe
                ? "You're not following anyone yet"
                : `${name} isn't following anyone yet`
          }
          action={
            isMe && which === "following" ? (
              <Link href="/search/people" className={button({ kind: "primary" })}>
                Find people
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul aria-label={title} className={cn(card, "mt-4 divide-y divide-stone-100")}>
          {list.map((someone) => {
            const called = someone.agentName || calledAs(someone);
            return (
              <PersonRow
                key={someone.id}
                href={`/people/${someone.id}`}
                name={called}
                face={someone.name}
                photo={someone.photo}
                agent={someone.isAgent}
                kind={someone.kind}
                line={someone.brokerage ?? undefined}
                action={
                  someone.id !== visitor?.id && (
                    <FollowButton
                      small
                      stay
                      personId={someone.id}
                      name={called}
                      following={mine.has(someone.id)}
                      signIn={signIn}
                    />
                  )
                }
              />
            );
          })}
        </ul>
      )}
    </main>
  );
}
