// The map-and-list search page.
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { ORDER_BY, toTotals, totalsForListing, type HomeCard, type TotalsRow } from "./public";
import { HOME_TYPES, type SearchFilters } from "./search-options";
import { NO_REACTION, type ReactionState } from "./reactions";

export type SearchResult = HomeCard & { mine: ReactionState };

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchHomes(
  filters: SearchFilters,
  visitorId: string | null,
): Promise<SearchResult[]> {
  const conditions = [sql`l.standard_status = 'Active'`];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(sql`(
      l.data->>'City' ilike ${pattern} or l.data->>'PostalCode' ilike ${pattern}
      or l.data->>'UnparsedAddress' ilike ${pattern} or l.data->>'ListingId' ilike ${pattern})`);
  }
  if (filters.minPrice) conditions.push(sql`(l.data->>'ListPrice')::numeric >= ${filters.minPrice}`);
  if (filters.maxPrice) conditions.push(sql`(l.data->>'ListPrice')::numeric <= ${filters.maxPrice}`);
  if (filters.beds) conditions.push(sql`(l.data->>'BedroomsTotal')::int >= ${filters.beds}`);
  if (filters.baths) conditions.push(sql`(l.data->>'BathroomsTotalInteger')::int >= ${filters.baths}`);
  if (filters.type) conditions.push(sql`l.data->>'PropertySubType' = ${HOME_TYPES[filters.type].value}`);
  if (filters.liked) conditions.push(sql`t.pub_like + t.priv_like > 0`);
  const where = conditions.reduce((all, condition) => sql`${all} and ${condition}`);

  const orderBy = {
    reactions: ORDER_BY.reactions(),
    liked: ORDER_BY.liked(),
    talked: ORDER_BY.talked(),
    viewed: ORDER_BY.viewed(),
    newest: sql`l.data->>'OnMarketDate' desc nulls last`,
    "price-asc": sql`(l.data->>'ListPrice')::numeric asc`,
    "price-desc": sql`(l.data->>'ListPrice')::numeric desc`,
  }[filters.sort];

  const rows = await sql<({ data: Listing } & TotalsRow)[]>`
    select l.data, t.*
    from listings l
    cross join lateral (${totalsForListing()}) t
    where ${where}
    order by ${orderBy}, ${ORDER_BY.latest()}, l.listing_key
    limit 200`;
  if (rows.length === 0) return [];

  const mine = visitorId
    ? await sql<({ listing_key: string } & ReactionState)[]>`
        select listing_key, reaction, liked, disliked from public_reactions
        where visitor_id = ${visitorId} and listing_key in ${sql(rows.map((r) => r.data.ListingKey))}`
    : [];
  return rows.map((row) => ({
    listing: row.data,
    ...toTotals(row),
    mine: mine.find((m) => m.listing_key === row.data.ListingKey) ?? NO_REACTION,
  }));
}
