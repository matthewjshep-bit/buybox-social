import { DoorOpen, Users } from "lucide-react";
import { street } from "@/components/client-status";
import { CaughtUp } from "@/components/home/caught-up";
import { InlineReply } from "@/components/home/day-reply";
import { HeldFeed, type FeedSection } from "@/components/home/held-feed";
import { CommentBubble } from "@/components/comment-bubble";
import { EmptyState } from "@/components/ui";
import { ActivityCard } from "@/components/profile-feed";
import type { ClientCard } from "@/lib/client-feed";
import type { ClientAsk } from "@/lib/clients";
import { cn } from "@/lib/format";
import { cardTime, dayHeading, dayOf } from "@/lib/profile";
import { card as cardClass } from "@/lib/ui";

// The agent's Clients stream: what their clients did on the homes they sent,
// as anyone's own page shows it (one card per home per day, the photo large,
// the spots they picked out, what they said). Whatever is waiting for an
// answer comes first, under "Waiting for you"; the rest under day headings.
// Under each, the agent's own replies on that home, as Facebook shows
// comments, and a box right there to answer them on their link; a card
// answered stays where it is (HeldFeed). It's on each client's own page, as
// what they did (`asks`: their open requests to see a home, said across the
// top of the card each is on). Home has the clients themselves, not this
// stream; it can still draw every client's cards together, ending rather
// than scrolling on (`end`), should that come back.

const reelOf = (card: ClientCard) =>
  `/reel?${new URLSearchParams({
    from: `client:${card.who.participantId}`,
    home: card.home.key,
    ...(card.photo && { photo: String(card.photo.index) }),
  })}`;

// "Wants to see 4127 Larkmoor Ave", in the amber of things that wait.
function AskLine({ ask }: { ask: ClientAsk }) {
  return (
    <p className="flex items-center gap-2 bg-amber-50 px-4 py-2.5 text-body font-semibold text-amber-900">
      <DoorOpen aria-hidden size={18} className="shrink-0" />
      <span className="min-w-0">Wants to see {street(ask.address)}</span>
    </p>
  );
}

export function ClientFeed({
  cards,
  me,
  asks = [],
  end = true,
}: {
  cards: ClientCard[];
  me: { name: string; photo: string | null };
  asks?: ClientAsk[];
  // "You're all caught up" after the last card: where a stream stops.
  end?: boolean;
}) {
  if (cards.length === 0 && asks.length === 0) {
    return <EmptyState icon={Users} title="Nothing new from clients." />;
  }

  // Each request is said on the card it was made on (their card for that home
  // that day, still waiting), and those cards lead. One with no card left (the
  // words it posted were removed) is a row of its own, so it can be answered.
  const waiting = cards.filter((card) => card.waiting);
  const askOn = new Map<string, ClientAsk>();
  const loose: ClientAsk[] = [];
  for (const ask of asks) {
    const theirs = waiting.filter(
      (card) => card.who.participantId === ask.to && card.home.key === ask.listingKey && !askOn.has(card.id),
    );
    const card = theirs.find((card) => card.day === dayOf(ask.at)) ?? theirs[0];
    if (card) askOn.set(card.id, ask);
    else loose.push(ask);
  }
  waiting.sort((a, b) => Number(askOn.has(b.id)) - Number(askOn.has(a.id)));

  const groups: { heading: string; cards: ClientCard[] }[] = [];
  for (const card of cards) {
    if (card.waiting) continue;
    const heading = dayHeading(card.day);
    if (groups.at(-1)?.heading === heading) groups.at(-1)!.cards.push(card);
    else groups.push({ heading, cards: [card] });
  }

  const replies = (card: ClientCard) =>
    card.replies.length > 0 && (
      <ul aria-label="Your replies" className="mt-2 flex flex-col gap-2 pl-10">
        {card.replies.map((reply, i) => (
          <li key={i}>
            <CommentBubble
              name="You"
              face={me.name}
              photo={me.photo}
              agent
              meta={<time dateTime={reply.at}>{cardTime(reply.at)}</time>}
            >
              {reply.body}
            </CommentBubble>
          </li>
        ))}
      </ul>
    );

  const one = (card: ClientCard) => {
    const ask = askOn.get(card.id);
    return (
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
        only
        header={ask && <AskLine ask={ask} />}
        footer={
          <>
            {replies(card)}
            <InlineReply
              me={me}
              reply={{
                shareId: card.who.shareId,
                listingKey: card.home.key,
                name: card.who.name,
                to: card.who.participantId,
              }}
              waiting={card.waiting}
            />
            <div className="h-3" />
          </>
        }
      />
    );
  };

  const sections: FeedSection[] = [
    {
      heading: "Waiting for you",
      attention: true,
      items: [
        ...loose.map((ask) => ({
          id: `ask|${ask.to}|${ask.listingKey}`,
          waiting: true,
          node: (
            <li className={cn(cardClass, "overflow-hidden")}>
              <AskLine ask={ask} />
              <div className="px-4 pb-4 pt-1">
                <InlineReply
                  me={me}
                  reply={{ shareId: ask.shareId, listingKey: ask.listingKey, name: ask.name, to: ask.to }}
                  waiting
                />
              </div>
            </li>
          ),
        })),
        ...waiting.map((card) => ({ id: card.id, waiting: true, node: one(card) })),
      ],
    },
    ...groups.map((group) => ({
      heading: group.heading,
      items: group.cards.map((card) => ({ id: card.id, waiting: false, node: one(card) })),
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <HeldFeed sections={sections} />
      {end && <CaughtUp />}
    </div>
  );
}
