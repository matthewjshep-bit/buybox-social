import { Heart, Lock } from "lucide-react";
import Link from "next/link";
import { CaughtUp } from "@/components/home/caught-up";
import { DayFooter } from "@/components/home/day-reply";
import { Avatar, HomeThumb } from "@/components/ui";
import type { ClientDay } from "@/lib/agent-feed";
import { cn } from "@/lib/format";
import { cardTime, dayHeading } from "@/lib/profile";
import { duration } from "@/lib/shares";
import { card, glass } from "@/lib/ui";

// The agent's Clients stream: one card per client per day, under day
// headings. Each card says what they did ("Jenny reacted to 4 homes · liked
// 2, passed 2"), the homes small (what they liked first, with the thing they
// liked; what they passed on, faded), the newest thing they said, and one
// thing to do next. All of it is the agent's alone. It ends, with the way to
// older activity, rather than scrolling on.

// Homes in a card's strip; the last one says how many more.
const STRIP = 4;

const clientReel = (participantId: string, key: string) =>
  `/reel?${new URLSearchParams({ from: `client:${participantId}`, home: key })}`;

// "reacted to 4 homes", "commented on 2 homes", and the counts after it.
function whatOf(day: ClientDay) {
  const reacted = day.homes.filter((home) => home.verdict).length;
  const homes = (n: number) => `${n} ${n === 1 ? "home" : "homes"}`;
  // (A home in the day with no like or pass is one they only talked about.)
  const sentence = reacted ? `reacted to ${homes(reacted)}` : `commented on ${homes(day.homes.length)}`;
  const counts = [
    day.liked > 0 && `liked ${day.liked}`,
    day.passed > 0 && `passed ${day.passed}`,
    reacted > 0 && day.comments > 0 && (day.comments === 1 ? "1 comment" : `${day.comments} comments`),
  ].filter(Boolean);
  return { sentence, counts: counts.join(", ") };
}

export function ClientDayCard({ day }: { day: ClientDay }) {
  const { sentence, counts } = whatOf(day);
  const shown = day.homes.slice(0, STRIP);
  const extra = day.homes.length - shown.length;
  const link = `/dashboard/shares/${day.shareId}`;
  return (
    <li className={cn(card, "p-3.5")}>
      <div className="flex items-center gap-3">
        <Avatar name={day.name} photo={day.photo} size={9} />
        <p className="min-w-0 flex-1 text-body leading-snug">
          <strong className="font-semibold">{day.name}</strong> {sentence}
          <span className="text-meta text-muted">
            {counts && ` · ${counts}`}
            {" · "}
            <time dateTime={day.at}>{cardTime(day.at)}</time>
          </span>
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-1.5">
        {shown.map((home, i) => {
          const more = i === shown.length - 1 && extra > 0;
          const said = home.verdict === "like" ? "liked" : home.verdict === "pass" ? "passed" : "commented";
          return (
            <li key={home.key}>
              <Link
                href={clientReel(day.participantId, home.key)}
                aria-label={`${home.address}, ${said}${more ? `, and ${extra} more` : ""}`}
                className="block rounded-[10px] focus-visible:outline-offset-2"
              >
                <HomeThumb
                  src={home.photo}
                  sizes="(min-width: 1024px) 140px, 24vw"
                  className={cn("aspect-[4/3] w-full rounded-[10px]", home.verdict === "pass" && "opacity-75 saturate-25")}
                >
                  {home.verdict === "like" && (
                    <span
                      aria-hidden
                      className={cn(glass, "absolute bottom-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold leading-[18px]")}
                    >
                      <Heart size={10} className="shrink-0 fill-current" />
                      {home.spotTag && <span className="truncate">{home.spotTag}</span>}
                    </span>
                  )}
                  {home.verdict === "pass" && (
                    <span
                      aria-hidden
                      className={cn(glass, "absolute bottom-1 left-1 rounded-full px-1.5 text-[11px] font-semibold leading-[18px]")}
                    >
                      Pass
                    </span>
                  )}
                  {more && (
                    <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/45 text-base font-semibold text-white">
                      +{extra}
                    </span>
                  )}
                </HomeThumb>
              </Link>
            </li>
          );
        })}
      </ul>
      {day.quote && (
        <p className="mt-3 line-clamp-4 break-words rounded-xl bg-stone-50 p-3 text-body leading-snug">
          “{day.quote.body}”<span className="text-meta text-muted"> · on {day.quote.address}</span>
        </p>
      )}
      <DayFooter
        info={
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] leading-4 text-stone-500">
            <span className="inline-flex items-center gap-1">
              <Lock aria-hidden size={12} /> Only you see this
            </span>
            {day.seconds && <span>· Spent {duration(day.seconds)}</span>}
          </p>
        }
        reply={
          day.quote && !day.quote.answered
            ? { shareId: day.shareId, listingKey: day.quote.listingKey, name: day.name }
            : null
        }
        action={
          day.liked > 0
            ? { href: `${link}?tab=want`, label: "Send more like these" }
            : { href: link, label: `Open ${day.name}'s link` }
        }
      />
    </li>
  );
}

// Every card, under its day's heading, then the end of it.
export function ClientDays({ days }: { days: ClientDay[] }) {
  if (days.length === 0) {
    return (
      <p className={cn(card, "px-5 py-6 text-center text-body text-stone-700")}>
        Nothing from clients yet. You&apos;ll see their likes and questions here as they look.
      </p>
    );
  }
  const groups: { heading: string; days: ClientDay[] }[] = [];
  for (const day of days) {
    const heading = dayHeading(day.day);
    if (groups.at(-1)?.heading === heading) groups.at(-1)!.days.push(day);
    else groups.push({ heading, days: [day] });
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <h3 className="px-1 text-meta font-semibold text-muted">{group.heading}</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {group.days.map((day) => (
              <ClientDayCard key={day.id} day={day} />
            ))}
          </ul>
        </section>
      ))}
      <CaughtUp>
        Older activity is on each client&apos;s page.{" "}
        <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
          All clients
        </Link>
      </CaughtUp>
    </div>
  );
}
