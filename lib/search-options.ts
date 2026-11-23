// Search filters and their options. Kept free of server code, so the search
// page's browser code can use them too. Filters live in the URL, so a search
// can be bookmarked or shared.

// Reactions first: this is where people come to see what others think.
export const SORTS = {
  reactions: "Most reactions",
  liked: "Most liked",
  talked: "Most talked about",
  viewed: "Most viewed",
  newest: "Newest",
  "price-asc": "Price (low to high)",
  "price-desc": "Price (high to low)",
} as const;
export type Sort = keyof typeof SORTS;

export const HOME_TYPES = {
  house: { label: "Houses", value: "Single Family Residence" },
  townhouse: { label: "Townhouses", value: "Townhouse" },
} as const;
type HomeType = keyof typeof HOME_TYPES;

// Who put the home up: an agent or an investor here, themselves, or the MLS.
export const LISTED_BY = {
  agent: "An agent",
  investor: "An investor",
  mls: "The MLS",
} as const;
export type ListedBy = keyof typeof LISTED_BY;

export const MIN_SQFT = [1_000, 1_500, 2_000, 2_500, 3_000, 4_000];

export type SearchFilters = {
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  beds: number | null;
  baths: number | null;
  type: HomeType | null;
  by: ListedBy | null;
  minSqft: number | null;
  liked: boolean;
  // Sold (closed) homes instead of those for sale. "Sold" and "closed" are the
  // same thing here: a deal marked Closed is a sold home.
  sold: boolean;
  sort: Sort;
};

// Typed in the box, either word means the sold homes ("sold", "closed bellevue").
const SOLD_WORDS = /(^|[\s,.])(sold|closed)(?=$|[\s,.])/gi;

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const positiveInt = (value: string, max: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

export function parseFilters(params: Params): SearchFilters {
  const sort = one(params.sort);
  const type = one(params.type);
  const by = one(params.by);
  const typed = one(params.q).trim().slice(0, 100);
  const status = one(params.status).toLowerCase();
  const soldTyped = SOLD_WORDS.test(typed);
  SOLD_WORDS.lastIndex = 0;
  return {
    q: soldTyped ? typed.replace(SOLD_WORDS, " ").replace(/\s+/g, " ").trim() : typed,
    minPrice: positiveInt(one(params.minPrice), 100_000_000),
    maxPrice: positiveInt(one(params.maxPrice), 100_000_000),
    beds: positiveInt(one(params.beds), 10),
    baths: positiveInt(one(params.baths), 10),
    type: type in HOME_TYPES ? (type as HomeType) : null,
    by: by in LISTED_BY ? (by as ListedBy) : null,
    minSqft: positiveInt(one(params.minSqft), 1_000_000),
    liked: one(params.liked) === "1",
    sold: one(params.sold) === "1" || status === "sold" || status === "closed" || soldTyped,
    sort: sort in SORTS ? (sort as Sort) : "reactions",
  };
}

// How many of the filters behind "Filters" are on (not price, beds, baths or type).
export const moreFiltersOn = (filters: SearchFilters) =>
  [filters.by, filters.minSqft, filters.liked].filter(Boolean).length;

// Filters as they go in a link ("beds=3&maxPrice=1000000"), defaults left out.
export function filtersQuery(filters: SearchFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === "" || value === false) continue;
    if (key === "sort" && value === "reactions") continue;
    params.set(key, value === true ? "1" : String(value));
  }
  return params.toString();
}
