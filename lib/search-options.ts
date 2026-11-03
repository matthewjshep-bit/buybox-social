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

export const FEED_SORTS = {
  latest: "Latest",
  reactions: "Most reactions",
  liked: "Most liked",
  talked: "Most talked about",
  viewed: "Most viewed",
} as const;
export type FeedSort = keyof typeof FEED_SORTS;

export const parseFeedSort = (value: string | string[] | undefined): FeedSort => {
  const sort = Array.isArray(value) ? value[0] : value;
  return sort && sort in FEED_SORTS ? (sort as FeedSort) : "latest";
};

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
