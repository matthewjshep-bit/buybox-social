import { Bell, Heart, MessageCircle, Reply } from "lucide-react";
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
import { Avatar, EmptyState, HomeThumb } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";
import { button, card } from "@/lib/ui";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "Activity · BuyBox Social" };

// What happened, as a small badge on the person: a rose heart for a like, as
// everywhere else.
const BADGE = {
  comment_like: <Heart size={11} strokeWidth={2.5} className="fill-rose-600 text-rose-600" />,
  reply: <Reply size={12} strokeWidth={2.5} className="text-brand" />,
  like_reply: <Reply size={12} strokeWidth={2.5} className="text-brand" />,
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
        <EmptyState
          icon={Bell}
          title="Nothing yet"
          className="mt-6"
          action={
            <Link href="/" className={button({ kind: "primary" })}>
              See homes
            </Link>
          }
        >
          When people reply to you or like your comments, it shows up here.
        </EmptyState>
      ) : (
        <div className="mt-2 flex flex-col gap-6">
          {sections.map((section) => {
            const id = sectionId(section.title);
            return (
              <section key={section.title} aria-labelledby={id}>
                <h2 id={id} className="px-1 pt-2 text-body font-semibold text-muted">
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
        data-unread={row.unread ? "" : undefined}
        // New: edged in the brand's colour. Seen: it sits back a little.
        className={cn(
          card,
          "flex items-center gap-3 p-3 transition-colors data-unread:ring-brand/40 not-data-unread:bg-white/60 hover:bg-white",
        )}
      >
        {/* The newest of them, with what they did. */}
        <Avatar name={row.people[0].name} size={10} badge={BADGE[row.kind]} className="self-start" />
        <span className="min-w-0 flex-1">
          <span className="block text-body leading-snug text-ink">
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
          <span className="mt-0.5 flex items-center gap-1.5 text-meta text-muted">
            {row.unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand" />}
            <time dateTime={row.at} className={cn(row.unread && "font-semibold text-brand")}>
              {timeAgo(row.at)}
            </time>
          </span>
        </span>
        {row.photo && <HomeThumb src={row.photo.url} sizes="48px" className="size-12" />}
      </Link>
    </li>
  );
}
