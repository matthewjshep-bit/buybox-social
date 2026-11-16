import { DoorOpen, Eye, Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { street } from "@/components/client-status";
import { CopyLink } from "@/components/copy-link";
import { Avatar, HomeThumb } from "@/components/ui";
import type { Client, ClientLink, ClientStatus } from "@/lib/clients";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// The Clients page, in plain words and large type: each client as one row,
// with one sentence about where things stand, one line of facts, and the one
// thing to do next as a big button.

// "today", "yesterday", "4 days ago", "Nov 7": whole words, never "4d".
function whenWords(date: Date, now = Date.now()) {
  const day = (d: Date | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const days = Math.round((Date.parse(day(now)) - Date.parse(day(date))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

// Where things stand with them, as a sentence.
export function StatusSentence({ status, className }: { status: ClientStatus; className?: string }) {
  const line = (icon: ReactNode, text: ReactNode, tone: string) => (
    <p className={cn("flex items-start gap-2 text-lg leading-snug", tone, className)}>
      <span aria-hidden className="mt-1 shrink-0">
        {icon}
      </span>
      <span className="min-w-0">{text}</span>
    </p>
  );
  switch (status.kind) {
    case "ask":
      return line(<DoorOpen size={18} />, <>Wants to see {street(status.address)}</>, "font-semibold text-amber-900");
    case "comment":
      return line(
        <MessageCircle size={18} />,
        <>
          <span className="font-normal">“{status.body}”</span>
        </>,
        "font-semibold text-amber-900",
      );
    case "active":
      return line(<span className="mt-1 block size-2.5 rounded-full bg-emerald-600" />, "Looking now", "font-semibold text-emerald-800");
    case "liked":
      return line(
        <Heart size={18} className="fill-rose-600 text-rose-600" />,
        `Liked ${status.n} of ${status.of} ${status.of === 1 ? "home" : "homes"}`,
        "text-ink",
      );
    case "opened":
      return line(<Eye size={18} />, "Opened · no likes yet", "text-ink");
    case "unopened":
      return line(<span className="mt-1 block size-2.5 rounded-full bg-amber-500" />, "Not opened yet", "text-ink");
  }
}

// "5 homes sent · Last active 4 days ago", or when they were sent them.
export function factsOf(client: Client) {
  return [
    `${client.homes} ${client.homes === 1 ? "home" : "homes"} sent`,
    client.lastActive ? `Last active ${whenWords(client.lastActive)}` : `Sent ${whenWords(client.sentAt)}`,
  ].join(" · ");
}

// The one thing to do next: answer them, send the link again, or look.
export function NextStep({ client }: { client: Client }) {
  const { status } = client;
  if (status.kind === "ask" || status.kind === "comment") {
    return (
      <Link href={status.href} className={button({ kind: "primary", size: "lg" })}>
        Reply<span className="sr-only"> to {client.name}</span>
      </Link>
    );
  }
  if (status.kind === "unopened") return <CopyLink path={client.linkPath} name={client.name} />;
  return (
    <Link href={client.href} className={button({ kind: "secondary", size: "lg" })}>
      Open<span className="sr-only"> {client.name}</span>
    </Link>
  );
}

export function ClientListRow({ client }: { client: Client }) {
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <Avatar name={client.name} photo={client.photo} size={10} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold leading-tight">
            <Link href={client.href} className="underline-offset-4 hover:underline">
              {client.name}
            </Link>
          </h3>
          <StatusSentence status={client.status} className="mt-1" />
          <p className="mt-1 text-base text-stone-600">{factsOf(client)}</p>
        </div>
      </div>
      <div className="flex shrink-0 pl-14 sm:justify-end sm:pl-0">
        <NextStep client={client} />
      </div>
    </li>
  );
}

// A link, plainly: its first home's photo, which homes, when it went, and
// whether anyone has opened it. On a client's page, and for links without a name.
export function LinkRow({ link }: { link: ClientLink }) {
  const what = link.firstAddress
    ? `${street(link.firstAddress)}${link.homes > 1 ? ` and ${link.homes - 1} more` : ""}`
    : "No homes on it";
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <HomeThumb src={link.photos[0]} sizes="64px" className="size-16 rounded-xl" />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug">{what}</p>
          <p className="text-base text-stone-600">
            Sent {whenWords(link.sentAt)} ·{" "}
            {link.openedAt ? (
              <span className="text-emerald-800">
                Opened {whenWords(link.openedAt)}
                {link.seen && ` · ${link.seen}`}
              </span>
            ) : (
              <span className="font-medium text-amber-800">Not opened yet</span>
            )}
          </p>
          {link.with.length > 0 && <p className="text-base text-stone-600">With {link.with.join(", ")}</p>}
        </div>
      </div>
      <div className="flex shrink-0 sm:justify-end">
        <Link href={link.href} className={button({ kind: "secondary", size: "lg" })}>
          Open<span className="sr-only"> the link for {what}</span>
        </Link>
      </div>
    </li>
  );
}
