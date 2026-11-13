import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { escapeLike } from "@/lib/format";
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

  const { q, share: shareId, home: homeKey, focus } = await searchParams;
  let addTo: { shareId: string; clientName: string; title: string } | undefined;
  let onLink: string[] = [];
  if (shareId) {
    if (!z.uuid().safeParse(shareId).success) notFound();
    const [share] = await sql<{ id: string; client_name: string; first_address: string | null }[]>`
      select s.id, s.client_name,
        (select l.data->>'UnparsedAddress'
           from share_listings sl join listings l on l.listing_key = sl.listing_key
           where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as first_address
      from shares s where s.id = ${shareId} and s.agent_id = ${agent.id}`;
    if (!share) notFound();
    addTo = { shareId: share.id, clientName: share.client_name, title: linkTitle(share.client_name, share.first_address) };
    onLink = (
      await sql<{ listing_key: string }[]>`
        select listing_key from share_listings where share_id = ${share.id} and removed_at is null`
    ).map((r) => r.listing_key);
  }

  // Only a home still for sale; anything else and the usual search shows.
  const [start] =
    !addTo && typeof homeKey === "string" && homeKey.length <= 100
      ? await sql<{ data: Listing }[]>`
          select data from listings where listing_key = ${homeKey} and standard_status = 'Active'`
      : [];

  const query = (typeof q === "string" ? q : "").trim().slice(0, 100);
  const pattern = `%${escapeLike(query)}%`;
  const rows = await sql<{ data: Listing }[]>`
    select data from listings
    where standard_status = 'Active'
      and listing_key not in ${sql(onLink.length ? onLink : [""])}
      and (data->>'UnparsedAddress' ilike ${pattern}
        or data->>'City' ilike ${pattern}
        or data->>'PostalCode' ilike ${pattern}
        or data->>'ListingId' ilike ${pattern})
    order by updated_at desc, listing_key
    limit 24`;

  return (
    <ShareBuilder
      // With a home already picked, the builder words its own heading as homes are added.
      heading={
        addTo
          ? addTo.clientName
            ? `Add homes for ${addTo.title}`
            : `Add homes to the ${addTo.title[0].toLowerCase()}${addTo.title.slice(1)}`
          : "New link"
      }
      intro={
        addTo
          ? "Pick up to 3 more homes for their link."
          : start
            ? "Add who it's for. Pick someone on Porchcard, or type a first name."
            : focus === "to"
              ? "Add who it's for. Pick someone on Porchcard, or type a first name. Then pick up to 3 homes."
              : "Pick up to 3 homes to send, then add who it's for."
      }
      results={rows.map((row) => row.data)}
      initialQuery={query}
      addTo={addTo}
      start={start?.data}
      whoFirst={!addTo && focus === "to"}
    />
  );
}
