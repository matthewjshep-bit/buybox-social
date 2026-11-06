import { Heart, Home, MessageCircle, ThumbsDown, X, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { ProfileFeed } from "@/components/profile-feed";
import { ProfileHeader } from "@/components/profile-header";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import {
  getProfileFeed,
  getProfilePerson,
  getProfileSummary,
  isProfileShow,
  isTopicSide,
  parseAbout,
  parseBefore,
  PROFILE_FILTERS,
  type ProfileShow,
  type TasteChip,
  type TopicSide,
} from "@/lib/profile";
import { getPublicIdentity } from "@/lib/public";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const person = id.length > 64 ? null : await getProfilePerson(id);
  if (!person) return { title: "Not found · BuyBox Social" };
  return {
    title: `${person.name} · BuyBox Social`,
    description: `What ${person.name} likes in homes, on BuyBox Social.`,
  };
}

// Someone's page, Facebook-style: who they are and what they keep liking,
// then everything they've done in public, one card per home per day, newest
// first. Filters and paging are plain links, so it all works without scripts.
export default async function ProfilePage({ params, searchParams }: Props) {
  const { id } = await params;
  if (id.length > 64) notFound();
  const person = await getProfilePerson(id);
  if (!person) notFound();
  const query = await searchParams;
  const show: ProfileShow = isProfileShow(query.show) ? query.show : "all";
  const before = parseBefore(query.before);
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  const isMe = visitor?.id === person.id;
  const summary = await getProfileSummary(person.id, isMe);
  // Only a specific, or a thing they've done something with, can be a topic.
  const asked = parseAbout(query.about);
  const label = asked ? summary.topics.get(asked.toLowerCase()) : undefined;
  const about = label ? asked : null;
  const side: TopicSide | null = about && isTopicSide(query.side) ? query.side : null;
  const feed = await getProfileFeed(person.id, { show, about, side, before, mine: isMe });

  // The same page with other filters; paging starts over.
  const href = (next: { show?: ProfileShow; about?: string | null; side?: TopicSide; before?: string | null }) => {
    const params = new URLSearchParams();
    const nextShow = next.show ?? show;
    const nextAbout = next.about === undefined ? about : next.about;
    const nextSide = next.about === undefined ? side : next.side;
    if (nextShow !== "all") params.set("show", nextShow);
    if (nextAbout) params.set("about", nextAbout);
    if (nextAbout && nextSide) params.set("side", nextSide);
    if (next.before) params.set("before", next.before);
    const search = params.toString();
    return `/people/${person.id}${search ? `?${search}` : ""}`;
  };

  const nothingYet = summary.counts.homes === 0 && feed.cards.length === 0 && !before;
  const tasteTitle = isMe ? "Your taste" : `${person.name}'s taste`;
  const chipHref = (key: string, side: TopicSide) => href({ about: key, side });
  const current = about ? { key: about.toLowerCase(), side } : null;

  return (
    <main
      className="mx-auto max-w-xl px-4 pb-16 pt-4 lg:grid lg:max-w-6xl lg:grid-cols-[360px_minmax(0,600px)] lg:items-start lg:justify-center lg:gap-8 lg:px-6 lg:pt-6"
      // Whatever is focused in the feed scrolls clear of the filters stuck above it.
      style={{ "--filters": about ? "8rem" : "5rem" } as CSSProperties}
    >
      {/* On short screens the column scrolls on its own, so nothing in it is out of reach. */}
      <div className="flex flex-col gap-3 *:shrink-0 lg:sticky lg:top-2 lg:-m-1 lg:max-h-[calc(100dvh-1rem)] lg:overflow-y-auto lg:overscroll-contain lg:p-1">
        <ProfileHeader
          name={person.name}
          isMe={isMe}
          since={person.since}
          homes={summary.counts.homes}
          counts={summary.counts}
          cover={summary.cover}
        />
        {(summary.taste.loves.length > 0 || summary.taste.passes.length > 0) && (
          <section aria-label={tasteTitle} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-[13px] font-semibold text-stone-600">{tasteTitle}</h2>
            <TasteRow side="like" chips={summary.taste.loves} current={current} href={chipHref} />
            <TasteRow side="pass" chips={summary.taste.passes} current={current} href={chipHref} />
          </section>
        )}
      </div>

      <div className="mt-3 min-w-0 lg:mt-0">
        {nothingYet ? (
          isMe ? (
            <EmptyState
              icon={Home}
              title="Your page fills up as you go"
              action={
                <Link
                  href="/"
                  className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-white"
                >
                  See homes
                </Link>
              }
            >
              Like homes, tap what you love in their photos and say what you think. It all shows up here.
            </EmptyState>
          ) : (
            <EmptyState icon={Home} title="Nothing to show yet">
              {person.name} hasn&apos;t liked anything yet.
            </EmptyState>
          )
        ) : (
          <>
            {/* Its own edge and background reach past the cards' rings, so nothing shows round it once it sticks. */}
            <nav
              aria-label="Show"
              className="sticky top-0 z-30 -mx-4 bg-surface px-4 py-3 shadow-[0_1px_0_var(--color-stone-200)] lg:-mx-2 lg:-mt-3 lg:px-2"
            >
              {/* One row, even on the narrowest phones. */}
              <ul className="-m-1 flex gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] min-[400px]:gap-2">
                {(Object.keys(PROFILE_FILTERS) as ProfileShow[]).map((key) => (
                  <li key={key} className="shrink-0">
                    <Link
                      href={href({ show: key })}
                      aria-current={show === key ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center rounded-full px-3.5 text-[15px] font-semibold min-[400px]:px-4",
                        show === key ? "bg-ink text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50",
                      )}
                    >
                      {PROFILE_FILTERS[key]}
                    </Link>
                  </li>
                ))}
              </ul>
              {/* A topic from a chip gets a line of its own, so it's never cut off. */}
              {about && label && (
                <div className="mt-2 flex">
                  <Link
                    href={href({ about: null })}
                    aria-label={`Remove ${label}`}
                    className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-full bg-white pl-3.5 pr-3 text-[15px] font-semibold text-ink ring-2 ring-ink"
                  >
                    {side === "like" && <Heart aria-hidden size={14} className="shrink-0 fill-rose-600 text-rose-600" />}
                    {side === "pass" && <ThumbsDown aria-hidden size={14} className="shrink-0 text-amber-700" />}
                    <span className="truncate">{label}</span>
                    <X aria-hidden size={16} className="shrink-0" />
                  </Link>
                </div>
              )}
            </nav>
            {feed.cards.length > 0 || feed.earlier ? (
              <ProfileFeed
                cards={feed.cards}
                name={person.name}
                isMe={isMe}
                earlierHref={feed.earlier ? href({ before: feed.earlier }) : null}
              />
            ) : before ? (
              <EmptyState icon={Home} title="That's everything">
                <Link href={href({})} className="font-semibold text-brand underline-offset-2 hover:underline">
                  Back to the newest
                </Link>
              </EmptyState>
            ) : label ? (
              <EmptyState icon={Home} title={`Nothing here about the ${label.toLowerCase()} yet.`} />
            ) : show === "passed" ? (
              <EmptyState icon={ThumbsDown} title="Nothing passed on yet." />
            ) : show === "comments" ? (
              <EmptyState icon={MessageCircle} title="No comments yet." />
            ) : (
              <EmptyState icon={Heart} title="Nothing liked yet." />
            )}
          </>
        )}
      </div>
    </main>
  );
}

// "Loves Covered porch 3 · Kitchen 5", each one showing just those cards.
function TasteRow({
  side,
  chips,
  current,
  href,
}: {
  side: TopicSide;
  chips: TasteChip[];
  current: { key: string; side: TopicSide | null } | null;
  href: (key: string, side: TopicSide) => string;
}) {
  if (chips.length === 0) return null;
  const like = side === "like";
  const Icon = like ? Heart : ThumbsDown;
  const title = like ? "Loves" : "Passes on";
  return (
    <div role="group" aria-label={title} className="mt-2 flex flex-wrap items-center gap-1.5">
      <span
        aria-hidden
        className={cn("mr-1 flex items-center gap-1 text-[13px] font-semibold", like ? "text-rose-800" : "text-amber-800")}
      >
        <Icon size={14} className={like ? "fill-current" : undefined} />
        {title}
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={href(chip.key, side)}
          aria-label={`${title} ${chip.label}, ${chip.homes} ${chip.homes === 1 ? "home" : "homes"}`}
          aria-current={current?.key === chip.key.toLowerCase() && current.side === side ? "true" : undefined}
          className={cn(
            "relative inline-block rounded-full px-3 py-2 text-[13px] font-semibold leading-5 ring-1 before:absolute before:inset-x-0 before:-inset-y-1",
            like
              ? "bg-rose-50 text-rose-900 ring-rose-200 hover:bg-rose-100 aria-[current]:ring-2 aria-[current]:ring-rose-700"
              : "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100 aria-[current]:ring-2 aria-[current]:ring-amber-700",
          )}
        >
          {chip.label} <span className="tabular-nums">{chip.homes}</span>
        </Link>
      ))}
    </div>
  );
}

// One way to say there's nothing here: an icon, a line, maybe a way on.
// (C3 swaps this for the shared EmptyState in components/ui.tsx.)
function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
      <Icon aria-hidden size={28} className="mx-auto text-stone-500" />
      <p className="mt-2 text-[17px] font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 text-[15px] text-stone-700">{children}</p>}
      {action}
    </div>
  );
}
