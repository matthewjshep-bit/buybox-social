// The map-and-list search page.
import { sql } from "./db";
import { escapeLike } from "./format";
import { ORDER_BY, totalsForListing } from "./public";
import { HOME_TYPES, type SearchFilters } from "./search-options";

// A home (`listings l`) found by what's typed: part of its address, city, zip
// or MLS number, taken as it is.
export const matchesPlace = (text: string) => {
  const pattern = `%${escapeLike(text)}%`;
  return sql`(
    l.data->>'UnparsedAddress' ilike ${pattern} or l.data->>'City' ilike ${pattern}
    or l.data->>'PostalCode' ilike ${pattern} or l.data->>'ListingId' ilike ${pattern})`;
};

// The homes a search finds, in its order: their keys, for the reel to show.
export async function searchHomeKeys(filters: SearchFilters): Promise<string[]> {
  const conditions = [sql`l.standard_status = 'Active'`];
  if (filters.q) conditions.push(matchesPlace(filters.q));
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

  const rows = await sql<{ listing_key: string }[]>`
    select l.listing_key
    from listings l
    cross join lateral (${totalsForListing()}) t
    where ${where}
    order by ${orderBy}, ${ORDER_BY.latest()}, l.listing_key
    limit 200`;
  return rows.map((row) => row.listing_key);
}
