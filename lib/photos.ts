// What's in each photo, as things you can like. Free of server code, so the
// browser can use it too.
import type { Listing, ListingMedia } from "./listings/types";
import type { Aspect } from "./reactions";

export const mediaKeyOf = (photo: ListingMedia) => photo.MediaKey ?? photo.MediaURL;

// The room first (the photo's main subject), then its features.
export const photoTags = (photo: ListingMedia) =>
  [photo.ImageOf, ...(photo.Features ?? [])].filter((tag): tag is string => Boolean(tag));

// One like (or dislike): a tag on a photo.
export const likeId = (mediaKey: string, tag: string) => `${mediaKey}\u0000${tag}`;

// Liking a thing, not liking it, or neither.
export type SpotReaction = "like" | "dislike" | null;

// A home's facts can be liked, disliked and talked about just like what's in
// its photos: "the price", "the square footage". They go by this in place of a
// photo's media key.
export const FACTS = "facts";
export const FACT_TAGS = ["Price", "Bedrooms", "Bathrooms", "Square footage", "Address"] as const;
export type FactTag = (typeof FACT_TAGS)[number];
export const isFactTag = (tag: string): tag is FactTag => (FACT_TAGS as readonly string[]).includes(tag);

// The broad specific a liked fact counts toward, for taste and totals.
export const aspectOfFact = (tag: string): Aspect | null =>
  tag === "Price" ? "price" : tag === "Address" ? "location" : null;

// A spot tapped on a photo is named by exactly where it is: "@62.3,68.1", in
// percent across and down, to a tenth. Its heart stays right there. Likes and
// comments on it work like those on a named thing (from the list on the heart,
// "the kitchen"), so both share one set of tags.
const POINT = /^@(\d{1,3}(?:\.\d)?),(\d{1,3}(?:\.\d)?)$/;
export const isPointTag = (tag: string) => POINT.test(tag);
const percent = (v: number) => String(Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10);
export const pointTag = (x: number, y: number) => `@${percent(x)},${percent(y)}`;

// Where a tag sits in its photo, as fractions; null for the photo's subject
// ("Kitchen"), which is the whole photo.
export function tagPosition(photo: ListingMedia, tag: string): { x: number; y: number } | null {
  const point = POINT.exec(tag);
  if (point) return { x: Number(point[1]) / 100, y: Number(point[2]) / 100 };
  const spot = photo.Spots?.find((s) => s.tag === tag);
  return spot ? { x: spot.x, y: spot.y } : null;
}

// Something you can like or comment on in a photo: a named thing, or a spot.
export type PhotoSpot = { mediaKey: string; tag: string; x: number; y: number };

const nearest = <T extends { x: number; y: number }>(candidates: T[], x: number, y: number, radius: number) =>
  candidates
    .map((c) => ({ c, d: Math.hypot(c.x - x, c.y - y) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d)[0]?.c;

// What a tap at (x, y) lands on: a heart or comment already there, within
// `radius` (about a fingertip), so tapping it again works on that one; else a
// new spot exactly where the tap was. Nothing ever moves to somewhere else.
export function spotAt(photo: ListingMedia, x: number, y: number, used: string[] = [], radius = 0.025): PhotoSpot {
  const mediaKey = mediaKeyOf(photo);
  const placed = used.flatMap((tag) => {
    const at = tagPosition(photo, tag);
    return at ? [{ tag, ...at }] : [];
  });
  const hit = nearest(placed, x, y, radius);
  if (hit) return { mediaKey, tag: hit.tag, x: hit.x, y: hit.y };
  const tag = pointTag(x, y);
  return { mediaKey, tag, ...tagPosition(photo, tag)! };
}

// The known thing a tag is about: itself, for a named one; for a spot, the
// thing it's on, if it's close to one ("Front door"); else null.
export function thingOf(photo: ListingMedia | undefined, tag: string): string | null {
  if (!isPointTag(tag)) return tag;
  const at = photo && tagPosition(photo, tag);
  return (at && nearest(photo.Spots ?? [], at.x, at.y, 0.09)?.tag) ?? null;
}

// How a tag reads in words: the thing it's on, or the spot tag as it is (which
// reads as "a spot in a photo").
export const tagName = (photo: ListingMedia | undefined, tag: string) => thingOf(photo, tag) ?? tag;
export const tagNameIn = (listing: Listing, mediaKey: string, tag: string) =>
  tagName(listing.Media.find((m) => mediaKeyOf(m) === mediaKey), tag);

// Whether a tag can be liked or commented on in this photo.
export const isTagIn = (photo: ListingMedia, tag: string) => isPointTag(tag) || photoTags(photo).includes(tag);

// "the marble counters"; "a spot in the photo"
export const tagPhrase = (tag: string) => (isPointTag(tag) ? "a spot in the photo" : `the ${tag.toLowerCase()}`);

// A heading for it, in its photo: "Front door"; "This spot"
export const spotLabel = (photo: ListingMedia | undefined, tag: string) => thingOf(photo, tag) ?? "This spot";

// In a sentence: "the front door"; "this spot"
export const spotPhrase = (photo: ListingMedia | undefined, tag: string) => {
  const thing = thingOf(photo, tag);
  return thing ? tagPhrase(thing) : "this spot";
};

// A spot named in a sentence anywhere on the page: "the front door"; "a spot
// in photo 3"; "the price"
export function spotName(listing: Listing, spot: { mediaKey: string; tag: string }) {
  if (spot.mediaKey === FACTS) return tagPhrase(spot.tag);
  const index = listing.Media.findIndex((m) => mediaKeyOf(m) === spot.mediaKey);
  const thing = thingOf(listing.Media[index], spot.tag);
  if (thing) return tagPhrase(thing);
  return index >= 0 ? `a spot in photo ${index + 1}` : "a spot in a photo";
}

// Which broad specific a photo like counts toward, for taste and totals.
const ROOM_ASPECTS: [RegExp, Aspect][] = [
  [/kitchen/i, "kitchen"],
  [/bath/i, "bathrooms"],
  [/exterior|front|facade/i, "exterior"],
  [/yard|garden|patio|deck|lawn/i, "yard"],
  [/living|dining|bed|sitting|reading|family|office|den/i, "aesthetic"],
];
const FEATURE_ASPECTS: [RegExp, Aspect][] = [
  [/light|window/i, "light"],
  [/lawn|landscap|garden|deck|patio|courtyard|meadow|tree|evergreen|fence|flower/i, "yard"],
];

export function aspectOfTag(photo: ListingMedia, tag: string): Aspect | null {
  const match = (rules: [RegExp, Aspect][], text: string | undefined) =>
    text ? (rules.find(([pattern]) => pattern.test(text))?.[1] ?? null) : null;
  if (tag !== photo.ImageOf) {
    const own = match(FEATURE_ASPECTS, tag);
    if (own) return own;
  }
  return match(ROOM_ASPECTS, photo.ImageOf);
}

// Counts per photo and tag, and which ones you've liked; the same for dislikes.
export type PhotoLikes = {
  counts: Record<string, number>; // by likeId
  mine: string[]; // likeIds
  dislikes: Record<string, number>;
  mineDisliked: string[];
};

export const NO_PHOTO_LIKES: PhotoLikes = { counts: {}, mine: [], dislikes: {}, mineDisliked: [] };
