import { Eye, Flame, MessageCircle, ThumbsUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { activeLabel, formatPrice } from "@/lib/format";
import { isSampleListing } from "@/lib/listings/types";
import type { HomeCard } from "@/lib/public";

// Every active listing, busiest first. Counts include anonymous totals from
// private client shares; the words in those threads never appear here. Only
// positive or neutral signals show, so no card warns anyone off a home.
export function HomeGrid({ cards }: { cards: HomeCard[] }) {
  return (
    <section id="homes" aria-labelledby="homes-title" className="mt-16 scroll-mt-6">
      <h2 id="homes-title" className="font-display text-3xl">
        Homes people are talking about
      </h2>
      <p className="mt-1 text-stone-700">Tap a home to see what people think and add your take.</p>

      {cards.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          No active listings right now.
        </p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ listing, publicTotals, privateTotals, buzz }, index) => {
            const likes = publicTotals.likes + privateTotals.likes;
            const comments = publicTotals.comments + privateTotals.comments;
            const active = activeLabel(buzz.lastActivityAt);
            return (
              <li key={listing.ListingKey}>
                <Link
                  href={`/homes/${encodeURIComponent(listing.ListingKey)}`}
                  scroll={false}
                  className="group block overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-[4/3] bg-stone-200">
                    <Image
                      src={listing.Media[0]?.MediaURL}
                      alt=""
                      fill
                      priority={index < 3}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 330px"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    {isSampleListing(listing) && (
                      <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                        Sample
                      </span>
                    )}
                    {active && (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-stone-900 shadow">
                        <Flame aria-hidden size={13} className="text-orange-700" />
                        {active}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-display text-2xl tabular-nums">{formatPrice(listing.ListPrice)}</p>
                    <p className="mt-0.5 text-sm text-stone-700">
                      {listing.BedroomsTotal} bd · {listing.BathroomsTotalInteger} ba ·{" "}
                      {listing.LivingArea.toLocaleString("en-US")} sq ft
                    </p>
                    <p className="mt-0.5 truncate font-medium">
                      {listing.UnparsedAddress}, {listing.City}
                    </p>
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-200 pt-3 text-sm text-stone-700 [&>span]:whitespace-nowrap">
                      {likes + comments + buzz.views === 0 ? (
                        <span>Be the first to react</span>
                      ) : (
                        <>
                          {likes > 0 && (
                            <span className="flex items-center gap-1.5">
                              <ThumbsUp aria-hidden size={15} className="text-emerald-700" />
                              {likes} {likes === 1 ? "like" : "likes"}
                            </span>
                          )}
                          {comments > 0 && (
                            <span className="flex items-center gap-1.5">
                              <MessageCircle aria-hidden size={15} />
                              {comments} {comments === 1 ? "comment" : "comments"}
                            </span>
                          )}
                          {buzz.views > 0 && (
                            <span className="flex items-center gap-1.5">
                              <Eye aria-hidden size={15} />
                              {buzz.views} {buzz.views === 1 ? "view" : "views"}
                            </span>
                          )}
                        </>
                      )}
                      <span className="ml-auto font-semibold text-brand group-hover:underline">
                        Join in
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
