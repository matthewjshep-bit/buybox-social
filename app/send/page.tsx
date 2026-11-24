import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShareBuilder } from "@/app/dashboard/new/builder";
import { requireUser } from "@/lib/auth";
import { pageColumn } from "@/lib/ui";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { shownOnProfile } from "@/lib/own-listings";
import { ensureAccountVisitor } from "@/lib/public";
import { sendHomesOffer, type SendOffer } from "@/lib/send-suggestions";

export const metadata = { title: "Send homes · Porchcard" };

const NO_OFFER: SendOffer = { mine: [], touched: [], more: [] };

// Sending homes, for anyone: the same three steps an agent has (which home,
// who it's for, then their own likes and comments on it, or none), and a
// link at the end. An agent's own is on their dashboard, with their clients.
// With ?home=, that home is already picked. Once they've sent any, the first
// step has a quiet way back to them: "Homes you sent".
export default async function SendPage({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const me = await requireUser();
  const { home } = await searchParams;
  const homeKey = typeof home === "string" && home.length <= 100 ? home : null;
  if (me.role === "agent") redirect(`/dashboard/new${homeKey ? `?home=${encodeURIComponent(homeKey)}` : ""}`);
  const visitor = await ensureAccountVisitor(me);
  // Only a home still for sale: one everyone browses, or a listing its
  // agent added that's showing on their profile (never one they've hidden).
  const findStart: Promise<{ data: Listing }[]> = homeKey
    ? Promise.resolve(sql<{ data: Listing }[]>`
        select data from listings
        where listing_key = ${homeKey} and standard_status = 'Active'
          and (owner_account_id is null or ${shownOnProfile()})`)
    : Promise.resolve([]);
  const [[start], offer, [links]] = await Promise.all([
    findStart,
    // Before anything's typed: the homes they've liked, commented on, saved
    // or sent before, then more to send (near them, popular, new). Sent from
    // a home, the page shows that home instead, so only looked for without one.
    findStart.then(([found]) => (found ? NO_OFFER : sendHomesOffer(me, visitor.id))),
    // Whether there's a link of theirs to go back to.
    sql<{ sent: boolean }[]>`select exists (select 1 from shares where agent_id = ${me.id}) as sent`,
  ]);
  return (
    <main className={pageColumn({ tray: true })}>
      <ShareBuilder
        heading="Send homes"
        intro={start ? "" : "Pick the homes to send."}
        results={[]}
        groups={[
          { title: "Homes you've liked, saved or sent", homes: offer.touched },
          { title: "Homes to send", homes: offer.more },
        ].filter((group) => group.homes.length > 0)}
        start={start?.data}
        peer
        aside={
          links.sent && (
            <Link
              href="/messages"
              className="-ml-2 inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-2 text-sm font-medium hover:bg-black/5"
            >
              Homes you sent <ChevronRight aria-hidden size={16} />
            </Link>
          )
        }
      />
    </main>
  );
}
