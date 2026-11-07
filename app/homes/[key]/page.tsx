import type { Metadata } from "next";
import { ListingDetail } from "@/components/listing-detail";
import { formatPrice } from "@/lib/format";
import { getPublicListing } from "@/lib/public";
import { homeFacts } from "./preview";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const data = await getPublicListing(decodeURIComponent(key));
  if (!data) return { title: "Home not found · BuyBox Social" };
  const { listing } = data;
  const place = `${listing.UnparsedAddress}, ${listing.City}`;
  // The listing alone, like its picture: no names, nothing anyone said.
  const description = `${[formatPrice(listing.ListPrice), homeFacts(listing)].filter(Boolean).join(" · ")}. See what people think.`;
  return {
    title: `${place} · BuyBox Social`,
    description,
    openGraph: { title: place, description, type: "website", siteName: "BuyBox Social" },
    twitter: { card: "summary_large_image", title: place, description },
  };
}

// A home's own link: that home full screen, then the feed carries on from it.
// From the map, the same home opens in a pop-out instead: see app/@modal/(.)homes.
export default async function HomePage({ params }: Props) {
  const { key } = await params;
  return <ListingDetail listingKey={decodeURIComponent(key)} />;
}
