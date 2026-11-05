import { ArrowLeft, ExternalLink, Heart, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CommentList } from "@/components/admin-comments";
import { AspectSummary } from "@/components/aspect-summary";
import { Card, Empty, Stat } from "@/components/admin-ui";
import { getHome } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { aspectLabel } from "@/lib/reactions";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props) {
  await requireAdmin();
  const home = await getHome(decodeURIComponent((await params).key));
  return { title: `${home?.listing.UnparsedAddress ?? "Home"} · Admin` };
}

export default async function AdminHome({ params }: Props) {
  await connection();
  await requireAdmin();
  const key = decodeURIComponent((await params).key);
  const home = await getHome(key);
  if (!home) notFound();
  const { listing, publicTotals, privateTotals, buzz } = home;
  const photos = [...listing.Media].sort((a, b) => a.Order - b.Order);

  return (
    <>
      <Link href="/admin/homes" className="mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-ink">
        <ArrowLeft aria-hidden size={16} /> Homes
      </Link>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-2xl bg-stone-200 sm:w-72">
          {photos[0] && <Image src={photos[0].MediaURL} alt="" fill sizes="(max-width: 640px) 100vw, 288px" className="object-cover" priority />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-500">
            {home.status} · {listing.ListingId}
          </p>
          <h1 className="font-display text-3xl">{listing.UnparsedAddress}</h1>
          <p className="text-stone-600">
            {listing.City}, {listing.StateOrProvince} {listing.PostalCode}
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{formatPrice(listing.ListPrice)}</p>
          <p className="text-sm text-stone-600">
            {listing.BedroomsTotal} beds · {listing.BathroomsTotalInteger} baths · {listing.LivingArea.toLocaleString("en-US")} sq ft
            {listing.YearBuilt && ` · Built ${listing.YearBuilt}`}
          </p>
          {listing.ListAgentFullName && (
            <p className="mt-1 text-sm text-stone-500">
              Listed by {listing.ListAgentFullName}
              {listing.ListOfficeName && `, ${listing.ListOfficeName}`}
            </p>
          )}
          <Link
            href={`/homes/${encodeURIComponent(listing.ListingKey)}`}
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1 ring-stone-300 hover:bg-white"
          >
            <ExternalLink aria-hidden size={15} /> See it on the site
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Likes" value={publicTotals.likes + privateTotals.likes} note={`${privateTotals.likes} on agents' links`} />
        <Stat label="Passes" value={publicTotals.dislikes + privateTotals.dislikes} note={`${privateTotals.dislikes} on agents' links`} />
        <Stat label="Comments" value={publicTotals.comments + privateTotals.comments} note={`${privateTotals.comments} in private chats`} />
        <Stat label="Views" value={buzz.views} note="Once per device" />
        <Stat label="Sent by agents" value={buzz.sends} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="What people say about it">
          <AspectSummary liked={home.aspects.liked} disliked={home.aspects.disliked} />
          {Object.keys(home.aspects.liked).length === 0 && Object.keys(home.aspects.disliked).length === 0 && (
            <Empty>Nothing singled out yet.</Empty>
          )}
        </Card>

        <Card title={`Agents who sent it (${home.links.length})`}>
          {home.links.length === 0 ? (
            <Empty>No agent has sent it yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {home.links.map((link) => (
                <li key={link.id} className="py-2.5 text-sm">
                  <p>
                    <Link href={`/admin/people/${link.agent_id}`} className="font-semibold hover:underline">
                      {link.agent_name}
                    </Link>
                    <span className="text-stone-600"> to {link.client_name || "a client"}</span>
                    <span className="text-stone-500"> · {timeAgo(link.created_at.toISOString())}</span>
                    {link.removed && <span className="text-stone-500"> · since taken off the link</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {link.likes} liked · {link.passes} passed · {link.comments} {link.comments === 1 ? "comment" : "comments"} (private)
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Liked or passed on in public (${home.people.length})`} className="mt-6">
        {home.people.length === 0 ? (
          <Empty>No one yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {home.people.map((person, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span
                  className={cn(
                    "flex items-center gap-1 font-semibold",
                    person.reaction === "like" ? "text-rose-700" : "text-amber-800",
                  )}
                >
                  {person.reaction === "like" ? (
                    <Heart aria-hidden size={13} className="fill-current" />
                  ) : (
                    <ThumbsDown aria-hidden size={13} />
                  )}
                  {person.reaction === "like" ? "Liked" : "Passed"}
                </span>
                {person.accountId ? (
                  <Link href={`/admin/people/${person.accountId}`} className="font-medium hover:underline">
                    {person.name}
                  </Link>
                ) : (
                  <span className="font-medium">
                    {person.name} <span className="font-normal text-stone-500">(guest)</span>
                  </span>
                )}
                {[...person.liked, ...person.disliked].length > 0 && (
                  <span className="text-stone-600">
                    {person.liked.map((a) => `+ ${aspectLabel(a)}`).concat(person.disliked.map((a) => `– ${aspectLabel(a)}`)).join(", ")}
                  </span>
                )}
                <span className="ml-auto text-xs text-stone-500">{timeAgo(person.at.toISOString())}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Comments in public (${home.comments.length})`} className="mt-6">
        <CommentList comments={home.comments} showHome={false} />
      </Card>
    </>
  );
}
