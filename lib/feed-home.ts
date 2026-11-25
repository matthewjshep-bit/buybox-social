import type { Listing } from "./listings/types";
import { cardPhotos, type CardPhoto } from "./profile";

// What a card in a feed is made of: who did something, and a home as a card
// shows it. Shared by the home feed (lib/home-feed.ts) and posts (lib/posts.ts).

// `photo`: their own, where they've added one, in place of their initial.
// (`client`: to an agent looking at their own feed, one of their own clients.)
export type FeedWho = {
  name: string;
  face: string;
  profileId: string | null;
  agent: boolean;
  photo: string | null;
  client?: boolean;
};

// A home as a card shows it: the facts, and the photo it's about (the one
// with the newest thing they liked, else the first), large; then the rest of
// its photos to swipe through (a few: full screen has them all), and how
// many it has in all.
export type FeedHome = {
  key: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  active: boolean;
  photo: { url: string; index: number; alt: string; width?: number; height?: number } | null;
  photos: CardPhoto[];
  photoCount: number;
};

// A home as a card shows it, from the listing: its first photo, large, and
// the rest after it.
export function feedHomeOf(listing: Listing): FeedHome {
  const sorted = { ...listing, Media: [...(listing.Media ?? [])].sort((a, b) => a.Order - b.Order) };
  const swipe = cardPhotos(sorted);
  const first = swipe.photos[0];
  return {
    key: listing.ListingKey,
    address: listing.UnparsedAddress,
    city: listing.City ?? "",
    price: listing.ListPrice ?? 0,
    beds: listing.BedroomsTotal ?? 0,
    baths: listing.BathroomsTotalInteger ?? 0,
    sqft: listing.LivingArea ?? 0,
    active: listing.StandardStatus === "Active",
    photo: first ?? null,
    photos: swipe.photos,
    photoCount: swipe.count,
  };
}
