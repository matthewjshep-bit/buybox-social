import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { cn } from "@/lib/format";
import { getOwnListing, OWN_PHOTOS_MOST, OWN_VIDEOS_MOST, photosOf, VIDEO_MOST_BYTES, videosOf } from "@/lib/own-listings";
import { supabaseConfigured } from "@/lib/supabase/server";
import { backLink, button, card, pageTitle } from "@/lib/ui";
import { ListingForm } from "../form";
import { DeleteListing, ListingPhotos, ListingVideos } from "../photos";
import { listingWords } from "@/lib/kinds";

export const metadata = { title: "Edit listing · Porchcard" };

// One of an agent's own listings: its photos first (it isn't on their
// profile until it has one), its videos, then what it is, then the way to
// take it away.
export default async function EditListingPage({ params }: { params: Promise<{ key: string }> }) {
  const agent = await requireAgent();
  const { key } = await params;
  const own = await getOwnListing(agent.id, decodeURIComponent(key));
  if (!own) notFound();
  const { listing, active, closed } = own;
  const shown = active && photosOf(listing).length > 0;
  return (
    <>
      {/* The way back, and the way to it as everyone sees it, on one line:
          under them the address and where it stands, together. */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/listings" className={backLink}>
          <ArrowLeft aria-hidden size={18} /> {listingWords(agent.kind).Many}
        </Link>
        {shown && (
          <Link
            href={`/homes/${encodeURIComponent(listing.ListingKey)}`}
            className={cn(button({ kind: "ghost", flush: true }), "-mr-2 shrink-0")}
          >
            <ExternalLink aria-hidden size={16} /> View
          </Link>
        )}
      </div>
      <h1 className={cn(pageTitle, "mt-2")}>{listing.UnparsedAddress}</h1>
      <p className={cn("mt-1 text-body", shown ? "text-emerald-700" : "text-amber-800")}>
        {shown ? (closed ? "Closed · On your profile" : "On your profile") : active ? "Add a photo to show it on your profile" : "Hidden"}
      </p>

      <section aria-labelledby="photos-title" className={cn(card, "mt-5 p-5")}>
        <h2 id="photos-title" className="mb-3 text-lg font-semibold">
          Photos
        </h2>
        <ListingPhotos
          listingKey={listing.ListingKey}
          most={OWN_PHOTOS_MOST}
          photos={photosOf(listing).map((photo) => ({ key: photo.MediaKey ?? photo.MediaURL, url: photo.MediaURL }))}
        />
      </section>

      <section aria-labelledby="videos-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="videos-title" className="mb-3 text-lg font-semibold">
          Videos
        </h2>
        <ListingVideos
          listingKey={listing.ListingKey}
          most={OWN_VIDEOS_MOST}
          mostBytes={VIDEO_MOST_BYTES}
          canUpload={supabaseConfigured}
          videos={videosOf(listing).map((video) => ({
            key: video.MediaKey ?? video.MediaURL,
            label: video.ShortDescription ?? "Video",
            poster: video.VideoPoster ?? null,
          }))}
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
            closed,
            yearBuilt: listing.YearBuilt ? String(listing.YearBuilt) : "",
            arv: listing.AfterRepairValue ? String(listing.AfterRepairValue) : "",
            rehab: listing.EstimatedRehab ? String(listing.EstimatedRehab) : "",
            perSqft: !listing.HidePricePerSqFt,
          }}
        />
      </section>

      <div className="mt-4">
        <DeleteListing listingKey={listing.ListingKey} />
      </div>
    </>
  );
}
