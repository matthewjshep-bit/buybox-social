import { ArrowLeft, Heart, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { updatePerson, deleteLead } from "@/app/admin/actions";
import { ConfirmAction, PersonForm } from "@/components/admin";
import { Card, ContactLinks, Empty, StatusBadge, when } from "@/components/admin-ui";
import { Avatar, HomeThumb } from "@/components/ui";
import { getPerson } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  await requireAdmin();
  const person = await getPerson((await params).id);
  return { title: `${person?.name || "Person"} · Admin` };
}

export default async function AdminPerson({ params }: Props) {
  await connection();
  await requireAdmin();
  const person = await getPerson((await params).id);
  if (!person) notFound();
  const neverSignedIn = person.accountId === null;

  return (
    <>
      <Link href="/admin/people" className="mb-2 flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft aria-hidden size={16} /> People
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={person.name || person.email} tone={person.status === "agent" ? "agent" : "person"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl">{person.name || "No name yet"}</h1>
            <StatusBadge status={person.status} />
          </div>
          <p className="mt-1 text-muted">
            {person.email}
            {person.phone && ` · ${person.phone}`}
            {person.brokerage && ` · ${person.brokerage}`}
          </p>
          <p className="mt-1 text-sm text-muted">
            {person.leadAt && `Left their details ${when(person.leadAt)}`}
            {person.leadAt && person.joinedAt && " · "}
            {person.joinedAt && `Account since ${when(person.joinedAt)}`}
            {neverSignedIn && " · Hasn't opened their sign-in link"}
          </p>
          <div className="mt-3">
            <ContactLinks name={person.name} phone={person.phone} email={person.email} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {person.status === "agent" && (
            <Card title={`Links sent (${person.links.length})`}>
              {person.links.length === 0 ? (
                <Empty>No links sent yet.</Empty>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {person.links.map((link) => (
                    <li key={link.id} className="py-3">
                      <p className="font-medium">
                        {link.people.length > 0 ? link.people.join(", ") : link.client_name || "Unnamed client"}
                        <span className="font-normal text-stone-500"> · {timeAgo(link.created_at.toISOString())}</span>
                      </p>
                      <p className="truncate text-sm text-muted">{link.addresses.join(" · ") || "No homes left on it"}</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {link.reactions} {link.reactions === 1 ? "reaction" : "reactions"} · {link.comments}{" "}
                        {link.comments === 1 ? "comment" : "comments"} (private)
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title={`Homes they reacted to (${person.homes.length})`}>
            {person.homes.length === 0 ? (
              <Empty>{neverSignedIn ? "They haven't signed in yet." : "No likes or passes yet."}</Empty>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {person.homes.map((home) => (
                  <li key={home.listing_key}>
                    <Link
                      href={`/admin/homes/${encodeURIComponent(home.listing_key)}`}
                      className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-stone-50"
                    >
                      <HomeThumb src={home.data.Media[0]?.MediaURL} sizes="48px" className="size-12" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{home.data.UnparsedAddress}</p>
                        <p
                          className={cn(
                            "flex items-center gap-1 text-xs font-semibold",
                            home.reaction === "like" ? "text-rose-700" : "text-amber-800",
                          )}
                        >
                          {home.reaction === "like" ? (
                            <Heart aria-hidden size={12} className="fill-current" />
                          ) : (
                            <ThumbsDown aria-hidden size={12} />
                          )}
                          {home.reaction === "like" ? "Liked" : "Passed"}
                          <span className="font-normal text-stone-500"> · {timeAgo(home.at.toISOString())}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Public comments (${person.comments.length})`}>
            {person.comments.length === 0 ? (
              <Empty>No public comments yet.</Empty>
            ) : (
              <ul className="divide-y divide-stone-100">
                {person.comments.map((comment) => (
                  <li key={comment.id} className="py-2.5">
                    <p className="text-sm text-stone-500">
                      On{" "}
                      <Link
                        href={`/admin/homes/${encodeURIComponent(comment.listing_key)}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {comment.address}
                      </Link>{" "}
                      · {timeAgo(comment.at.toISOString())}
                    </p>
                    <p className="mt-0.5 text-sm">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Details">
            <PersonForm
              action={updatePerson.bind(null, person.id)}
              name={person.name}
              phone={person.phone}
              role={neverSignedIn ? undefined : person.status === "lead" ? null : person.status}
            />
          </Card>
          {neverSignedIn && (
            <Card title="Remove">
              <p className="mb-3 text-sm text-muted">
                Spam, or asked to be removed? They never signed in, so there&apos;s nothing else of theirs to lose.
              </p>
              <ConfirmAction action={deleteLead.bind(null, person.id)} label="Delete this lead" confirm="Delete lead" className="-ml-4" />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
