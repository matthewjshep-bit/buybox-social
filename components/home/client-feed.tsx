import { Lock } from "lucide-react";
import Link from "next/link";
import { CaughtUp } from "@/components/home/caught-up";
import { DayFooter } from "@/components/home/day-reply";
import { ActivityCard } from "@/components/profile-feed";
import type { ClientCard } from "@/lib/client-feed";
import { cn } from "@/lib/format";
import { dayHeading } from "@/lib/profile";
import { duration } from "@/lib/shares";
import { card as cardClass } from "@/lib/ui";

// The agent's Clients stream: what their clients did on the homes they sent,
// as anyone's own page shows it (one card per home per day, the photo large,
// the spots they picked out, what they said), under day headings. Under each,
// what only the agent sees, and Reply when what the client said is waiting on
// them. It ends, with the way to older activity, rather than scrolling on.

const reelOf = (card: ClientCard) =>
  `/reel?${new URLSearchParams({
    from: `client:${card.who.participantId}`,
    home: card.home.key,
    ...(card.photo && { photo: String(card.photo.index) }),
  })}`;

export function ClientFeed({ cards }: { cards: ClientCard[] }) {
  if (cards.length === 0) {
    return (
      <p className={cn(cardClass, "px-5 py-6 text-center text-body text-stone-700")}>
        Nothing from clients in the last two weeks. You&apos;ll see the homes they like, and what they say, here.
      </p>
    );
  }
  const groups: { heading: string; cards: ClientCard[] }[] = [];
  for (const card of cards) {
    const heading = dayHeading(card.day);
    if (groups.at(-1)?.heading === heading) groups.at(-1)!.cards.push(card);
    else groups.push({ heading, cards: [card] });
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <h3 className="px-1 text-body font-semibold text-muted">{group.heading}</h3>
          <ul className="mt-2 flex flex-col gap-4">
            {group.cards.map((card) => (
              <ActivityCard
                key={card.id}
                card={card}
                name={card.who.name}
                face={card.who.name}
                isMe={false}
                agent={false}
                href={reelOf(card)}
                nameHref={card.who.profileId ? `/people/${card.who.profileId}` : `/dashboard/shares/${card.who.shareId}`}
                avatarPhoto={card.who.photo}
                footer={
                  <DayFooter
                    info={
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] leading-4 text-stone-500">
                        <span className="inline-flex items-center gap-1">
                          <Lock aria-hidden size={12} /> Only you see this
                        </span>
                        {card.seconds && <span>· Spent {duration(card.seconds)}</span>}
                      </p>
                    }
                    reply={card.reply && { ...card.reply, name: card.who.name }}
                    action={{
                      href: `/dashboard/shares/${card.who.shareId}?tab=homes#home-${encodeURIComponent(card.home.key)}`,
                      label: "Open their link",
                    }}
                  />
                }
              />
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
