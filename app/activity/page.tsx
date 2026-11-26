import { Bell, DoorOpen, Eye, Heart, Lock, MessageCircle, Reply, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { sql } from "@/lib/db";
import { readDevice } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";
import { button, card, groupLabel, pageColumn, pageTitle } from "@/lib/ui";
import { FollowBack } from "./follow-back";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "Notifications · Porchcard" };

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
  client_open: <Eye size={11} strokeWidth={2.5} className="text-brand" />,
  client_comment: <MessageCircle size={11} strokeWidth={2.5} className="text-brand" />,
  client_like: <Heart size={11} strokeWidth={2.5} className="fill-rose-600 text-rose-600" />,
  client_ask: <DoorOpen size={11} strokeWidth={2.5} className="text-amber-700" />,
};

// What an agent's line about a client is headed, as relationOf says it.
const CLIENT = "Your client";

// Lines that open a home over this page, which stays where it was beneath.
const OVER_THE_PAGE = new Set<ActivityKind>(["reply", "comment_like", "comment", "like_reply"]);

// Everything that concerns you, newest first under "Today", "This week" and
// "Earlier": each line the person, what they did, and the home it was on, and
// each going straight to it: the comment, the home, the link, the person. An
// agent's clients' lines are theirs alone to see, which the page says once,
// under its heading, rather than on every one of them.
export default async function ActivityPage() {
  const [account, device, viewAs] = await Promise.all([getCurrentUser(), readDevice(), getViewAs()]);
  const { visitor } = await getPublicIdentity(account, device);
  // Nobody's activity to show: sign in, then back here.
  if (!account && !visitor) redirect("/login?next=/activity");
  const rows = visitor ? await getActivityRows(visitor.id) : [];
  // Who among the people on these lines is an agent: only they are "Your
  // agent" (a friend who sent homes isn't), and only an agent has clients.
  const senders = [...new Set(rows.flatMap((row) => row.people.flatMap((person) => (person.profileId ? [person.profileId] : []))))];
  const agents = new Set(
    senders.length
      ? (
          await sql<{ id: string }[]>`
            select v.id from visitors v join accounts a on a.id = v.account_id
            where a.role = 'agent' and v.id in ${sql(senders)}`
        ).map((row) => row.id)
      : [],
  );
  const relationFor = (row: ActivityRow) => {
    const said = relationOf(row.kind);
    if (said === CLIENT) return account?.role === "agent" ? said : null;
    if (said === "Your agent") return row.people.some((person) => person.profileId && agents.has(person.profileId)) ? said : null;
    return said;
  };
  const sections = ACTIVITY_SECTIONS.map((title) => ({
    title,
    rows: rows.filter((row) => activitySection(row.at) === title),
  })).filter((section) => section.rows.length > 0);
  const clientLines = rows.some((row) => relationFor(row) === CLIENT);

  return (
    <main className={pageColumn()}>
      <h1 className={pageTitle}>Notifications</h1>
      {/* What the lock on each client's line means, said once for them all. */}
      {clientLines && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Lock aria-hidden size={13} className="shrink-0" />
          Only you see what your clients do.
        </p>
      )}
      {/* Looking as someone else leaves what's new to them as it was. */}
      {visitor && !viewAs && <MarkSeen />}
      {rows.length === 0 ? (
        // An agent's lines are what their clients do on homes they send, so
        // the way on is sending some; anyone else's, replies and likes on
        // homes they find.
        account?.role === "agent" ? (
          <EmptyState
            icon={Bell}
            title="Nothing yet"
            className="mt-6"
            action={
              <Link href="/send?aud=someone" className={button({ kind: "primary" })}>
                Send homes
              </Link>
            }
          >
            When clients open, like or comment on homes you send, you&apos;ll see it here.
          </EmptyState>
        ) : (
          <EmptyState
            icon={Bell}
            title="Nothing yet"
            className="mt-6"
            action={
              <Link href="/search" className={button({ kind: "primary" })}>
                Search homes
              </Link>
            }
          >
            Replies and likes show up here.
          </EmptyState>
        )
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {sections.map((section) => {
            const id = sectionId(section.title);
            return (
              <section key={section.title} aria-labelledby={id}>
                <h2 id={id} className={groupLabel}>
                  {section.title}
                </h2>
                {/* One card a group, its lines divided by a hairline. */}
                <ul className={cn(card, "mt-2 divide-y divide-stone-100 overflow-hidden")}>
                  {section.rows.map((row) => (
                    <Row key={row.id} row={row} relation={relationFor(row)} />
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
function Row({ row, relation }: { row: ActivityRow; relation: string | null }) {
  const { people: named, others } = whoOf(row.people);
  const first = row.people[0];
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
      // New: a tint of the brand's colour (and its time in it, after a dot).
      className={cn(
        "relative flex items-start gap-3 px-3 py-3 transition-colors sm:px-4",
        row.unread ? "bg-brand/[0.06] hover:bg-brand/10" : "hover:bg-stone-50",
      )}
    >
      {/* (Its focus ring inside the line, so the card's edge doesn't cut it.) */}
      <Link
        href={row.href}
        scroll={OVER_THE_PAGE.has(row.kind) ? false : undefined}
        aria-label={said}
        className="absolute inset-0 z-10 focus-visible:outline-offset-[-2px]"
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
          // Between you and your client (or your agent): nobody else sees this
          // line. A client's says so with the lock alone, its words said once
          // under the page's heading (and here for a screen reader).
          <span className="mb-0.5 block text-xs text-muted">
            <span className="font-semibold text-stone-700">{relation}</span>
            {relation !== CLIENT && " ·"} <Lock aria-hidden size={11} className="-mt-0.5 inline" />
            <span className={relation === CLIENT ? "sr-only" : undefined}> Only you see this</span>
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
          {/* When, at the end of the line, as a post's time is. */}
          <span className="whitespace-nowrap text-meta text-muted">
            {" "}
            <span aria-hidden>·</span>{" "}
            {row.unread && <span aria-hidden className="mb-px mr-1 inline-block size-2 rounded-full bg-brand align-middle" />}
            <time dateTime={row.at} className={cn(row.unread && "font-semibold text-brand")}>
              {timeAgo(row.at)}
            </time>
          </span>
        </span>
        {quote && <span className="mt-0.5 block truncate text-sm text-stone-700">{quote}</span>}
      </span>
      {followBack ? (
        <FollowBack personId={followBack} name={first.name} />
      ) : (
        row.photo && <HomeThumb src={row.photo.url} sizes="48px" className="size-12" />
      )}
    </li>
  );
}
