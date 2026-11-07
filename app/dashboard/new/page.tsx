import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { ShareBuilder } from "./builder";

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

// Picks homes for a new client link, or (with ?share=) adds homes to an existing one.
// With ?home=, that home is already picked: the longer way to send one home.
export default async function NewSharePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; share?: string; home?: string }>;
}) {
  const agent = await requireAgent();
  if (!agent.full_name) redirect("/dashboard/profile");

  const { q, share: shareId, home: homeKey } = await searchParams;
  let addTo: { shareId: string; clientName: string } | undefined;
  let onLink: string[] = [];
  if (shareId) {
    if (!z.uuid().safeParse(shareId).success) notFound();
    const [share] = await sql<{ id: string; client_name: string }[]>`
      select id, client_name from shares where id = ${shareId} and agent_id = ${agent.id}`;
    if (!share) notFound();
    addTo = { shareId: share.id, clientName: share.client_name };
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
      heading={addTo ? `Add homes for ${addTo.clientName || "this client"}` : "New share"}
      intro={
        addTo
          ? "Pick up to 3 more homes for their link."
          : start
            ? "Add their name so they open it as themselves."
            : "Pick up to 3 homes to send."
      }
      results={rows.map((row) => row.data)}
      initialQuery={query}
      addTo={addTo}
      start={start?.data}
    />
  );
}
