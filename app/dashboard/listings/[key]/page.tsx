import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { cn } from "@/lib/format";
import { getOwnListing, OWN_PHOTOS_MOST } from "@/lib/own-listings";
import { button, card } from "@/lib/ui";
import { ListingForm } from "../form";
import { DeleteListing, ListingPhotos } from "../photos";

export const metadata = { title: "Edit listing · Porchcard" };

// One of an agent's own listings: its photos first (it isn't on their
// profile until it has one), then what it is, then the way to take it away.
export default async function EditListingPage({ params }: { params: Promise<{ key: string }> }) {
  const agent = await requireAgent();
  const { key } = await params;
  const own = await getOwnListing(agent.id, decodeURIComponent(key));
  if (!own) notFound();
  const { listing, active } = own;
  const shown = active && listing.Media.length > 0;
  return (
    <>
      <Link href="/dashboard/listings" className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 font-medium hover:bg-black/5">
        <ArrowLeft aria-hidden size={18} /> Listings
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words font-display text-3xl">{listing.UnparsedAddress}</h1>
        {shown && (
          <Link href={`/homes/${encodeURIComponent(listing.ListingKey)}`} className={cn(button({ kind: "secondary" }), "shrink-0")}>
            <ExternalLink aria-hidden size={16} /> View
          </Link>
        )}
      </div>
      <p className={cn("mt-1 text-body", shown ? "text-emerald-700" : "text-amber-800")}>
        {shown ? "On your profile" : active ? "Add a photo to show it on your profile" : "Hidden"}
      </p>

      <section aria-labelledby="photos-title" className={cn(card, "mt-5 p-5")}>
        <h2 id="photos-title" className="mb-3 text-lg font-semibold">
          Photos
        </h2>
        <ListingPhotos
          listingKey={listing.ListingKey}
          most={OWN_PHOTOS_MOST}
          photos={listing.Media.map((photo) => ({ key: photo.MediaKey ?? photo.MediaURL, url: photo.MediaURL }))}
        />
      </section>

      <section aria-labelledby="details-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="details-title" className="mb-3 text-lg font-semibold">
          Details
        </h2>
        <ListingForm
          listingKey={listing.ListingKey}
          values={{
            address: listing.UnparsedAddress,
            city: listing.City,
            state: listing.StateOrProvince,
            zip: listing.PostalCode,
            price: String(listing.ListPrice),
            beds: String(listing.BedroomsTotal),
            baths: String(listing.BathroomsTotalInteger),
            sqft: String(listing.LivingArea),
            about: listing.PublicRemarks ?? "",
            shown: active,
          }}
        />
      </section>

      <div className="mt-4">
        <DeleteListing listingKey={listing.ListingKey} />
      </div>
    </>
  );
}
