import { ArrowRight, Compass, Map as MapIcon, Users } from "lucide-react";
import Link from "next/link";
import { FollowButton } from "@/app/people/[id]/client";
import { ActivityCard } from "@/components/profile-feed";
import { Avatar, EmptyState, HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { FeedWho, HomeFeedEntry } from "@/lib/home-feed";
import { cardTime, dayHeading } from "@/lib/profile";
import { button, card as cardClass } from "@/lib/ui";

// The home page, signed in: what's new from people you follow and around what
// you've posted (and an agent's clients), newest first, by day. Any home opens
// them all full screen, in this order; Browse homes opens every home.

const reelOf = (key: string, photo?: number | null) =>
  `/reel?${new URLSearchParams({ from: "feed", home: key, ...(photo != null && { photo: String(photo) }) })}`;

export function HomeFeed({
  entries,
  suggestions,
  firstName,
  picks,
}: {
  entries: HomeFeedEntry[];
  // People worth following, while they follow few.
  suggestions: (FeedWho & { profileId: string })[];
  firstName: string;
  // Homes picked for them, while there's little in the feed: each opens every
  // home full screen, on that one.
  picks: { key: string; address: string; price: number; photo: string | null }[];
}) {
  const days: { heading: string; entries: HomeFeedEntry[] }[] = [];
  for (const entry of entries) {
    const heading = dayHeading(entry.day);
    if (days.at(-1)?.heading === heading) days.at(-1)!.entries.push(entry);
    else days.push({ heading, entries: [entry] });
  }
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-5">
      <div className={cn(cardClass, "p-4")}>
        <h1 className="font-display text-2xl">{firstName ? `Hi, ${firstName}` : "Your feed"}</h1>
        <p className="mt-0.5 text-body text-stone-700">What people you follow are liking, and what&apos;s new around you.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/reel" className={button({ kind: "primary" })}>
            <Compass aria-hidden size={17} /> Browse homes
          </Link>
          <Link href="/search" className={button({ kind: "secondary" })}>
            <MapIcon aria-hidden size={17} /> Map
          </Link>
        </div>
      </div>

      {suggestions.length > 0 && (
        <section aria-labelledby="suggested-title" className={cn(cardClass, "mt-4 p-4")}>
          <h2 id="suggested-title" className="font-semibold">
            People to follow
          </h2>
          <p className="text-meta text-muted">What they like comes to your feed.</p>
          <ul className="mt-2 flex flex-col">
            {suggestions.map((person) => (
              <li key={person.profileId} className="flex items-center gap-3 py-2">
                <Avatar name={person.face} tone={person.agent ? "agent" : "person"} size={9} photo={person.photo} />
                <Link href={`/people/${person.profileId}`} className="min-w-0 flex-1 underline-offset-2 hover:underline">
                  <span className="block truncate font-semibold">{person.name}</span>
                  {person.agent && <span className="block text-meta text-muted">Agent</span>}
                </Link>
                <FollowButton small personId={person.profileId} name={person.name} following={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {picks.length > 0 && (
        <section aria-labelledby="picks-title" className={cn(cardClass, "mt-4 p-4")}>
          <h2 id="picks-title" className="font-semibold">
            Picked for you
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {picks.map((home) => (
              <li key={home.key}>
                <Link href={`/reel?${new URLSearchParams({ home: home.key })}`} className="group block">
                  <HomeThumb src={home.photo} sizes="(min-width: 640px) 280px, 45vw" className="aspect-[4/3] w-full" />
                  <span className="mt-1.5 block font-display text-lg leading-tight">{formatPrice(home.price)}</span>
                  <span className="block truncate text-meta text-muted group-hover:underline">{home.address}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={Users}
          className="mt-4"
          title="Your feed is quiet for now"
          action={
            picks.length > 0 ? undefined : (
              <Link href="/reel" className={button({ kind: "primary" })}>
                <Compass aria-hidden size={17} /> Browse homes
              </Link>
            )
          }
        >
          Follow people to see what they like here. Tap anyone&apos;s name on a home to see their page.
        </EmptyState>
      ) : (
        <div className="mt-5 flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.heading} aria-label={day.heading}>
              <h2 className="px-1 text-body font-semibold text-muted">{day.heading}</h2>
              <ul className="mt-2 flex flex-col gap-3">
                {day.entries.map((entry) =>
                  entry.kind === "card" ? (
                    <ActivityCard
                      key={entry.id}
                      card={entry.card}
                      name={entry.who.name}
                      face={entry.who.face}
                      isMe={false}
                      agent={entry.who.agent}
                      href={reelOf(entry.card.home.key, entry.card.photo?.index)}
                      nameHref={entry.who.profileId ? `/people/${entry.who.profileId}` : undefined}
                      avatarPhoto={entry.who.photo}
                    />
                  ) : (
                    <NoteCard key={entry.id} entry={entry} />
                  ),
                )}
              </ul>
            </section>
          ))}
          <Link href="/reel" className={cn(button({ kind: "secondary" }), "mx-auto")}>
            <Compass aria-hidden size={17} /> Browse more homes
          </Link>
        </div>
      )}
    </main>
  );
}

// "Sam", "Sam and Lee", "Sam, Lee and Ana": each to their page.
function Names({ who }: { who: FeedWho[] }) {
  return (
    <>
      {who.map((person, i) => (
        <span key={`${person.profileId ?? person.name}:${i}`}>
          {i > 0 && (i === who.length - 1 ? " and " : ", ")}
          {person.profileId ? (
            <Link
              href={`/people/${person.profileId}`}
              className="relative z-20 font-semibold underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] hover:underline"
            >
              {person.name}
            </Link>
          ) : (
            <strong className="font-semibold">{person.name}</strong>
          )}
        </span>
      ))}
    </>
  );
}

// Something small that happened about a home: a reply to what you said, a
// like of it, or (to an agent) what a client did. The home beside it; the
// whole card opens the homes full screen.
function NoteCard({ entry }: { entry: Extract<HomeFeedEntry, { kind: "note" }> }) {
  const names = entry.who.map((person) => person.name).join(", ");
  return (
    <li className={cn(cardClass, "relative overflow-hidden")}>
      <Link
        href={reelOf(entry.home.key, entry.home.photoIndex)}
        aria-label={`${entry.home.address}: ${names}${entry.client ? ", your client," : ""} ${entry.sentence}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-[-3px]!"
      />
      <div className="flex items-start gap-3 p-4">
        <Avatar name={entry.who[0]?.face ?? ""} size={8} photo={entry.who[0]?.photo} />
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug text-ink">
            <Names who={entry.who} />
            {entry.client && ", your client,"} {entry.sentence}
            {" "}
            <span className="whitespace-nowrap text-meta text-muted">
              {"· "}
              <time dateTime={entry.at}>{cardTime(entry.at)}</time>
            </span>
          </p>
          {entry.quote && <p className="mt-1.5 line-clamp-3 break-words rounded-2xl bg-stone-50 p-3 text-body">{entry.quote}</p>}
          <p className="mt-1.5 truncate text-meta text-muted">{entry.home.address}</p>
          {entry.more && (
            <Link
              href={entry.more.href}
              className="relative z-20 mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand underline-offset-2 hover:underline"
            >
              {entry.more.label} <ArrowRight aria-hidden size={14} />
            </Link>
          )}
        </div>
        <HomeThumb src={entry.home.photo} sizes="64px" className="size-16" />
      </div>
    </li>
  );
}
