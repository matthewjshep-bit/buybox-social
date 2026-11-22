import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { PhotoSwipe } from "@/components/photo-swipe";
import { Badge } from "@/components/ui";
import { cn, formatPrice } from "@/lib/format";
import type { ListingCounts } from "@/lib/listing-counts";
import type { Listing } from "@/lib/listings/types";
import type { ListingLayout } from "@/lib/own-listings";
import { cardPhotos } from "@/lib/profile";
import { card, link } from "@/lib/ui";

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// Homes as a board (an agent's listings, the homes you saved): photo, price,
// beds and baths, address. Each opens them all full screen (the reel), on
// that one, in this order. On the board a home's photos swipe sideways right
// there ("2 of 14"), and a tap opens it full screen on the one showing.
// Nothing else sits on the photos but "Closed", on one that's no longer
// available; the words are under them. Laid out as its owner chose: one
// featured with the rest two across, a grid of two or three across, or a
// plain list.
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
          ? cn(card, "flex flex-col divide-y divide-stone-200 overflow-hidden")
          : cn("grid gap-x-2.5 gap-y-5", layout === "grid3" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"),
      )}
    >
      {listings.map((listing, i) => {
        const lead = layout === "featured" && i === 0;
        const closed = listing.StandardStatus === "Closed";
        const editHref = edit?.(listing) ?? null;
        const by = credit?.(listing) ?? null;
        const tally = <Tally {...(counts?.get(listing.ListingKey) ?? { likes: 0, comments: 0 })} />;
        const href = `/reel?${new URLSearchParams({ from, home: listing.ListingKey })}`;
        const swipe = cardPhotos(listing);
        if (list) {
          return (
            <li key={listing.ListingKey} className="group flex items-center gap-3 p-3">
              <PhotoSwipe
                photos={swipe.photos}
                total={swipe.count}
                href={href}
                label={listing.UnparsedAddress}
                eager={i < 3}
                compact
                sizes="112px"
                className="h-20 w-28 shrink-0 rounded-xl bg-stone-200"
              />
              <Link href={href} className="flex min-h-20 min-w-0 flex-1 items-center rounded-xl focus-visible:outline-offset-2">
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
          // (The photos and the words are side by side in it, not one link:
          // the photos swipe, and their arrows are buttons.)
          <li key={listing.ListingKey} className={cn("group", lead && "col-span-full")}>
            <PhotoSwipe
              photos={swipe.photos}
              total={swipe.count}
              href={href}
              label={listing.UnparsedAddress}
              eager={i < 2}
              sizes={lead ? "(min-width: 896px) 864px, 100vw" : "(min-width: 896px) 430px, 50vw"}
              className={cn(
                "rounded-[14px] bg-stone-200",
                lead ? "aspect-[3/2] sm:aspect-[2/1]" : "aspect-square sm:aspect-[4/3]",
              )}
            >
              {closed && (
                <span className="pointer-events-none absolute left-2 top-2">
                  <Closed />
                </span>
              )}
            </PhotoSwipe>
            <Link href={href} className="mt-1.5 block rounded-[10px] focus-visible:outline-offset-2">
              <span className="flex items-center gap-2 px-0.5">
                <span className="font-display text-lg leading-tight">{formatPrice(listing.ListPrice)}</span>
                {/* (On the photo for the eye; said here too, on the link.) */}
                {closed && <span className="sr-only"> · Closed</span>}
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
  return <Badge tone="ink">Closed</Badge>;
}

function EditLink({ href, address }: { href: string; address: string }) {
  return (
    <Link
      href={href}
      aria-label={`Edit ${address}`}
      className={cn(link, "inline-flex min-h-11 shrink-0 items-center gap-1 px-0.5 text-sm")}
    >
      Edit
    </Link>
  );
}
