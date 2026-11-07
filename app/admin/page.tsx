import Link from "next/link";
import { connection } from "next/server";
import { Card, ContactLinks, Empty, PageTitle, Stat } from "@/components/admin-ui";
import { Avatar, HomeThumb } from "@/components/ui";
import { getOverview } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { formatPrice, timeAgo } from "@/lib/format";

export const metadata = { title: "Overview · Admin" };

export default async function AdminOverview() {
  await connection();
  await requireAdmin();
  const { counts, followUps, comments, hot } = await getOverview();

  return (
    <>
      <PageTitle title="Overview">This week on BuyBox Social, and who to get back to.</PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sign-ups this week"
          value={counts.leads_week}
          note={`${counts.open_leads} haven't opened their sign-in link`}
          href="/admin/people?status=lead"
        />
        <Stat label="Buyers" value={counts.buyers} href="/admin/people?status=buyer" />
        <Stat label="Agents" value={counts.agents} href="/admin/people?status=agent" />
        <Stat label="Homes for sale" value={counts.active_homes} note={`${counts.homes} in all`} href="/admin/homes" />
        <Stat label="Likes this week" value={counts.likes_week} />
        <Stat label="Comments this week" value={counts.comments_week} href="/admin/comments" />
        <Stat label="Links agents sent this week" value={counts.links_week} />
        <Stat label="Homes viewed this week" value={counts.views_week} note="Once per home, per device" />
      </div>

      <Card
        title="Follow up"
        className="mt-6"
        action={
          // (Over the top edge of the line under it, so its whole 44px is the link.)
          <Link
            href="/admin/people?status=lead"
            className="relative -my-3 -mr-2 flex min-h-11 items-center px-2 text-sm font-semibold text-brand hover:underline"
          >
            All leads
          </Link>
        }
      >
        <p className="-mt-1 mb-3 text-sm text-muted">
          Everyone who signed up on the home page in the last 30 days, newest first.
        </p>
        {followUps.length === 0 ? (
          <Empty>No new sign-ups to follow up with.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {followUps.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <Avatar name={lead.name} />
                {/* Who they are keeps room to be read; on a phone, Call, Text
                    and Email go on their own line under the name. */}
                <div className="min-w-0 grow basis-48">
                  <Link href={`/admin/people/${lead.id}`} className="font-semibold hover:underline">
                    {lead.name}
                  </Link>
                  <p className="truncate text-sm text-muted">
                    {lead.phone} · {lead.email}
                  </p>
                  <p className="text-xs text-stone-500">
                    {timeAgo(lead.at.toISOString())} ·{" "}
                    {lead.signed_in ? "Signed in" : "Hasn't opened their sign-in link"}
                  </p>
                </div>
                <div className="w-full pl-13 sm:w-auto sm:pl-0">
                  <ContactLinks name={lead.name} phone={lead.phone} email={lead.email} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* One column on a phone, as wide as the screen and no wider: long
          addresses truncate inside their card. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Busiest homes this week">
          {hot.length === 0 ? (
            <Empty>No likes or comments this week yet.</Empty>
          ) : (
            <ol className="divide-y divide-stone-100">
              {hot.map((home) => (
                <li key={home.listing_key}>
                  <Link
                    href={`/admin/homes/${encodeURIComponent(home.listing_key)}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-stone-50"
                  >
                    <HomeThumb src={home.data.Media[0]?.MediaURL} sizes="48px" className="size-12" />
                    {/* On a phone the count goes under the price, so the
                        address keeps its room. */}
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                      <div className="min-w-0 sm:flex-1">
                        <p className="truncate font-medium">{home.data.UnparsedAddress}</p>
                        <p className="text-sm text-muted">
                          <span className="font-display text-base text-ink">{formatPrice(home.data.ListPrice)}</span> · {home.data.City}
                        </p>
                      </div>
                      <p className="text-sm tabular-nums text-muted sm:shrink-0">
                        {home.n} {home.n === 1 ? "like or comment" : "likes and comments"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title="Latest comments"
          action={
            <Link href="/admin/comments" className="-my-3 -mr-2 flex min-h-11 items-center px-2 text-sm font-semibold text-brand hover:underline">
              All comments
            </Link>
          }
        >
          {comments.length === 0 ? (
            <Empty>No comments yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {comments.map((comment) => (
                <li key={comment.id} className="py-2.5">
                  <p className="text-sm">
                    <span className="font-semibold">{comment.name}</span>
                    <span className="text-stone-500"> on </span>
                    <Link
                      href={`/admin/homes/${encodeURIComponent(comment.listing_key)}`}
                      className="font-medium hover:underline"
                    >
                      {comment.address}
                    </Link>
                    <span className="text-stone-500"> · {timeAgo(comment.at.toISOString())}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-stone-700">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
