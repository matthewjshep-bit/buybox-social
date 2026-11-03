// What's in each photo, as things you can like. Free of server code, so the
// browser can use it too.
import type { ListingMedia } from "./listings/types";
import type { Aspect } from "./reactions";

export const mediaKeyOf = (photo: ListingMedia) => photo.MediaKey ?? photo.MediaURL;

// The room first (the photo's main subject), then its features.
export const photoTags = (photo: ListingMedia) =>
  [photo.ImageOf, ...(photo.Features ?? [])].filter((tag): tag is string => Boolean(tag));

// One like: a tag on a photo.
export const likeId = (mediaKey: string, tag: string) => `${mediaKey}\u0000${tag}`;

// "the marble counters"
export const tagPhrase = (tag: string) => `the ${tag.toLowerCase()}`;

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
  [/lawn|landscap|garden|deck|patio|courtyard|meadow|trees|evergreen|fence/i, "yard"],
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

// Counts per photo and tag, and which ones you've liked.
export type PhotoLikes = {
  counts: Record<string, number>; // by likeId
  mine: string[]; // likeIds
};

export const NO_PHOTO_LIKES: PhotoLikes = { counts: {}, mine: [] };
