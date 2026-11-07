import { Bell, Heart, MessageCircle, Reply } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import {
  ACTIVITY_SECTIONS,
  activitySection,
  describeActivity,
  getActivityRows,
  quoteOf,
  sectionId,
  whoOf,
  type ActivityRow,
} from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "Activity · BuyBox Social" };

// What happened, as a small badge on the person: a rose heart for a like, as
// everywhere else.
const BADGE = {
  comment_like: <Heart size={11} strokeWidth={2.5} className="fill-rose-600 text-rose-600" />,
  reply: <Reply size={12} strokeWidth={2.5} className="text-brand" />,
  comment: <MessageCircle size={11} strokeWidth={2.5} className="text-brand" />,
};

// Who's been answering you and liking what you said, newest first under
// "Today", "This week" and "Earlier": each line the person, what they did,
// and the home it was on.
export default async function ActivityPage() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account, device);
  const rows = visitor ? await getActivityRows(visitor.id) : [];
  const sections = ACTIVITY_SECTIONS.map((title) => ({
    title,
    rows: rows.filter((row) => activitySection(row.at) === title),
  })).filter((section) => section.rows.length > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="font-display text-3xl">Activity</h1>
      {visitor && <MarkSeen />}
      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          <Bell aria-hidden size={28} className="mx-auto text-stone-500" />
          <p className="mt-2 text-[17px] font-semibold text-ink">Nothing yet</p>
          <p className="mt-1 text-[15px] text-stone-700">
            When people reply to you or like your comments, it shows up here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white"
          >
            See homes
          </Link>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-6">
          {sections.map((section) => {
            const id = sectionId(section.title);
            return (
              <section key={section.title} aria-labelledby={id}>
                <h2 id={id} className="px-1 pt-2 text-[15px] font-semibold text-stone-600">
                  {section.title}
                </h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {section.rows.map((row) => (
                    <Row key={row.id} row={row} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Row({ row }: { row: ActivityRow }) {
  const { names, others } = whoOf(row.people);
  const who = others ? [...names, others] : names;
  return (
    <li>
      <Link
        href={`/homes/${encodeURIComponent(row.listingKey)}${row.photo ? `?photo=${row.photo.index}` : ""}`}
        scroll={false}
        className={cn(
          "flex items-center gap-3 rounded-2xl p-3 ring-1 transition-colors",
          row.unread ? "bg-white ring-brand/40" : "bg-white/60 ring-stone-200 hover:bg-white",
        )}
      >
        {/* The newest of them, with what they did. */}
        <span aria-hidden className="relative shrink-0 self-start">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
            {row.people[0].name[0]?.toUpperCase()}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)]">
            {BADGE[row.kind]}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug text-ink">
            {who.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && (i === who.length - 1 ? " and " : ", ")}
                <span className="font-semibold">{part}</span>
              </Fragment>
            ))}{" "}
            {describeActivity(row)}
            {row.unread && <span className="sr-only"> (new)</span>}
          </span>
          <span className="mt-0.5 block truncate text-sm text-stone-700">{quoteOf(row)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-stone-600">
            {row.unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand" />}
            <time dateTime={row.at} className={cn(row.unread && "font-semibold text-brand")}>
              {timeAgo(row.at)}
            </time>
          </span>
        </span>
        {row.photo && (
          <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-stone-100">
            <Image src={row.photo.url} alt="" fill sizes="48px" className="object-cover" />
          </span>
        )}
      </Link>
    </li>
  );
}
