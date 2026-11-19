import Link from "next/link";
import type { ReactNode } from "react";
import { Sent } from "@/app/dashboard/opened";
import { ClientStatusText, street } from "@/components/client-status";
import { CopyLink } from "@/components/copy-link";
import { Avatar, Badge, HomeThumb } from "@/components/ui";
import { replyHref, type Client, type ClientLink, type ClientStatus } from "@/lib/clients";
import { whenWords } from "@/lib/format";
import { peopleTitle } from "@/lib/people-picker";
import { button } from "@/lib/ui";

// The Clients page, in plain words and large type: each client as one row,
// with one sentence about where things stand, one line of facts, and the one
// thing to do next as a big button.

// Where things stand with them, as a sentence under their name.
export function StatusSentence({ status, className }: { status: ClientStatus; className?: string }) {
  return <ClientStatusText status={status} size="lg" className={className} />;
}

// "5 homes sent · Last active 4 days ago", or when they were sent them
// (unless the sentence above has just said when: "Not opened yet · sent today").
export function factsOf(client: Client) {
  return [
    `${client.homes} ${client.homes === 1 ? "home" : "homes"} sent`,
    client.lastActive
      ? `Last active ${whenWords(client.lastActive)}`
      : client.status.kind !== "unopened" && `Sent ${whenWords(client.sentAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// The one thing to do next: answer them, send the link again, or look.
export function NextStep({ client }: { client: Client }) {
  if (client.reply) {
    return (
      <Link href={replyHref(client.reply)} className={button({ kind: "primary", size: "lg" })}>
        Reply<span className="sr-only"> to {client.name}</span>
      </Link>
    );
  }
  if (client.status.kind === "unopened") return <CopyLink path={client.linkPath} name={client.name} />;
  return (
    <Link href={client.href} className={button({ kind: "secondary", size: "lg" })}>
      Open<span className="sr-only"> {client.name}</span>
    </Link>
  );
}

// Something new from a client since the agent last looked: the same blue dot
// on their face wherever they're listed (Home's "Your clients", the Clients
// page). For a screen reader it's said after their name instead.
export function UnreadDot() {
  return <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-brand ring-2 ring-white" />;
}

export function ClientListRow({ client }: { client: Client }) {
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="relative mt-0.5 shrink-0">
          <Avatar name={client.name} photo={client.photo} size={10} />
          {client.unread && <UnreadDot />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold leading-tight">
            <Link href={client.href} className="underline-offset-4 hover:underline">
              {client.name}
            </Link>
          </h3>
          {/* (Said after their name, not in it: the heading stays just who they are.) */}
          {client.unread && <p className="sr-only">New since you last looked</p>}
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

// How a link has gone, as the one thing to know about it: someone on it is
// waiting for the agent, nobody has opened it, what they made of it, or when
// it was last opened.
function LinkResult({ link }: { link: ClientLink }) {
  if (link.waiting) return <span className="font-semibold text-amber-900">Waiting for you</span>;
  if (!link.openedAt) return <span className="font-medium text-amber-800">Not opened yet</span>;
  if (link.liked + link.comments > 0) {
    return (
      <span className="text-ink">
        {[
          link.liked > 0 && `Liked ${link.liked}`,
          link.comments > 0 && `${link.comments} ${link.comments === 1 ? "comment" : "comments"}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    );
  }
  return (
    <span className="text-emerald-800">
      Opened {whenWords(link.openedAt)}
      {link.seen && ` · ${link.seen}`}
    </span>
  );
}

// How a link has gone for someone who isn't an agent (their own, on "Homes
// you sent"), as far as they're told: whether it's been opened, and how many
// comments are on it. Never when it was opened, how far anyone looked, or
// what they liked or passed on: a friend isn't a client.
function PlainResult({ link }: { link: ClientLink }) {
  if (!link.openedAt) return <span className="font-medium text-amber-800">Not opened yet</span>;
  return (
    <span>
      <span className="text-emerald-800">Opened</span>
      {link.comments > 0 && ` · ${link.comments} ${link.comments === 1 ? "comment" : "comments"}`}
    </span>
  );
}

// The links (by id) that would read the same as another in the list: for the
// same people, with the same first home, sent the same day (the homes' day,
// Pacific). Those say when they went to the minute.
export function lookAlikes(links: ClientLink[]) {
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const look = (link: ClientLink) => [link.for.join("\n").toLowerCase(), link.firstAddress, day(link.sentAt)].join("\n\n");
  const seen = new Map<string, number>();
  for (const link of links) seen.set(look(link), (seen.get(look(link)) ?? 0) + 1);
  return new Set(links.filter((link) => seen.get(look(link))! > 1).map((link) => link.shareId));
}

// A link, plainly: its first home's photo, and three lines. On a client's
// page it leads with the homes on it, then when it went. On the Links page
// (`lead="who"`) it leads with who it's for ("No name yet", with nobody on
// it), as the way to its page, then the homes and when it went. Last, either
// way, how it's gone, with "New" when there's something the agent hasn't seen.
// `timed`: another link in the list went to the same home on the same day, so
// when it went is said to the minute.
// One button: Open; or, on the Links page, for a link nobody has opened that
// has one link to send, Copy link. `more`: something quieter beside it (Delete).
// `plain`: the link is someone's who isn't an agent, so how it's gone is only
// "Not opened yet" or "Opened", and a count of comments (see PlainResult).
export function LinkRow({
  link,
  lead = "homes",
  timed = false,
  plain = false,
  more,
}: {
  link: ClientLink;
  lead?: "homes" | "who";
  timed?: boolean;
  plain?: boolean;
  more?: ReactNode;
}) {
  const what = link.firstAddress
    ? `${street(link.firstAddress)}${link.homes > 1 ? ` and ${link.homes - 1} more` : ""}`
    : "No homes on it";
  const who = peopleTitle(link.for) || "No name yet";
  const sent = timed ? <Sent at={link.sentAt.toISOString()} /> : `Sent ${whenWords(link.sentAt)}`;
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <HomeThumb src={link.photos[0]} sizes="64px" className="size-16 rounded-xl" />
        <div className="min-w-0">
          {lead === "who" ? (
            <>
              <p className="text-lg font-semibold leading-snug">
                <Link href={link.href} className="underline-offset-4 hover:underline">
                  {who}
                </Link>
              </p>
              <p className="text-base text-stone-600">
                {what} · <span className="whitespace-nowrap">{sent}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold leading-snug">{what}</p>
              <p className="text-base text-stone-600">{sent}</p>
            </>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-base">
            {plain ? <PlainResult link={link} /> : <LinkResult link={link} />}
            {!plain && link.unread && <Badge tone="info">New</Badge>}
          </p>
          {lead === "homes" && link.with.length > 0 && (
            <p className="text-base text-stone-600">With {link.with.join(", ")}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {lead === "who" && !link.openedAt && link.linkPath ? (
          <CopyLink path={link.linkPath} name={link.for.length > 0 ? who : what} />
        ) : (
          <Link href={link.href} className={button({ kind: "secondary", size: "lg" })}>
            Open<span className="sr-only"> the link for {what}</span>
          </Link>
        )}
        {more}
      </div>
    </li>
  );
}
