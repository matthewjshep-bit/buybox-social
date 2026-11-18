import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl, cn } from "@/lib/format";
import { getShareListings } from "@/lib/shares";
import { button, card } from "@/lib/ui";
import { SendLink } from "../client";

export const metadata = { title: "Your link is ready · Porchcard" };

// The last step of sending homes: the link, ready to copy or send, and
// nothing else. One for each person it's for (each with their name), or the
// one link anyone can use. Then on to the link's own page, or to send more.
export default async function LinkReadyPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [share] = await sql<{ id: string; token: string; client_name: string }[]>`
    select id, token, client_name from shares where id = ${id} and agent_id = ${agent.id}`;
  if (!share) notFound();
  const [people, listings] = await Promise.all([
    // Everyone the agent added, in the order they did: each has a link of their own.
    sql<{ id: string; first_name: string; token: string }[]>`
      select id, first_name, token from participants
      where share_id = ${id} and token is not null
      order by invited_at nulls last, position nulls last, created_at, first_name`,
    getShareListings(share.id),
  ]);
  const count = listings.length;
  const oneHome = count === 1 ? { address: listings[0].UnparsedAddress, price: listings[0].ListPrice } : undefined;
  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <CheckCircle2 aria-hidden size={32} className="shrink-0 text-emerald-600" />
        <h1 className="font-display text-3xl">{people.length > 1 ? "Your links are ready" : "Your link is ready"}</h1>
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
        <Link href={`/dashboard/shares/${share.id}`} className={button({ kind: "primary", size: "lg" })}>
          Done
        </Link>
        <Link href="/dashboard/new" className={button({ kind: "secondary", size: "lg" })}>
          Send another
        </Link>
      </div>
    </div>
  );
}
