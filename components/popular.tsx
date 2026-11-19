import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { HomeThumb } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import { PERIODS, type PopularHome, type PopularPeriod } from "@/lib/popular";
import { card, pageTitle } from "@/lib/ui";

// Popular: what everyone likes and talks about most, and who's busiest. One
// page in three parts, a tap apart: the homes, the people, and the agents.
// Over each, the same top: the title, the tabs (People only for someone
// signed in: people are listed only to people who are), and, for homes and
// people, three times to look over. (An agent's listings are what they have
// now: there's no week of them.)

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

// "12 likes · 4 comments", leaving out a nothing.
export const tally = (likes: number, comments: number) =>
  [likes > 0 && plural(likes, "like"), comments > 0 && plural(comments, "comment")].filter(Boolean).join(" · ");

export function PopularTop({
  on,
  period,
  people,
}: {
  on: "homes" | "people" | "agents";
  // The time being looked over (none on Agents, or when none was asked for).
  period?: PopularPeriod;
  // Whether there's a People part to go to (signed in).
  people: boolean;
}) {
  const base = on === "people" ? "/popular/people" : "/popular";
  const asked = period ? `?period=${period}` : "";
  const parts = [
    { key: "homes", label: "Homes", href: `/popular${asked}` },
    ...(people ? [{ key: "people", label: "People", href: `/popular/people${asked}` }] : []),
    { key: "agents", label: "Agents", href: "/popular/agents" },
  ];
  const says = {
    homes: "The homes people like and talk about most.",
    people: "Who likes and comments the most.",
    agents: "The agents with the most listings.",
  }[on];
  return (
    <>
      <h1 className={pageTitle}>Popular</h1>
      <p className="mt-1 text-body text-muted">{says}</p>
      <div role="group" aria-label="Popular" className="mt-3 flex gap-1 border-b border-stone-200">
        {parts.map((part) => (
          <Link
            key={part.key}
            href={part.href}
            aria-current={part.key === on ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 min-w-16 items-center justify-center border-b-2 px-3 text-sm font-semibold",
              part.key === on ? "border-stone-900 text-ink" : "border-transparent text-stone-600 hover:text-ink",
            )}
          >
            {part.label}
          </Link>
        ))}
      </div>
      {on !== "agents" && <div role="group" aria-label="Over" className="mt-4 flex gap-1.5 px-0.5">
        {PERIODS.map(({ key, label }) => (
          <Link
            key={key}
            href={`${base}?period=${key}`}
            aria-current={key === period ? "true" : undefined}
            className={cn(
              // (A 44px touch area around a 36px pill.)
              "flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors hit-44",
              key === period ? "bg-ink text-white" : "text-ink hover:bg-black/5",
            )}
          >
            {label}
          </Link>
        ))}
      </div>}
    </>
  );
}

// A place in the list: 1, 2, 3 in ink, the rest quieter.
function Rank({ n }: { n: number }) {
  return (
    <span className={cn("w-7 shrink-0 text-center font-display text-2xl tabular-nums", n <= 3 ? "text-ink" : "text-stone-500")}>
      <span className="sr-only">Number </span>
      {n}
    </span>
  );
}

// The homes, number one first: each a photo, where it is, what it costs, how
// many likes and comments, and the best-liked thing said about it. A tap
// opens it full screen, and the next one on from there is number two.
export function PopularHomes({ homes, period }: { homes: PopularHome[]; period: PopularPeriod }) {
  return (
    <ol aria-label="Popular homes" className={cn(card, "mt-4 divide-y divide-stone-100 overflow-hidden")}>
      {homes.map((home, i) => {
        const facts = [
          home.price ? formatPrice(home.price) : null,
          home.beds ? `${home.beds} bd` : null,
          home.baths ? `${home.baths} ba` : null,
        ].filter(Boolean);
        return (
          <li key={home.key}>
            <Link
              href={`/reel?${new URLSearchParams({ from: `popular:${period}`, home: home.key })}`}
              className="flex items-center gap-3 p-3 hover:bg-stone-50"
            >
              <Rank n={i + 1} />
              <HomeThumb src={home.photo} sizes="112px" className="h-20 w-24 sm:w-28" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {home.address}
                  {home.city && <span className="font-normal text-muted">, {home.city}</span>}
                </span>
                <span className="block truncate text-sm text-muted">{facts.join(" · ")}</span>
                {home.top && (
                  <span className="block truncate text-sm">
                    “{home.top.body}” <span className="text-muted">{home.top.name}</span>
                  </span>
                )}
                <span className="mt-1 flex items-center gap-3 text-sm font-semibold tabular-nums">
                  {/* (A nothing isn't said: no heart beside a 0.) */}
                  {home.likes > 0 && (
                    <span className="flex items-center gap-1">
                      <Heart aria-hidden size={16} className="fill-rose-500 text-rose-500" />
                      {home.likes}
                      <span className="sr-only"> {home.likes === 1 ? "like" : "likes"}</span>
                    </span>
                  )}
                  {home.comments > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageCircle aria-hidden size={16} className="text-stone-500" />
                      {home.comments}
                      <span className="sr-only"> {home.comments === 1 ? "comment" : "comments"}</span>
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
