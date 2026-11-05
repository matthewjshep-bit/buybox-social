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
export type HomeType = keyof typeof HOME_TYPES;

export type SearchFilters = {
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  beds: number | null;
  baths: number | null;
  type: HomeType | null;
  liked: boolean;
  sort: Sort;
};

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const positiveInt = (value: string, max: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

export function parseFilters(params: Params): SearchFilters {
  const sort = one(params.sort);
  const type = one(params.type);
  return {
    q: one(params.q).trim().slice(0, 100),
    minPrice: positiveInt(one(params.minPrice), 100_000_000),
    maxPrice: positiveInt(one(params.maxPrice), 100_000_000),
    beds: positiveInt(one(params.beds), 10),
    baths: positiveInt(one(params.baths), 10),
    type: type in HOME_TYPES ? (type as HomeType) : null,
    liked: one(params.liked) === "1",
    sort: sort in SORTS ? (sort as Sort) : "reactions",
  };
}

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
