import Link from "next/link";
import { CaughtUp } from "@/components/home/caught-up";
import { InlineReply } from "@/components/home/day-reply";
import { CommentBubble } from "@/components/comment-bubble";
import { ActivityCard } from "@/components/profile-feed";
import type { ClientCard } from "@/lib/client-feed";
import { cn } from "@/lib/format";
import { cardTime, dayHeading } from "@/lib/profile";
import { card as cardClass } from "@/lib/ui";

// The agent's Clients stream: what their clients did on the homes they sent,
// as anyone's own page shows it (one card per home per day, the photo large,
// the spots they picked out, what they said), under day headings. Under each,
// the agent's own replies on that home, as Facebook shows comments, and a box
// right there to answer them on their link. It ends, with the way to older
// activity, rather than scrolling on.

const reelOf = (card: ClientCard) =>
  `/reel?${new URLSearchParams({
    from: `client:${card.who.participantId}`,
    home: card.home.key,
    ...(card.photo && { photo: String(card.photo.index) }),
  })}`;

export function ClientFeed({ cards, me }: { cards: ClientCard[]; me: { name: string; photo: string | null } }) {
  if (cards.length === 0) {
    return (
      <p className={cn(cardClass, "px-5 py-6 text-center text-body text-stone-700")}>
        Nothing new from clients.
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
                only
                footer={
                  <>
                    {card.replies.length > 0 && (
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
                    )}
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
            ))}
          </ul>
        </section>
      ))}
      <CaughtUp>

        <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
          All clients
        </Link>
      </CaughtUp>
    </div>
  );
}
