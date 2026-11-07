import { Bath, Bed, Ruler } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";

export function ListingFacts({ listing }: { listing: Listing }) {
  const offMarket = listing.StandardStatus !== "Active";
  return (
    <>
      {offMarket && (
        <p className="mb-2 inline-block rounded-full bg-stone-800 px-3 py-1 text-xs font-semibold text-white">
          {listing.StandardStatus}
        </p>
      )}
      <p className="font-display text-3xl tabular-nums">{formatPrice(listing.ListPrice)}</p>
      <h2 className="mt-1 font-medium">
        {listing.UnparsedAddress}
        <span className="block text-sm font-normal text-muted">
          {listing.City}, {listing.StateOrProvince} {listing.PostalCode}
        </span>
      </h2>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
        <li className="flex items-center gap-1.5">
          <Bed aria-hidden size={16} /> {listing.BedroomsTotal} {listing.BedroomsTotal === 1 ? "bed" : "beds"}
        </li>
        <li className="flex items-center gap-1.5">
          <Bath aria-hidden size={16} /> {listing.BathroomsTotalInteger}{" "}
          {listing.BathroomsTotalInteger === 1 ? "bath" : "baths"}
        </li>
        <li className="flex items-center gap-1.5">
          <Ruler aria-hidden size={16} /> {listing.LivingArea.toLocaleString("en-US")} sq ft
        </li>
      </ul>
      {listing.PublicRemarks && (
        <p className="mt-3 text-body leading-relaxed text-stone-700">{listing.PublicRemarks}</p>
      )}
    </>
  );
}
