import { redirect } from "next/navigation";
import { ShareBuilder } from "@/app/dashboard/new/builder";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { ensureAccountVisitor } from "@/lib/public";
import { homesToOffer } from "@/lib/send-search";

export const metadata = { title: "Send homes · Porchcard" };

// Sending homes, for anyone: the same three steps an agent has (which home,
// who it's for, then their own likes and comments on it, or none), and a
// link at the end. An agent's own is on their dashboard, with their clients.
// With ?home=, that home is already picked.
export default async function SendPage({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const me = await requireUser();
  const { home } = await searchParams;
  const homeKey = typeof home === "string" && home.length <= 100 ? home : null;
  if (me.role === "agent") redirect(`/dashboard/new${homeKey ? `?home=${encodeURIComponent(homeKey)}` : ""}`);
  const visitor = await ensureAccountVisitor(me);
  const [[start], offer] = await Promise.all([
    // Only a home still for sale.
    homeKey
      ? sql<{ data: Listing }[]>`
          select data from listings
          where listing_key = ${homeKey} and standard_status = 'Active' and owner_account_id is null`
      : [],
    // Before anything's typed: the homes they've liked, commented on, saved or sent before.
    homesToOffer(me, visitor.id),
  ]);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-6 pt-5">
      <ShareBuilder
        heading="Send homes"
        intro={start ? "" : "Pick up to 3 homes."}
        results={[]}
        groups={[{ title: "Homes you've liked or sent", homes: offer.touched }].filter((group) => group.homes.length > 0)}
        start={start?.data}
        peer
      />
    </main>
  );
}
