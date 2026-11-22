import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { ensureAccountVisitor } from "@/lib/public";
import { homesToSend } from "@/lib/send-search";
import { sendHomesOffer, type SendOffer } from "@/lib/send-suggestions";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { linkTitle } from "@/lib/people-picker";
import { ShareBuilder } from "./builder";
import { listingWords } from "@/lib/kinds";

export const metadata = { title: "Send homes · Porchcard" };

const NO_OFFER: SendOffer = { mine: [], touched: [], more: [] };

// Picks homes for a new client link, or (with ?share=) adds homes to an existing one.
// With ?home=, that home is already picked: the longer way to send one home.
export default async function NewSharePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; share?: string; home?: string }>;
}) {
  const agent = await requireAgent();
  // New here: what they are and the rest, a step at a time; an older
  // account with no name yet, its details.
  if (!agent.kind) redirect("/welcome");
  if (!agent.full_name) redirect("/dashboard/profile");

  const { q, share: shareId, home: homeKey } = await searchParams;
  let addTo: { shareId: string; clientName: string; title: string } | undefined;
  let onLink: string[] = [];
  if (shareId) {
    if (!z.uuid().safeParse(shareId).success) notFound();
    const [share] = await sql<{ id: string; client_name: string; first_address: string | null; on_link: string[] }[]>`
      select s.id, s.client_name,
        array(select sl.listing_key from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as on_link,
        (select l.data->>'UnparsedAddress'
           from share_listings sl join listings l on l.listing_key = sl.listing_key
           where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as first_address
      from shares s where s.id = ${shareId} and s.agent_id = ${agent.id}`;
    if (!share) notFound();
    addTo = { shareId: share.id, clientName: share.client_name, title: linkTitle(share.client_name, share.first_address) };
    onLink = share.on_link;
  }

  const query = (typeof q === "string" ? q : "").trim().slice(0, 100);
  const me = await ensureAccountVisitor(agent);
  // Only a home still for sale; anything else and the usual search shows.
  const findStart: Promise<{ data: Listing }[]> =
    !addTo && typeof homeKey === "string" && homeKey.length <= 100
      ? Promise.resolve(sql<{ data: Listing }[]>`
          select data from listings where listing_key = ${homeKey} and standard_status = 'Active'`)
      : Promise.resolve([]);
  // (Asked for by address in the page's own address, the old way: still answered.)
  const findResults: Promise<Listing[]> = query ? homesToSend(agent.id, query, { onLink }) : Promise.resolve([]);
  const [[start], results, offer] = await Promise.all([
    findStart,
    findResults,
    // Before anything's typed: their own listings, homes they've had to do
    // with, then more to send (near them, popular, new), so it's never empty.
    // The page shows these only when there's no home to start with and
    // nothing found by address, so they're looked for only then. (With
    // nothing asked for, as is usual, both answers are already there.)
    Promise.all([findStart, findResults]).then(([[found], foundByAddress]) =>
      found || foundByAddress.length > 0 ? NO_OFFER : sendHomesOffer(agent, me.id, { onLink }),
    ),
  ]);

  return (
    <ShareBuilder
      // With a home already picked, the builder words its own heading as homes are added.
      heading={
        addTo
          ? addTo.clientName
            ? `Add homes for ${addTo.title}`
            : `Add homes to the ${addTo.title[0].toLowerCase()}${addTo.title.slice(1)}`
          : "Send homes"
      }
      intro={
        addTo
          ? "Pick the homes to add."
          : start
            ? ""
            : "Pick the homes to send."
      }
      results={results}
      groups={[
        { title: `Your ${listingWords(agent.kind).many}`, homes: offer.mine },
        { title: "Homes you've liked, saved or sent", homes: offer.touched },
        { title: "Homes to send", homes: offer.more },
      ].filter((group) => group.homes.length > 0)}
      addTo={addTo}
      start={start?.data}
    />
  );
}
