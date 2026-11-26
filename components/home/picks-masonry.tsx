import { Images } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn, formatPrice } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";
import { button } from "@/lib/ui";

// "Homes for you": homes picked by their taste, as a board of photos at
// their own shapes, two columns, filled left, right, left, right in the order
// they were picked (so the first is top left, and the reel they open goes in
// that same order). On a phone, one column in that order, each photo as wide
// as the page. Each says why it's here, when there's a reason, and opens
// them all full screen on that one. Then the way to every home, under the
// bar's own picture for it.

// Photos keep their shape, between a little taller than wide and a little wider.
const ratioOf = (width?: number, height?: number) =>
  width && height ? Math.min(4 / 3, Math.max(3 / 4, width / height)) : 4 / 3;

function Pin({ post, eager }: { post: FeedPost; eager: boolean }) {
  const { listing } = post;
  const photo = [...(listing.Media ?? [])].sort((a, b) => a.Order - b.Order)[0];
  const reason = post.reasons[0];
  return (
    <li>
      <Link
        href={`/reel?${new URLSearchParams({ from: "picks", home: listing.ListingKey })}`}
        className="group block rounded-[14px] focus-visible:outline-offset-2"
      >
        <span
          className="relative block overflow-hidden rounded-[14px] bg-stone-200"
          style={{ aspectRatio: String(ratioOf(photo?.ImageWidth, photo?.ImageHeight)) }}
        >
          {photo && (
            <Image
              src={photo.MediaURL}
              alt=""
              fill
              priority={eager}
              sizes="(min-width: 1024px) 275px, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
            />
          )}
        </span>
        <span className="mt-1.5 block px-0.5 font-display text-base leading-tight">{formatPrice(listing.ListPrice)}</span>
        <span className="block truncate px-0.5 text-meta leading-[18px] text-muted group-hover:underline">
          {listing.UnparsedAddress}, {listing.City}
        </span>
        {reason && (
          <span className="mt-1 inline-flex max-w-full rounded-full bg-sky-50 px-2 py-0.5 text-meta font-medium leading-[18px] text-sky-900 ring-1 ring-sky-200">
            <span className="sr-only">Why this: </span>
            <span className="truncate">{reason}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

export function PicksMasonry({ picks }: { picks: FeedPost[] }) {
  const columns = [picks.filter((_, i) => i % 2 === 0), picks.filter((_, i) => i % 2 === 1)];
  return (
    <section aria-labelledby="homes-for-you-title" className="flex flex-col gap-3">
      <h2 id="homes-for-you-title" className="text-lead font-semibold">
        Homes for you
      </h2>
      {picks.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-5 sm:hidden">
          {picks.map((post, i) => (
            <Pin key={post.listing.ListingKey} post={post} eager={i === 0} />
          ))}
        </ul>
      )}
      {picks.length > 0 && (
        <div className="hidden items-start gap-2.5 sm:flex">
          {columns.map((column, c) => (
            <ul key={c} className={cn("flex min-w-0 flex-1 flex-col gap-4")}>
              {column.map((post, i) => (
                <Pin key={post.listing.ListingKey} post={post} eager={i === 0} />
              ))}
            </ul>
          ))}
        </div>
      )}
      <Link href="/browse" className={cn(button({ kind: "secondary" }), "mx-auto mt-1")}>
        <Images aria-hidden size={17} /> Browse homes
      </Link>
    </section>
  );
}
