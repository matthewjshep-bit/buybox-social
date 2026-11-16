import { cache } from "react";
import { sql } from "./db";
import type { Listing } from "./listings/types";

// The homes someone saved, newest saved first: theirs alone, so only ever
// read for whoever's page it is, by that person.
export const getSavedHomes = cache(async (visitorId: string | null): Promise<Listing[]> => {
  if (!visitorId) return [];
  const rows = await sql<{ data: Listing }[]>`
    select l.data
    from saved_homes s join listings l on l.listing_key = s.listing_key
    where s.visitor_id = ${visitorId}
    order by s.created_at desc, s.listing_key
    limit 200`;
  return rows.map(({ data }) => ({ ...data, Media: [...data.Media].sort((a, b) => a.Order - b.Order) }));
});
