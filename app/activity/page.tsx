import { Bell, DoorOpen, Heart, MessageCircle, Reply, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  ACTIVITY_SECTIONS,
  activitySection,
  describeActivity,
  getActivityRows,
  quoteOf,
  relationOf,
  sectionId,
  whoOf,
  type ActivityKind,
  type ActivityRow,
} from "@/lib/activity";
import { Avatar, EmptyState, HomeThumb } from "@/components/ui";
import { getCurrentUser, getViewAs } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";
import { button, card } from "@/lib/ui";
import { FollowBack } from "./follow-back";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "Activity · Porchcard" };

// What happened, as a small badge on the person: a rose heart for a like, as
// everywhere else.
const BADGE: Record<ActivityKind, ReactNode> = {
  comment_like: <Heart size={11} strokeWidth={2.5} className="fill-rose-600 text-rose-600" />,
  reply: <Reply size={12} strokeWidth={2.5} className="text-brand" />,
  like_reply: <Reply size={12} strokeWidth={2.5} className="text-brand" />,
  comment: <MessageCircle size={11} strokeWidth={2.5} className="text-brand" />,
  follow: <UserPlus size={11} strokeWidth={2.5} className="text-brand" />,
  link: <Send size={11} strokeWidth={2.5} className="text-brand" />,
  agent_reply: <Reply size={12} strokeWidth={2.5} className="text-brand" />,
  agent_note: <MessageCircle size={11} strokeWidth={2.5} className="text-brand" />,
  client_comment: <MessageCircle size={11} strokeWidth={2.5} className="text-brand" />,
  client_like: <Heart size={11} strokeWidth={2.5} className="fill-rose-600 text-rose-600" />,
  client_ask: <DoorOpen size={11} strokeWidth={2.5} className="text-amber-700" />,
};

// Lines that open a home over this page, which stays where it was beneath.
const OVER_THE_PAGE = new Set<ActivityKind>(["reply", "comment_like", "comment", "like_reply"]);

// Everything that concerns you, newest first under "Today", "This week" and
// "Earlier": each line the person, what they did, and the home it was on, and
// each going straight to it: the comment, the home, the link, the person.
export default async function ActivityPage() {
  const [account, device, viewAs] = await Promise.all([getCurrentUser(), readDevice(), getViewAs()]);
  const { visitor } = await getPublicIdentity(account, device);
  const rows = visitor ? await getActivityRows(visitor.id) : [];
  const sections = ACTIVITY_SECTIONS.map((title) => ({
    title,
    rows: rows.filter((row) => activitySection(row.at) === title),
  })).filter((section) => section.rows.length > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="font-display text-3xl">Activity</h1>
      {/* Looking as someone else leaves what's new to them as it was. */}
      {visitor && !viewAs && <MarkSeen />}
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

// A line: the whole of it goes to what it's about, and above that, each name
// goes to that person's page (and a new follower can be followed back).
function Row({ row }: { row: ActivityRow }) {
  const { people: named, others } = whoOf(row.people);
  const first = row.people[0];
  const relation = relationOf(row.kind);
  const quote = quoteOf(row);
  // The line's link is called by its sentence, names and all. Spelled out as
  // text: named by the sentence's element, the name links would come out
  // with a space before each comma.
  const names = named
    .map((person, i) => (i > 0 ? (i === named.length - 1 && !others ? " and " : ", ") : "") + person.name)
    .join("");
  const said = `${names}${others ? ` and ${others}` : ""} ${describeActivity(row)}${row.unread ? " (new)" : ""}`;
  const followBack = row.kind === "follow" && row.following === false ? first.profileId : null;
  return (
    <li
      data-unread={row.unread ? "" : undefined}
      // New: edged in the brand's colour. Seen: it sits back a little.
      className={cn(
        card,
        "relative flex items-center gap-3 p-3 transition-colors data-unread:ring-brand/40 not-data-unread:bg-white/60 hover:bg-white",
      )}
    >
      <Link
        href={row.href}
        scroll={OVER_THE_PAGE.has(row.kind) ? false : undefined}
        aria-label={said}
        className="absolute inset-0 z-10 rounded-2xl"
      />
      {/* The newest of them, with what they did. */}
      <Avatar
        name={first.name}
        photo={first.photo}
        size={10}
        badge={BADGE[row.kind]}
        href={first.profileId ? `/people/${first.profileId}` : undefined}
        className="self-start"
      />
      <span className="min-w-0 flex-1">
        {relation && (
          // Between you and your client (or your agent): nobody else sees this line.
          <span className="mb-0.5 block text-xs text-muted">
            <span className="font-semibold text-stone-700">{relation}</span> · <span aria-hidden>🔒</span> Only you
            see this
          </span>
        )}
        <span className="block text-body leading-snug text-ink">
          {named.map((person, i) => (
            <Fragment key={person.id}>
              {i > 0 && (i === named.length - 1 && !others ? " and " : ", ")}
              {person.profileId ? (
                <Link
                  href={`/people/${person.profileId}`}
                  className="hit-44 z-20 font-semibold underline-offset-2 hover:underline"
                >
                  {person.name}
                </Link>
              ) : (
                <span className="font-semibold">{person.name}</span>
              )}
            </Fragment>
          ))}
          {others && (
            <>
              {" and "}
              <span className="font-semibold">{others}</span>
            </>
          )}{" "}
          {describeActivity(row)}
          {row.unread && <span className="sr-only"> (new)</span>}
        </span>
        {quote && <span className="mt-0.5 block truncate text-sm text-stone-700">{quote}</span>}
        <span className="mt-0.5 flex items-center gap-1.5 text-meta text-muted">
          {row.unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand" />}
          <time dateTime={row.at} className={cn(row.unread && "font-semibold text-brand")}>
            {timeAgo(row.at)}
          </time>
        </span>
      </span>
      {followBack ? (
        <FollowBack personId={followBack} name={first.name} />
      ) : (
        row.photo && <HomeThumb src={row.photo.url} sizes="48px" className="size-12" />
      )}
    </li>
  );
}
