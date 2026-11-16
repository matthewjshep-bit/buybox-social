import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// An agent's listings as a board: photo, price, beds and baths, address. Each
// opens them all full screen (the reel), on that one, in this order. Nothing
// sits on the photos; the words are under them.
export function ListingGrid({ listings, from }: { listings: Listing[]; from: string }) {
  return (
    <ul aria-label="Listings" className="grid grid-cols-2 gap-x-2.5 gap-y-5">
      {listings.map((listing, i) => {
        const photo = listing.Media[0];
        // An odd one out leads, full width.
        const lead = i === 0 && listings.length % 2 === 1;
        return (
          <li key={listing.ListingKey} className={lead ? "col-span-2" : undefined}>
            <Link
              href={`/reel?${new URLSearchParams({ from, home: listing.ListingKey })}`}
              className="group block rounded-[14px] focus-visible:outline-offset-2"
            >
              <span
                className={`relative block overflow-hidden rounded-[14px] bg-stone-200 ${lead ? "aspect-[3/2]" : "aspect-square sm:aspect-[4/3]"}`}
              >
                {photo && (
                  <Image
                    src={photo.MediaURL}
                    alt=""
                    fill
                    priority={i < 2}
                    sizes={lead ? "(min-width: 1024px) 600px, 100vw" : "(min-width: 1024px) 295px, 50vw"}
                    className="object-cover"
                  />
                )}
              </span>
              <span className="mt-1.5 block px-0.5 font-display text-lg leading-tight">{formatPrice(listing.ListPrice)}</span>
              <span className="block px-0.5 text-meta text-stone-700">
                {count(listing.BedroomsTotal, "bed")} · {count(listing.BathroomsTotalInteger, "bath")}
              </span>
              <span className="block truncate px-0.5 text-meta text-muted group-hover:underline">
                {listing.UnparsedAddress}, {listing.City}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
