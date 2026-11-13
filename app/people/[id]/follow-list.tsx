import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getFollowCounts, getFollowedIds, getFollowList } from "@/lib/follows";
import { cn } from "@/lib/format";
import { getProfilePerson } from "@/lib/profile";
import { getPublicIdentity } from "@/lib/public";
import { ANONYMOUS_BUYER } from "@/lib/timeline";
import { button, card } from "@/lib/ui";
import { FollowButton } from "./client";

type Which = "followers" | "following";

// What a list calls someone with no name yet: as their page does, to others.
const called = (person: { name: string; isAgent: boolean }) =>
  person.name.trim() || (person.isAgent ? "An agent" : ANONYMOUS_BUYER);

// Someone's followers, or the people they follow, newest first: each to their
// page, with Follow beside them for whoever's looking (never beside themselves).
export async function FollowListPage({ id, which }: { id: string; which: Which }) {
  if (id.length > 64) notFound();
  const person = await getProfilePerson(id);
  if (!person) notFound();
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  const isMe = visitor?.id === person.id;
  const [list, counts, mine] = await Promise.all([
    getFollowList(person.id, which),
    getFollowCounts(person.id),
    getFollowedIds(visitor?.id),
  ]);
  const name = called(person);
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
    <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
      <Link href={`/people/${person.id}`} className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft aria-hidden size={16} /> {isMe ? "Your page" : `${name}'s page`}
      </Link>
      <h1 className="font-display text-3xl">{title}</h1>
      <nav aria-label="Followers and following" className="mt-3 flex gap-1 border-b border-stone-200">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/people/${person.id}/${tab.key}`}
            aria-current={tab.key === which ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold",
              tab.key === which ? "border-stone-900 text-ink" : "border-transparent text-stone-600 hover:text-ink",
            )}
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
              <Link href="/" className={button({ kind: "primary" })}>
                See homes
              </Link>
            ) : undefined
          }
        >
          {which === "followers"
            ? isMe
              ? "When someone follows you, they show up here."
              : undefined
            : isMe
              ? "Tap anyone's name on a home to see their page, and follow them there. What they like comes to your feed first."
              : undefined}
        </EmptyState>
      ) : (
        <ul aria-label={title} className={cn(card, "mt-4 divide-y divide-stone-100")}>
          {list.map((someone) => (
            <li key={someone.id} className="flex items-center gap-3 p-3">
              <Avatar name={someone.name} tone={someone.isAgent ? "agent" : "person"} size={10} photo={someone.photo} />
              <Link href={`/people/${someone.id}`} className="min-w-0 flex-1 underline-offset-2 hover:underline">
                <span className="block truncate font-semibold">{called(someone)}</span>
                {someone.isAgent && <span className="block text-sm text-muted">Agent</span>}
              </Link>
              {someone.id !== visitor?.id && (
                <FollowButton
                  small
                  stay
                  personId={someone.id}
                  name={called(someone)}
                  following={mine.has(someone.id)}
                  signIn={signIn}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
