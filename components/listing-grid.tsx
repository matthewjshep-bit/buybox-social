import { Heart, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn, formatPrice } from "@/lib/format";
import type { ListingCounts } from "@/lib/listing-counts";
import type { Listing } from "@/lib/listings/types";
import type { ListingLayout } from "@/lib/own-listings";

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// Homes as a board (an agent's listings, the homes you saved): photo, price,
// beds and baths, address. Each opens them all full screen (the reel), on
// that one, in this order. Nothing sits on the photos but "Closed", on one
// that's no longer available; the words are under them. Laid out as its owner
// chose: one featured with the rest two across, a grid of two or three
// across, or a plain list.
export function ListingGrid({
  listings,
  from,
  label = "Listings",
  layout = "featured",
  edit,
  credit,
  counts,
}: {
  listings: Listing[];
  // Which homes the reel opens with (`/reel?from=`).
  from: string;
  label?: string;
  layout?: ListingLayout;
  // On their own profile: where a listing they added themselves is changed.
  edit?: (listing: Listing) => string | null;
  // Who listed it, said under a home someone else listed ("Listed by …").
  credit?: (listing: Listing) => string | null;
  // How many liked each home, and how many comments it has: said small, by its price.
  counts?: ListingCounts;
}) {
  const list = layout === "list";
  return (
    <ul
      aria-label={label}
      data-layout={layout}
      className={cn(
        list
          ? "flex flex-col divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200"
          : cn("grid gap-x-2.5 gap-y-5", layout === "grid3" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"),
      )}
    >
      {listings.map((listing, i) => {
        const photo = listing.Media[0];
        const lead = layout === "featured" && i === 0;
        const closed = listing.StandardStatus === "Closed";
        const editHref = edit?.(listing) ?? null;
        const by = credit?.(listing) ?? null;
        const tally = <Tally {...(counts?.get(listing.ListingKey) ?? { likes: 0, comments: 0 })} />;
        const href = `/reel?${new URLSearchParams({ from, home: listing.ListingKey })}`;
        if (list) {
          return (
            <li key={listing.ListingKey} className="flex items-center gap-3 p-3">
              <Link href={href} className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-offset-2">
                <span className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-stone-200">
                  {photo && <Image src={photo.MediaURL} alt="" fill priority={i < 3} sizes="112px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-lg leading-tight">{formatPrice(listing.ListPrice)}</span>
                    {closed && <Closed />}
                    {tally}
                  </span>
                  <span className="block text-meta text-stone-700">
                    {count(listing.BedroomsTotal, "bed")} · {count(listing.BathroomsTotalInteger, "bath")}
                  </span>
                  <span className="block truncate text-meta text-muted group-hover:underline">
                    {listing.UnparsedAddress}, {listing.City}
                  </span>
                  {by && <span className="block truncate text-meta text-muted">{by}</span>}
                </span>
              </Link>
              {editHref && <EditLink href={editHref} address={listing.UnparsedAddress} />}
            </li>
          );
        }
        return (
          <li key={listing.ListingKey} className={lead ? "col-span-full" : undefined}>
            <Link href={href} className="group block rounded-[14px] focus-visible:outline-offset-2">
              <span
                className={cn(
                  "relative block overflow-hidden rounded-[14px] bg-stone-200",
                  lead ? "aspect-[3/2] sm:aspect-[2/1]" : "aspect-square sm:aspect-[4/3]",
                )}
              >
                {photo && (
                  <Image
                    src={photo.MediaURL}
                    alt=""
                    fill
                    priority={i < 2}
                    sizes={lead ? "(min-width: 896px) 864px, 100vw" : "(min-width: 896px) 430px, 50vw"}
                    className="object-cover"
                  />
                )}
                {closed && (
                  <span className="absolute left-2 top-2">
                    <Closed />
                  </span>
                )}
              </span>
              <span className="mt-1.5 flex items-center gap-2 px-0.5">
                <span className="font-display text-lg leading-tight">{formatPrice(listing.ListPrice)}</span>
                {tally}
              </span>
              <span className="block px-0.5 text-meta text-stone-700">
                {count(listing.BedroomsTotal, "bed")} · {count(listing.BathroomsTotalInteger, "bath")}
              </span>
              <span className="block truncate px-0.5 text-meta text-muted group-hover:underline">
                {listing.UnparsedAddress}, {listing.City}
              </span>
              {by && <span className="block truncate px-0.5 text-meta text-muted">{by}</span>}
            </Link>
            {editHref && <EditLink href={editHref} address={listing.UnparsedAddress} />}
          </li>
        );
      })}
    </ul>
  );
}

// "♥ 4  💬 2", small and to the right: only what there's any of.
function Tally({ likes, comments }: { likes: number; comments: number }) {
  if (likes === 0 && comments === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2.5 text-meta font-medium tabular-nums text-stone-600">
      {likes > 0 && (
        <span className="flex items-center gap-1">
          <Heart aria-hidden size={14} className="fill-rose-600 text-rose-600" />
          {likes}
          <span className="sr-only">{likes === 1 ? "like" : "likes"}</span>
        </span>
      )}
      {comments > 0 && (
        <span className="flex items-center gap-1">
          <MessageCircle aria-hidden size={14} />
          {comments}
          <span className="sr-only">{comments === 1 ? "comment" : "comments"}</span>
        </span>
      )}
    </span>
  );
}

// No longer available: sold, or the deal done.
function Closed() {
  return <span className="rounded-full bg-stone-900 px-2 py-0.5 text-tiny font-semibold text-white">Closed</span>;
}

function EditLink({ href, address }: { href: string; address: string }) {
  return (
    <Link
      href={href}
      aria-label={`Edit ${address}`}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 px-0.5 text-sm font-semibold text-brand underline-offset-2 hover:underline"
    >
      Edit
    </Link>
  );
}
