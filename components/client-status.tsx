import { DoorOpen, Eye, Heart, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { ClientStatus } from "@/lib/clients";
import { cn, whenWords } from "@/lib/format";

// The street of an address: "5902 Lakeview Terrace SE".
export const street = (address: string) => address.split(",")[0];

// What waits on the agent is amber wherever it's said; someone looking right
// now is green; the rest is plain.
const TONE = { waiting: "text-amber-900", now: "text-emerald-800", plain: "text-ink" };

// The one thing to know about a client, in the same words wherever it's said:
// they want a showing, what they said that's waiting on you, they're looking
// right now, how many homes they liked, or that they haven't opened what you
// sent. `sm`: one line beside their name (Home), cut short if it's long.
// `lg`: a sentence under their name (the Clients page, their own page).
export function ClientStatusText({
  status,
  size,
  className,
}: {
  status: ClientStatus;
  size: "sm" | "lg";
  className?: string;
}) {
  const sm = size === "sm";
  const icon = sm ? 14 : 18;
  const dot = (colour: string) => <span className={cn("block rounded-full", sm ? "size-2" : "mt-1 size-2.5", colour)} />;
  const line = (mark: ReactNode, text: ReactNode, tone: keyof typeof TONE, strong = false) => (
    <p
      className={cn(
        "flex min-w-0",
        sm ? "items-center gap-1.5 text-meta" : "items-start gap-2 text-lg leading-snug",
        TONE[tone],
        strong && (sm ? "font-medium" : "font-semibold"),
        className,
      )}
    >
      <span aria-hidden className={cn("shrink-0", !sm && "mt-1")}>
        {mark}
      </span>
      <span className={cn("min-w-0", sm && "truncate")}>{text}</span>
    </p>
  );
  switch (status.kind) {
    case "ask":
      return line(<DoorOpen size={icon} />, <>Wants to see {street(status.address)}</>, "waiting", true);
    case "comment":
      return line(<MessageCircle size={icon} />, <>“{status.body}”</>, "waiting");
    case "active":
      return line(dot("bg-emerald-600"), "Looking now", "now", true);
    case "liked":
      return line(
        <Heart size={icon} className="fill-rose-600 text-rose-600" />,
        `Liked ${status.n} of ${status.of} ${status.of === 1 ? "home" : "homes"}`,
        "plain",
      );
    case "opened":
      return line(<Eye size={icon} />, "Opened · no likes yet", "plain");
    case "unopened":
      return line(dot("bg-amber-500"), `Not opened yet · sent ${whenWords(status.sentAt)}`, "plain");
  }
}

// Beside their name on Home.
export function ClientStatusLine({ status }: { status: ClientStatus }) {
  return <ClientStatusText status={status} size="sm" />;
}
