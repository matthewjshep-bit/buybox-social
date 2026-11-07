import { Download, Heart, Link2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import {
  Avatar,
  Chips,
  Empty,
  hrefWith,
  PageTitle,
  pageParam,
  Pager,
  SearchBox,
  StatusBadge,
  when,
} from "@/components/admin-ui";
import { countPeople, listPeople, STATUSES, type PersonStatus } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "People · Admin" };

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

const FILTERS: { status?: PersonStatus; label: string }[] = [
  { label: "Everyone" },
  { status: "lead", label: "Leads" },
  { status: "buyer", label: "Buyers" },
  { status: "agent", label: "Agents" },
];

export default async function AdminPeople({ searchParams }: Props) {
  await connection();
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const status = STATUSES.find((s) => s === params.status);
  const page = pageParam(params.page);
  const [{ rows, total }, counts] = await Promise.all([listPeople({ q, status, page }), countPeople()]);

  return (
    <>
      <PageTitle
        title="People"
        actions={
          <a
            href={hrefWith("/admin/people/export", { status, q })}
            download
            className="flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-stone-300 hover:ring-stone-500"
          >
            <Download aria-hidden size={16} /> Download CSV
          </a>
        }
      >
        Leads left their details on the home page but haven&apos;t opened their sign-in link yet.
      </PageTitle>

      <div className="flex flex-col gap-3">
        <Chips
          label="Show"
          items={FILTERS.map((filter) => ({
            href: hrefWith("/admin/people", { status: filter.status, q }),
            label: filter.label,
            current: filter.status === status,
            count: filter.status ? counts[filter.status] : counts.all,
          }))}
        />
        <SearchBox q={q} placeholder="Search by name, email or phone" keep={{ status }} />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_5.5rem_minmax(0,1.3fr)_minmax(0,1fr)] gap-4 border-b border-stone-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid"
        >
          <span>Person</span>
          <span>Phone</span>
          <span>Type</span>
          <span>Activity</span>
          <span>Since</span>
        </div>
        {rows.length === 0 ? (
          <Empty>{q ? `No one matches “${q}”.` : "No one here yet."}</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/admin/people/${person.id}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-stone-50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_5.5rem_minmax(0,1.3fr)_minmax(0,1fr)] md:gap-4"
                >
                  <span className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                    <Avatar name={person.name || person.email} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{person.name || "No name yet"}</span>
                      <span className="block truncate text-sm text-stone-600">{person.email}</span>
                    </span>
                  </span>
                  <span className="col-start-3 row-start-1 md:col-auto md:row-auto md:order-none">
                    <span className="md:hidden">
                      <StatusBadge status={person.status} />
                    </span>
                    <span className="hidden truncate text-sm tabular-nums text-stone-700 md:inline">
                      {person.phone || "—"}
                    </span>
                  </span>
                  <span className="hidden md:block">
                    <StatusBadge status={person.status} />
                  </span>
                  <span className="col-span-3 flex flex-wrap items-center gap-3 pl-12 text-sm text-stone-600 md:col-span-1 md:pl-0">
                    {person.phone && <span className="md:hidden">{person.phone}</span>}
                    <span className="flex items-center gap-1" title="Homes liked">
                      <Heart aria-hidden size={14} className="text-rose-600" /> {person.likes}
                      <span className="sr-only">homes liked,</span>
                    </span>
                    <span className="flex items-center gap-1" title="Comments">
                      <MessageCircle aria-hidden size={14} /> {person.comments}
                      <span className="sr-only">comments</span>
                    </span>
                    {person.status === "agent" && (
                      <span className="flex items-center gap-1" title="Links sent">
                        <Link2 aria-hidden size={14} /> {person.links}
                        <span className="sr-only">links sent</span>
                      </span>
                    )}
                  </span>
                  <span className="col-span-3 pl-12 text-xs text-stone-500 md:col-span-1 md:pl-0 md:text-sm">
                    {when(person.since)}
                    {person.last_active && (
                      <span className="block text-xs">Active {timeAgo(person.last_active.toISOString())}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pager page={page} total={total} href={(p) => hrefWith("/admin/people", { status, q, page: p })} />
    </>
  );
}
