import { ArrowRight, Flame, Heart, MapPin, Sparkles, X } from "lucide-react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { FeedBar } from "@/components/home/feed-bar";
import { PhotoSwipe } from "@/components/photo-swipe";
import { SaidLine } from "@/components/said-line";
import { Avatar, Badge, HomeThumb } from "@/components/ui";
import { cn, formatPrice, namesOrOthers } from "@/lib/format";
import type { FeedCounts, FeedWho, HomeFeedEntry } from "@/lib/home-feed";
import { cardTime } from "@/lib/profile";
import type { ReactionState } from "@/lib/reactions";
import { card } from "@/lib/ui";

// One home in the feed, shaped like a post: across the top, who and what
// ("Matt liked this home", "Matt commented “Love the porch”", or why it's
// here: popular, near you, picked for you, what you just rated), the home
// large (its other photos a swipe away), its facts in a line, and under it
// one small bar: a heart with how many liked it, a bubble with how many
// comments. The bubble unfurls the comments right there (FeedBar).
// The whole card opens the feed's homes in the pop-out, on this one, on the
// photo it's about (a tap on the photos, on the one showing); the names go to
// each person's page.

const feedReel = (key: string, photo?: number | null) =>
  `/reel?${new URLSearchParams({ from: "feed", home: key, ...(photo != null && { photo: String(photo) }) })}`;

// A photo's shape, kept between a little taller than wide and three by two.
const shapeOf = (photo: { width?: number; height?: number }) =>
  Math.min(3 / 2, Math.max(4 / 5, photo.width && photo.height ? photo.width / photo.height : 4 / 3));

// "Matthew", "Matthew and Eva", "Matthew, Eva and 2 others", in words alone.
const namesText = (who: FeedWho[]) => namesOrOthers(who.map((person) => person.name));

// The same, each name a link to their page (over the card's own link).
function Names({ who }: { who: FeedWho[] }) {
  const named = who.length <= 3 ? who : who.slice(0, 2);
  const others = who.length - named.length;
  const link = (person: FeedWho) =>
    person.profileId ? (
      <>
        <Link
          href={`/people/${person.profileId}`}
          className="relative z-20 font-semibold underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] hover:underline"
        >
          {person.name}
        </Link>
        {person.client && <YourClient />}
      </>
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

// Beside a name, in an agent's own feed: this one is their client.
function YourClient() {
  return (
    <span className="ml-1.5 inline-flex rounded-full bg-ink px-1.5 py-px align-[1px] text-[10px] font-bold uppercase tracking-wide text-white">
      Your client
    </span>
  );
}

// Up to three faces, overlapping.
function FaceStack({ who }: { who: FeedWho[] }) {
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

export function FollowingCard({
  entry,
  mine,
  counts,
}: {
  entry: HomeFeedEntry;
  mine: ReactionState | null;
  // How many liked it and how many comments it has, for the bar.
  counts: FeedCounts;
}) {
  const { home, why, reason } = entry;
  const label = reason ? `${home.address}: ${reason.text}` : `${home.address}: ${namesText(why.who)} ${why.sentence}`;
  // (Rated: the viewer's own heart or X, on a link their agent sent. The only
  // pass a card ever says is theirs.)
  const rated = reason?.kind === "rated" ? reason : null;
  const ReasonIcon = !reason
    ? null
    : reason.kind === "rated"
      ? reason.verdict === "like"
        ? Heart
        : X
      : { popular: Flame, near: MapPin, picked: Sparkles }[reason.kind];
  const reasonTone = !reason
    ? ""
    : reason.kind === "popular" || rated?.verdict === "like"
      ? "bg-rose-50 text-rose-600"
      : reason.kind === "near"
        ? "bg-sky-50 text-sky-700"
        : rated
          ? "bg-stone-100 text-stone-700"
          : "bg-amber-50 text-amber-700";
  // One person, who only commented: the newest of what they said leads.
  const lead =
    !reason && why.who.length === 1 && /^commented\b/.test(why.sentence) ? entry.said[0] : undefined;
  // A post from someone's page ("Pia posted about this home"): their words
  // are the post, under the line, above the photo.
  const post = !reason && why.who.length === 1 && /^posted\b/.test(why.sentence) ? entry.said[0] : undefined;
  const href = feedReel(home.key, home.photo?.index);
  const time = cardTime(entry.at);
  return (
    <li data-item={`home:${home.key}`} className={cn(card, "relative overflow-hidden")}>
      <Link
        href={href}
        aria-label={label}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-[-3px]!"
      />
      {reason && ReasonIcon ? (
        // Here for a reason of its own: popular, near them, picked for them,
        // or what they just did themselves (with when).
        <div className="flex items-center gap-3 p-3.5">
          <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full", reasonTone)}>
            <ReasonIcon size={18} className={cn(rated?.verdict === "like" && "fill-current")} />
          </span>
          <p className="min-w-0 flex-1 text-body font-semibold leading-snug">
            {reason.text}
            {rated && (
              <>
                {" "}
                <span className="whitespace-nowrap font-normal text-meta text-muted">
                  {"· "}
                  <time dateTime={entry.at}>{time}</time>
                </span>
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3.5">
          <FaceStack who={why.who} />
          <p data-card-line className={cn("min-w-0 flex-1 text-body leading-snug", lead && "break-words")}>
            <Names who={why.who} />{" "}
            {lead ? (
              // (Room for the name, the "Your client" tag, and the time.)
              <SaidLine said={lead} around={lead.who.name.length + (lead.who.client ? 12 : 0) + time.length + 3} />
            ) : (
              why.sentence
            )}
            {/* Held to the last word, so the time never starts a line on its own. */}
            {" "}
            <span className="whitespace-nowrap text-meta text-muted">
              {"· "}
              <time dateTime={entry.at}>{time}</time>
            </span>
          </p>
        </div>
      )}
      {post && <p className="-mt-1 whitespace-pre-line break-words px-3.5 pb-3 text-body leading-snug">{post.body}</p>}
      {home.photos.length > 0 && (
        <PhotoSwipe
          photos={home.photos}
          total={home.photoCount}
          href={href}
          label={home.address}
          sizes="(min-width: 1024px) 600px, 100vw"
          // On a phone, the first photo whole, at its own shape (between a
          // little taller than wide and three by two); wider, a fixed height.
          style={{ "--shape": String(shapeOf(home.photos[0])) } as CSSProperties}
          className="aspect-(--shape) w-full bg-stone-100 sm:aspect-auto sm:h-[28rem]"
        />
      )}
      {/* The facts, in a line: the price large, the rest after it. */}
      <div className="px-3.5 pt-3">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-xl font-semibold">{formatPrice(home.price)}</span>
          <span className="text-body text-stone-700">
            · {home.beds} bd · {home.baths} ba · {home.sqft.toLocaleString("en-US")} sq ft
          </span>
          {!home.active && <Badge className="self-center">Off market</Badge>}
        </p>
        <p className="truncate text-meta text-muted">
          {home.address}, {home.city}
        </p>
      </div>
      <FeedBar
        listingKey={home.key}
        address={home.address}
        counts={counts}
        mine={mine}
        active={home.active}
        reelHref={feedReel(home.key)}
      />
      <div className="h-1" />
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
    <li data-item={entries.map((entry) => `home:${entry.home.key}`).join(" ")} className={cn(card, "p-3.5")}>
      <div className="flex items-center gap-3">
        <FaceStack who={[who]} />
        <p className="min-w-0 flex-1 text-body leading-snug">
          {who.profileId ? (
            <Link href={`/people/${who.profileId}`} className="font-semibold underline-offset-2 hover:underline">
              {who.name}
            </Link>
          ) : (
            <strong className="font-semibold">{who.name}</strong>
          )}
          {who.client && <YourClient />}{" "}
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
