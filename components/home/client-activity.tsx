import { Eye, Heart, Hand, MessageCircle, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar } from "@/components/ui";
import type { ClientEvent } from "@/lib/client-activity";
import { cn } from "@/lib/format";
import { cardTime } from "@/lib/profile";
import { button, card } from "@/lib/ui";

// "Client activity", beside a pro's feed: what their clients just did on the
// links they were sent (opened one, liked or passed on a home, said
// something, asked to see one), newest first, kept up to date while the page
// is open. Each a tap from that client's page. Only they see it.

const SAYS: Record<ClientEvent["kind"], (event: ClientEvent) => string> = {
  opened: () => "opened your link",
  liked: (event) => `liked ${event.address ?? "a home"}`,
  passed: (event) => `passed on ${event.address ?? "a home"}`,
  comment: (event) => `commented on ${event.address ?? "a home"}`,
  ask: (event) => `wants to see ${event.address ?? "a home"}`,
};

const ICON = {
  opened: <Eye aria-hidden size={13} />,
  liked: <Heart aria-hidden size={13} className="fill-rose-600 text-rose-600" />,
  passed: <ThumbsDown aria-hidden size={13} className="text-amber-700" />,
  comment: <MessageCircle aria-hidden size={13} />,
  ask: <Hand aria-hidden size={13} className="text-brand" />,
};

export function ClientActivity({
  events,
  id,
  className,
  live = true,
}: {
  events: ClientEvent[];
  id: string;
  className?: string;
  // Keeps the page up to date (once a page: the other copy, for a phone, doesn't).
  live?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={cn(card, "py-3", className)}>
      {live && <LiveRefresh />}
      <h2 id={id} className="flex items-center justify-between px-4 text-body font-semibold">
        Client activity
        <span className="text-meta font-normal text-muted">Only you see this</span>
      </h2>
      {events.length === 0 ? (
        <div className="px-4 pb-1 pt-2">
          <p className="text-body text-stone-700">When clients open the homes you send, what they do shows here.</p>
          <Link href="/dashboard/new" className={cn(button({ kind: "secondary" }), "mt-3")}>
            Send homes
          </Link>
        </div>
      ) : (
        <ul className="mt-1 px-1">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={event.href} className="flex min-h-14 items-start gap-3 rounded-xl px-3 py-2 hover:bg-stone-50">
                <Avatar name={event.client.name} photo={event.client.photo} size={9} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="font-semibold">{event.client.name}</span> {SAYS[event.kind](event)}
                  {event.body && <span className="mt-0.5 line-clamp-2 block text-stone-700">“{event.body}”</span>}
                  <span className="mt-0.5 flex items-center gap-1 text-meta text-muted">
                    {ICON[event.kind]}
                    <time dateTime={event.at}>{cardTime(event.at)}</time>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/dashboard"
        className="mx-4 mt-1 flex min-h-11 items-center justify-center border-t border-stone-200 pt-1 text-sm font-semibold text-stone-700 hover:text-ink"
      >
        All clients
      </Link>
    </section>
  );
}
