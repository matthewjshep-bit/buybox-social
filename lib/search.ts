// The map-and-list search page.
import { sql } from "./db";
import { escapeLike, placeWords } from "./format";
import { ORDER_BY, totalsForListing } from "./public";
import { HOME_TYPES, type SearchFilters } from "./search-options";

// Everything a home (`listings l`) is found by, as one line, the way the app
// prints it: "5902 Lakeview Terrace SE Mercer Island WA 98040", then its MLS
// number.
const place = () =>
  sql`concat_ws(' ', l.data->>'UnparsedAddress', l.data->>'City', l.data->>'StateOrProvince', l.data->>'PostalCode', l.data->>'ListingId')`;

// A home found by what's typed: every word of it is somewhere in the home's
// address, city, state, ZIP or MLS number, in any order. So the street with
// its city ("5902 Lakeview Terrace SE, Mercer Island"), a few words of each
// ("lakeview mercer") and a ZIP with a street ("98040 lakeview") all find it.
// Nothing typed (or only commas) matches every home.
export const matchesPlace = (text: string) => {
  const words = placeWords(text);
  if (words.length === 0) return sql`true`;
  const each = words.map((word) => sql`${place()} ilike ${`%${escapeLike(word)}%`}`);
  return sql`(${each.reduce((all, one) => sql`${all} and ${one}`)})`;
};

// To order by: whether the home's address (with its city after it) starts
// with what was typed, so "12 Main" has 12 Main St ahead of 412 Main St.
// Commas and full stops count for nothing on either side.
export const startsWithPlace = (text: string) =>
  sql`regexp_replace(${place()}, '[[:space:],.]+', ' ', 'g') ilike ${`${escapeLike(placeWords(text).join(" "))}%`}`;

// The homes a search finds, in its order: their keys, for the reel to show.
export async function searchHomeKeys(filters: SearchFilters): Promise<string[]> {
  // For sale: from the MLS, or added by someone themselves (a deal, their own
  // listing) when it's one anyone may see on their profile: not hidden, with
  // a photo. (Closed ones stay on their profiles. A copy an agent made of
  // their MLS listing, to change it, isn't the home twice: while the MLS one
  // is for sale, that's the one found.)
  const conditions = [
    sql`l.standard_status = 'Active' and (l.owner_account_id is null or (
      coalesce((l.data->>'Hidden')::boolean, false) = false
      and exists (
        select 1 from jsonb_array_elements(coalesce(l.data->'Media', '[]'::jsonb)) m
        where coalesce(m->>'MediaCategory', 'Photo') <> 'Video' and m->>'VideoEmbed' is null)
      and not exists (
        select 1 from listings o
        where o.listing_key = l.data->>'CopiedFrom' and o.standard_status = 'Active' and o.owner_account_id is null)))`,
  ];
  // (Only commas in the box is nothing to look for: no homes, not every home.)
  if (filters.q) conditions.push(placeWords(filters.q).length ? matchesPlace(filters.q) : sql`false`);
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
