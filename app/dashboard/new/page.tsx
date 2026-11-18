import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { homesToSend } from "@/lib/send-search";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { linkTitle } from "@/lib/people-picker";
import { ShareBuilder } from "./builder";

// Picks homes for a new client link, or (with ?share=) adds homes to an existing one.
// With ?home=, that home is already picked: the longer way to send one home.
// With ?focus=to (from "Send homes to…" on the home page), who it's for comes
// first, ready to type.
export default async function NewSharePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; share?: string; home?: string; focus?: string }>;
}) {
  const agent = await requireAgent();
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
  const [[start], results] = await Promise.all([
    // Only a home still for sale; anything else and the usual search shows.
    !addTo && typeof homeKey === "string" && homeKey.length <= 100
      ? sql<{ data: Listing }[]>`
          select data from listings where listing_key = ${homeKey} and standard_status = 'Active'`
      : [],
    homesToSend(agent.id, query, { onLink }),
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
          ? "Pick up to 3 more."
          : start
            ? ""
            : "Pick up to 3 homes."
      }
      results={results}
      addTo={addTo}
      start={start?.data}
    />
  );
}
