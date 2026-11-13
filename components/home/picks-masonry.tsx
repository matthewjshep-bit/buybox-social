import { Compass } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn, formatPrice } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";
import { button } from "@/lib/ui";

// "More homes for you": homes picked by their taste, as a board of photos at
// their own shapes, two columns, filled left, right, left, right in the order
// they were picked (so the first is top left, and the reel they open goes in
// that same order). Each says why it's here, when there's a reason, and opens
// them all full screen on that one. Then the way to every home.

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
              sizes="(min-width: 1024px) 275px, 50vw"
              className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
            />
          )}
        </span>
        <span className="mt-1.5 block px-0.5 font-display text-base leading-tight">{formatPrice(listing.ListPrice)}</span>
        <span className="block truncate px-0.5 text-[12px] leading-4 text-muted group-hover:underline">
          {listing.UnparsedAddress}, {listing.City}
        </span>
        {reason && (
          <span className="mt-1 inline-flex max-w-full rounded-full bg-sky-50 px-2 py-0.5 text-[12px] font-medium leading-4 text-sky-900 ring-1 ring-sky-200">
            <span className="sr-only">Why this: </span>
            <span className="truncate">{reason}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

export function PicksMasonry({ picks, intro }: { picks: FeedPost[]; intro?: string }) {
  const columns = [picks.filter((_, i) => i % 2 === 0), picks.filter((_, i) => i % 2 === 1)];
  return (
    <section aria-labelledby="more-homes-title" className="flex flex-col gap-3">
      <div className="px-1">
        <h2 id="more-homes-title" className="text-[17px] font-semibold">
          More homes for you
        </h2>
        {intro && <p className="text-meta text-muted">{intro}</p>}
      </div>
      {picks.length > 0 && (
        <div className="flex items-start gap-2.5">
          {columns.map((column, c) => (
            <ul key={c} className={cn("flex min-w-0 flex-1 flex-col gap-4")}>
              {column.map((post, i) => (
                <Pin key={post.listing.ListingKey} post={post} eager={i === 0} />
              ))}
            </ul>
          ))}
        </div>
      )}
      <Link href="/reel" className={cn(button({ kind: "secondary" }), "mx-auto mt-1")}>
        <Compass aria-hidden size={17} /> Browse homes
      </Link>
    </section>
  );
}
