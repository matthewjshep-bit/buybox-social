import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SendLink } from "@/app/dashboard/shares/[id]/client";
import { sql } from "@/lib/db";
import { appUrl, cn } from "@/lib/format";
import { getShareListings } from "@/lib/shares";
import { button, card, pageTitle } from "@/lib/ui";

// The last step of sending homes: the link, ready to copy or send, and
// nothing else. One for each person it's for (each with their name), or the
// one link anyone can use. Only ever its owner's. Then on: Done, or another.
export async function LinkReady({
  ownerId,
  id,
  done,
  again,
  open = false,
}: {
  ownerId: string;
  id: string;
  // Where Done goes, and where sending another starts.
  done: string;
  again: string;
  // A way into the link itself, to see what's been said on it (for someone
  // with no dashboard: this page is where their link lives).
  open?: boolean;
}) {
  if (!z.uuid().safeParse(id).success) notFound();
  const [share] = await sql<{ id: string; token: string; client_name: string }[]>`
    select id, token, client_name from shares where id = ${id} and agent_id = ${ownerId}`;
  if (!share) notFound();
  const [people, listings] = await Promise.all([
    // Everyone they added, in the order they did: each has a link of their own.
    sql<{ id: string; first_name: string; token: string }[]>`
      select id, first_name, token from participants
      where share_id = ${id} and token is not null
      order by invited_at nulls last, position nulls last, created_at, first_name`,
    getShareListings(share.id),
  ]);
  const count = listings.length;
  const oneHome = count === 1 ? { address: listings[0].UnparsedAddress, price: listings[0].ListPrice } : undefined;
  return (
    <div>
      <div className="flex items-center gap-3">
        <CheckCircle2 aria-hidden size={32} className="shrink-0 text-emerald-600" />
        <h1 className={cn(pageTitle, "min-w-0")}>{people.length > 1 ? "Your links are ready" : "Your link is ready"}</h1>
      </div>
      <p className="mt-1 text-body text-stone-700">
        {count === 1 ? listings[0].UnparsedAddress : `${count} homes`}
        {people.length > 0 && ` · for ${people.map((person) => person.first_name).join(", ")}`}
      </p>

      <ul aria-label="Links" className="mt-5 flex flex-col gap-3">
        {people.map((person) => (
          <li key={person.id} className={cn(card, "p-4")}>
            <p className="text-lg font-semibold">{person.first_name}</p>
            <SendLink
              bare
              url={`${appUrl()}/s/${person.token}`}
              clientName={person.first_name}
              count={count}
              home={oneHome}
              label={`${person.first_name}'s link`}
              who={person.first_name}
            />
          </li>
        ))}
        {people.length === 0 && (
          <li>
            <SendLink url={`${appUrl()}/s/${share.token}`} clientName="" count={count} home={oneHome} />
          </li>
        )}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href={done} className={button({ kind: "primary", size: "lg" })}>
          Done
        </Link>
        <Link href={again} className={button({ kind: "secondary", size: "lg" })}>
          Send another
        </Link>
        {open && (
          <Link href={`/s/${share.token}`} className={button({ kind: "ghost", size: "lg" })}>
            See what they said
          </Link>
        )}
      </div>
    </div>
  );
}
