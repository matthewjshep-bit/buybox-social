import { Eye, Heart, MessageCircle, Send, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Chips, Empty, hrefWith, PageTitle, pageParam, Pager, SearchBox } from "@/components/admin-ui";
import { HOME_SORTS, homeStatuses, listHomes, type HomeSort } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { cn, formatPrice } from "@/lib/format";

export const metadata = { title: "Homes · Admin" };

type Props = { searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }> };

export default async function AdminHomes({ searchParams }: Props) {
  await connection();
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const sort: HomeSort = params.sort && params.sort in HOME_SORTS ? (params.sort as HomeSort) : "liked";
  const statuses = await homeStatuses();
  const status = statuses.find((s) => s.status === params.status)?.status;
  const page = pageParam(params.page);
  const { rows, total } = await listHomes({ q, status, sort, page });
  const all = statuses.reduce((sum, s) => sum + s.n, 0);
  const link = (changes: Record<string, string | number | undefined>) =>
    hrefWith("/admin/homes", { q, status, sort: sort === "liked" ? undefined : sort, ...changes });

  return (
    <>
      <PageTitle title="Homes">Every listing on the site, and how people are taking to it.</PageTitle>

      <div className="flex flex-col gap-3">
        <SearchBox q={q} placeholder="Search by address, city or ZIP" keep={{ status, sort: sort === "liked" ? undefined : sort }} />
        <Chips
          label="Status"
          items={[
            { href: link({ status: undefined, page: undefined }), label: "All", current: !status, count: all },
            ...statuses.map((s) => ({
              href: link({ status: s.status, page: undefined }),
              label: s.status,
              current: s.status === status,
              count: s.n,
            })),
          ]}
        />
        <Chips
          label="Sort by"
          items={Object.entries(HOME_SORTS).map(([key, value]) => ({
            href: link({ sort: key === "liked" ? undefined : key, page: undefined }),
            label: value.label,
            current: key === sort,
          }))}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {rows.length === 0 ? (
          <Empty>{q ? `No homes match “${q}”.` : "No homes here."}</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(({ listing, status: homeStatus, publicTotals, privateTotals, buzz }) => (
              <li key={listing.ListingKey}>
                <Link
                  href={`/admin/homes/${encodeURIComponent(listing.ListingKey)}`}
                  className="flex items-center gap-3 px-3 py-3 hover:bg-stone-50 sm:gap-4 sm:px-4"
                >
                  <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                    {listing.Media[0] && (
                      <Image src={listing.Media[0].MediaURL} alt="" fill sizes="80px" className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate font-semibold">{listing.UnparsedAddress}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          homeStatus === "Active" ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700",
                        )}
                      >
                        {homeStatus}
                      </span>
                    </p>
                    <p className="truncate text-sm text-stone-600">
                      {formatPrice(listing.ListPrice)} · {listing.BedroomsTotal} bd · {listing.BathroomsTotalInteger} ba ·{" "}
                      {listing.LivingArea.toLocaleString("en-US")} sq ft · {listing.City}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-stone-600">
                      <span className="flex items-center gap-1" title="Likes">
                        <Heart aria-hidden size={14} /> {publicTotals.likes + privateTotals.likes}
                        <span className="sr-only">likes,</span>
                      </span>
                      <span className="flex items-center gap-1" title="Passes">
                        <ThumbsDown aria-hidden size={14} /> {publicTotals.dislikes + privateTotals.dislikes}
                        <span className="sr-only">passes,</span>
                      </span>
                      <span className="flex items-center gap-1" title="Comments">
                        <MessageCircle aria-hidden size={14} /> {publicTotals.comments + privateTotals.comments}
                        <span className="sr-only">comments,</span>
                      </span>
                      <span className="flex items-center gap-1" title="Views">
                        <Eye aria-hidden size={14} /> {buzz.views}
                        <span className="sr-only">views,</span>
                      </span>
                      <span className="flex items-center gap-1" title="Sent by agents">
                        <Send aria-hidden size={14} /> {buzz.sends}
                        <span className="sr-only">times sent by agents</span>
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pager page={page} total={total} href={(p) => link({ page: p })} />
    </>
  );
}
