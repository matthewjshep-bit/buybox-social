import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FeedHeart } from "@/components/home/feed-heart";
import { Avatar, Badge, HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { FeedWho, HomeFeedEntry } from "@/lib/home-feed";
import { cardTime } from "@/lib/profile";
import type { ReactionState } from "@/lib/reactions";
import { card } from "@/lib/ui";

// One home in the Following stream: who liked it (or said something about
// it), the home large, its facts, a heart to like it too, and what they said.
// The whole card opens the stream's homes in the pop-out, on this one, on the
// photo it's about; the names go to each person's page.

export const feedReel = (key: string, photo?: number | null) =>
  `/reel?${new URLSearchParams({ from: "feed", home: key, ...(photo != null && { photo: String(photo) }) })}`;

// "Matthew", "Matthew and Eva", "Matthew, Eva and 2 others", in words alone.
export function namesText(who: FeedWho[]) {
  const names = who.map((person) => person.name);
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

// The same, each name a link to their page (over the card's own link).
function Names({ who }: { who: FeedWho[] }) {
  const named = who.length <= 3 ? who : who.slice(0, 2);
  const others = who.length - named.length;
  const link = (person: FeedWho) =>
    person.profileId ? (
      <Link
        href={`/people/${person.profileId}`}
        className="relative z-20 font-semibold underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] hover:underline"
      >
        {person.name}
      </Link>
    ) : (
      <strong className="font-semibold">{person.name}</strong>
    );
  return (
    <>
      {named.map((person, i) => (
        <span key={`${person.profileId ?? person.name}:${i}`}>
          {i > 0 && (i === named.length - 1 && !others ? " and " : ", ")}
          {link(person)}
        </span>
      ))}
      {others > 0 && ` and ${others} ${others === 1 ? "other" : "others"}`}
    </>
  );
}

// Up to three faces, overlapping.
export function FaceStack({ who }: { who: FeedWho[] }) {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-2">
      {who.slice(0, 3).map((person, i) => (
        <Avatar
          key={`${person.profileId ?? person.name}:${i}`}
          name={person.face || person.name}
          tone={person.agent ? "agent" : "person"}
          photo={person.photo}
          size={who.length > 1 ? 8 : 9}
          className="ring-2 ring-white"
        />
      ))}
    </span>
  );
}

export function FollowingCard({ entry, mine }: { entry: HomeFeedEntry; mine: ReactionState | null }) {
  const { home, why } = entry;
  const label = `${home.address}: ${namesText(why.who)} ${why.sentence}`;
  return (
    <li className={cn(card, "relative overflow-hidden")}>
      <Link
        href={feedReel(home.key, home.photo?.index)}
        aria-label={label}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-[-3px]!"
      />
      <div className="flex items-center gap-3 p-3.5">
        <FaceStack who={why.who} />
        <p className="min-w-0 flex-1 text-body leading-snug">
          <Names who={why.who} /> {why.sentence}
          <span className="whitespace-nowrap text-meta text-muted">
            {" · "}
            <time dateTime={entry.at}>{cardTime(entry.at)}</time>
          </span>
        </p>
      </div>
      {home.photo && (
        <div className="relative h-[min(28rem,112vw)] w-full bg-stone-100">
          <Image
            src={home.photo.url}
            alt={home.photo.alt}
            fill
            sizes="(min-width: 1024px) 600px, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <div className="flex items-start gap-2 px-3.5 pt-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-2xl leading-tight">{formatPrice(home.price)}</span>
            {!home.active && <Badge className="self-center">Off market</Badge>}
          </p>
          <p className="text-body text-stone-700">
            {home.beds} bd · {home.baths} ba · {home.sqft.toLocaleString("en-US")} sq ft
          </p>
          <p className="truncate text-meta text-muted">
            {home.address}, {home.city}
          </p>
        </div>
        {home.active && <FeedHeart listingKey={home.key} address={home.address} initial={mine} />}
      </div>
      {entry.said.length > 0 && (
        <ul className="flex flex-col gap-2 px-3.5 pt-3">
          {entry.said.map((quote, i) => (
            <li key={i} className="line-clamp-4 break-words rounded-xl bg-stone-50 p-3 text-body leading-snug">
              <strong className="font-semibold">{quote.who.name}</strong> “{quote.body}”
            </li>
          ))}
        </ul>
      )}
      <div className="h-3.5" />
    </li>
  );
}

// A person's day of likes with nothing said, three homes or more: one line,
// the homes small, and the way to all of them.
export function StripCard({ entries }: { entries: HomeFeedEntry[] }) {
  const who = entries[0].why.who[0];
  const cities = [...new Set(entries.map((entry) => entry.home.city).filter(Boolean))];
  const where = cities.length === 1 ? ` in ${cities[0]}` : cities.length === 2 ? ` in ${cities[0]} and ${cities[1]}` : "";
  const highlights = (key?: string) =>
    `/reel?${new URLSearchParams({ from: who.profileId ?? "feed", ...(key && { home: key }) })}`;
  return (
    <li className={cn(card, "p-3.5")}>
      <div className="flex items-center gap-3">
        <FaceStack who={[who]} />
        <p className="min-w-0 flex-1 text-body leading-snug">
          {who.profileId ? (
            <Link href={`/people/${who.profileId}`} className="font-semibold underline-offset-2 hover:underline">
              {who.name}
            </Link>
          ) : (
            <strong className="font-semibold">{who.name}</strong>
          )}{" "}
          liked {entries.length} homes{where}
          <span className="whitespace-nowrap text-meta text-muted">
            {" · "}
            <time dateTime={entries[0].at}>{cardTime(entries[0].at)}</time>
          </span>
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-1.5">
        {entries.slice(0, 3).map((entry) => (
          <li key={entry.id}>
            <Link href={highlights(entry.home.key)} aria-label={entry.home.address} className="block rounded-[10px]">
              <HomeThumb
                src={entry.home.photo?.url}
                sizes="(min-width: 1024px) 190px, 33vw"
                className="aspect-[4/3] w-full rounded-[10px]"
              />
            </Link>
          </li>
        ))}
      </ul>
      {who.profileId && (
        <Link
          href={highlights()}
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-brand hover:underline"
        >
          Open {who.name}&apos;s highlights <ArrowRight aria-hidden size={14} />
        </Link>
      )}
    </li>
  );
}
