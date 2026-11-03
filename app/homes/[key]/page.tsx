import type { Metadata } from "next";
import { ListingDetail } from "@/components/listing-detail";
import { formatPrice } from "@/lib/format";
import { getPublicListing } from "@/lib/public";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const data = await getPublicListing(decodeURIComponent(key));
  if (!data) return { title: "Home not found · BuyBox Social" };
  const { listing } = data;
  return {
    title: `${listing.UnparsedAddress}, ${listing.City} · BuyBox Social`,
    description: `${formatPrice(listing.ListPrice)} · ${listing.BedroomsTotal} beds · ${listing.BathroomsTotalInteger} baths. See what people think.`,
  };
}

// A home's own link: that home full screen, then the feed carries on from it.
// From the map, the same home opens in a pop-out instead: see app/@modal/(.)homes.
export default async function HomePage({ params }: Props) {
  const { key } = await params;
  return <ListingDetail listingKey={decodeURIComponent(key)} />;
}
