import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { ShareBuilder } from "./builder";

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export default async function NewSharePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const agent = await requireAgent();
  if (!agent.full_name) redirect("/dashboard/profile");

  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim().slice(0, 100);
  const pattern = `%${escapeLike(query)}%`;
  const rows = await sql<{ data: Listing }[]>`
    select data from listings
    where standard_status = 'Active'
      and (data->>'UnparsedAddress' ilike ${pattern}
        or data->>'City' ilike ${pattern}
        or data->>'PostalCode' ilike ${pattern}
        or data->>'ListingId' ilike ${pattern})
    order by updated_at desc, listing_key
    limit 24`;

  return (
    <>
      <h1 className="font-display text-3xl">New share</h1>
      <p className="mt-1 text-stone-700">Pick up to 3 homes to send.</p>
      <ShareBuilder results={rows.map((row) => row.data)} initialQuery={query} />
    </>
  );
}
