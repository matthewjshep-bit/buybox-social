import { sql } from "./db";
import { formatPrice } from "./format";
import type { Listing } from "./listings/types";
import { aspectLabel, topAspects, type Aspect, type AspectCounts, type ReactionState } from "./reactions";

// What someone tends to like, learned from their own public reactions: the
// specifics they pick, and the cities, prices and sizes of homes they like.
export type Taste = {
  likes: number;
  passes: number;
  liked: AspectCounts;
  disliked: AspectCounts;
  cities: string[];
  priceRange: [number, number] | null;
  bedsRange: [number, number] | null;
};

// Below this, there isn't enough to go on and ranking falls back to recency.
export const TASTE_MIN_REACTIONS = 3;

export async function getTaste(visitorId: string | null | undefined): Promise<Taste | null> {
  if (!visitorId) return null;
  const [rows, photoAspects] = await Promise.all([
    sql<(ReactionState & { listing_key: string; data: Listing })[]>`
      select r.listing_key, r.reaction, r.liked, r.disliked, l.data
      from public_reactions r join listings l on l.listing_key = r.listing_key
      where r.visitor_id = ${visitorId}`,
    // What they liked in photos counts too, once per home.
    sql<{ listing_key: string; aspect: Aspect }[]>`
      select distinct listing_key, aspect from public_photo_likes
      where visitor_id = ${visitorId} and aspect is not null`,
  ]);
  if (rows.length === 0 && photoAspects.length === 0) return null;

  const count = (counts: AspectCounts, aspects: (keyof AspectCounts)[]) => {
    for (const a of aspects) counts[a] = (counts[a] ?? 0) + 1;
  };
  const liked: AspectCounts = {};
  const disliked: AspectCounts = {};
  const cityCounts = new Map<string, number>();
  const prices: number[] = [];
  const beds: number[] = [];
  for (const { listing_key, aspect } of photoAspects) {
    const picked = rows.find((row) => row.listing_key === listing_key)?.liked ?? [];
    if (!picked.includes(aspect)) count(liked, [aspect]);
  }
  for (const row of rows) {
    count(liked, row.liked);
    count(disliked, row.disliked);
    if (row.reaction === "like") {
      cityCounts.set(row.data.City, (cityCounts.get(row.data.City) ?? 0) + 1);
      prices.push(row.data.ListPrice);
      beds.push(row.data.BedroomsTotal);
    }
  }
  return {
    likes: rows.filter((r) => r.reaction === "like").length,
    passes: rows.filter((r) => r.reaction === "dislike").length,
    liked,
    disliked,
    cities: [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).map(([city]) => city),
    priceRange: prices.length ? [Math.min(...prices), Math.max(...prices)] : null,
    bedsRange: beds.length ? [Math.min(...beds), Math.max(...beds)] : null,
  };
}

export const hasTaste = (taste: Taste | null): taste is Taste =>
  Boolean(taste && taste.likes + taste.passes >= TASTE_MIN_REACTIONS);

const shortPrice = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1000)}K`;

export const describePriceRange = ([low, high]: [number, number]) =>
  low === high ? formatPrice(low) : `${shortPrice(low)}–${shortPrice(high)}`;

export const describeBeds = ([low, high]: [number, number]) =>
  low === high ? `${low} beds` : `${low}–${high} beds`;

// How well a home fits someone's taste, and why, in words they'll recognize.
// `crowdLiked` is what other people liked about the home.
export function matchTaste(
  taste: Taste | null,
  listing: Pick<Listing, "City" | "ListPrice" | "BedroomsTotal">,
  crowdLiked: AspectCounts,
): { score: number; reasons: string[] } {
  if (!hasTaste(taste)) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  for (const [aspect] of topAspects(taste.liked, 3)) {
    if (crowdLiked[aspect]) {
      score += 2;
      reasons.push(aspectLabel(aspect));
    }
  }
  if (taste.cities.includes(listing.City)) {
    score += 1.5;
    reasons.push(listing.City);
  }
  if (taste.priceRange) {
    const [low, high] = taste.priceRange;
    if (listing.ListPrice >= low * 0.85 && listing.ListPrice <= high * 1.15) {
      score += 1;
      reasons.push("Your price range");
    }
  }
  if (taste.bedsRange) {
    const [low, high] = taste.bedsRange;
    if (listing.BedroomsTotal >= low && listing.BedroomsTotal <= high) score += 0.5;
  }
  return { score, reasons: reasons.slice(0, 3) };
}
