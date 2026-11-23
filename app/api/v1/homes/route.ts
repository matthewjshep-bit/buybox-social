import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { homeJson } from "@/lib/api/serialize";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { searchHomeKeys } from "@/lib/search";
import { HOME_TYPES, SORTS, type SearchFilters, type Sort } from "@/lib/search-options";
import { homesToSend } from "@/lib/send-search";

// Homes for sale, two ways. With only `q` (an address, a city, a ZIP, an MLS
// number): the homes Send homes finds for it, the agent's own listings among
// them and homes not brought in here yet (one of those is brought in when it
// goes on a link), so whatever a tool finds here it can send. With any filter
// or a sort: the search page's search, over the MLS homes here, in its order.
// Nothing anyone did (likes, comments) comes back, only the homes.
export const dynamic = "force-dynamic";

const LIMIT_DEFAULT = 20;
const LIMIT_MOST = 50;
const PRICE_MOST = 100_000_000;
const ROOMS_MOST = 10;

// A whole number from 1 to `most`, or null when it wasn't sent. Anything else
// is a mistake in the request, said about that parameter.
function wholeNumber(params: URLSearchParams, name: string, most: number, words: string) {
  const raw = params.get(name)?.trim();
  if (!raw) return null;
  // "$510,000" as well as "510000", as the site's own fields take it.
  const plain = raw.replace(/[$,\s]/g, "");
  const n = /^\d+$/.test(plain) ? Number(plain) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || n > most) {
    throw new ApiError(400, "invalid_request", `${words} is a whole number from 1 to ${most.toLocaleString("en-US")}.`, name);
  }
  return n;
}

function oneOf<T extends string>(params: URLSearchParams, name: string, options: Record<T, unknown>): T | null {
  const raw = params.get(name)?.trim().toLowerCase();
  if (!raw) return null;
  // (Own keys only, so "toString" isn't taken for a choice.)
  if (Object.hasOwn(options, raw)) return raw as T;
  throw new ApiError(400, "invalid_request", `${name} is one of: ${Object.keys(options).join(", ")}.`, name);
}

// The listings with these keys, in the order of the keys, as the search found
// them (MLS homes, and ones people added themselves that anyone may see).
async function listingsInOrder(keys: string[]): Promise<Listing[]> {
  if (keys.length === 0) return [];
  const rows = await sql<{ listing_key: string; data: Listing }[]>`
    select listing_key, data from listings
    where listing_key in ${sql(keys)}`;
  const byKey = new Map(rows.map((row) => [row.listing_key, row.data]));
  return keys.flatMap((key) => byKey.get(key) ?? []);
}

export const GET = apiRoute(async ({ agent, url }) => {
  const params = url.searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const limit = wholeNumber(params, "limit", LIMIT_MOST, "limit") ?? LIMIT_DEFAULT;
  const minPrice = wholeNumber(params, "min_price", PRICE_MOST, "min_price");
  const maxPrice = wholeNumber(params, "max_price", PRICE_MOST, "max_price");
  const beds = wholeNumber(params, "beds", ROOMS_MOST, "beds");
  const baths = wholeNumber(params, "baths", ROOMS_MOST, "baths");
  const type = oneOf<keyof typeof HOME_TYPES>(params, "type", HOME_TYPES);
  const sort = oneOf<Sort>(params, "sort", SORTS);

  const filtered = minPrice !== null || maxPrice !== null || beds !== null || baths !== null || type !== null;
  if (q && !filtered && sort === null) {
    const homes = await homesToSend(agent.id, q, { limit });
    return apiJson({ homes: homes.slice(0, limit).map(homeJson) });
  }

  const filters: SearchFilters = { q, minPrice, maxPrice, beds, baths, type, by: null, minSqft: null, liked: false, sold: false, sort: sort ?? "reactions" };
  const keys = await searchHomeKeys(filters);
  const homes = await listingsInOrder(keys.slice(0, limit));
  return apiJson({ homes: homes.map(homeJson) });
});
