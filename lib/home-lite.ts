import type { Listing } from "./listings/types";

// A home as the composer holds it: enough for a row (its first photo, price,
// address) and for sending it (its key). Light, so a list of them travels
// to the page cheaply.
export type HomeLite = {
  key: string;
  address: string;
  city: string;
  price: number;
  beds: number | null;
  baths: number | null;
  photo: string | null;
};

export const homeLiteOf = (listing: Listing): HomeLite => {
  const photo = [...(listing.Media ?? [])].sort((a, b) => a.Order - b.Order).find((m) => m.MediaURL)?.MediaURL ?? null;
  return {
    key: listing.ListingKey,
    address: listing.UnparsedAddress,
    city: listing.City ?? "",
    price: listing.ListPrice ?? 0,
    beds: listing.BedroomsTotal ?? null,
    baths: listing.BathroomsTotalInteger ?? null,
    photo,
  };
};
