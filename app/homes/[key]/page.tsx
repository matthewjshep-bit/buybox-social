import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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

// Opened directly or refreshed. From the homepage, the same content opens in a
// pop-out instead: see app/@modal/(.)homes.
export default async function HomePage({ params }: Props) {
  const { key } = await params;
  return (
    <div className="mx-auto max-w-5xl px-0 pb-10 sm:px-5">
      <nav className="flex items-center justify-between px-4 py-3 sm:px-0">
        <Link href="/" className="flex min-h-11 items-center gap-1.5 font-medium">
          <ArrowLeft aria-hidden size={18} /> All homes
        </Link>
        <span className="font-display text-lg font-semibold">BuyBox Social</span>
      </nav>
      <main className="overflow-hidden bg-white shadow-sm ring-1 ring-stone-200 sm:rounded-2xl">
        <ListingDetail listingKey={decodeURIComponent(key)} />
      </main>
    </div>
  );
}
