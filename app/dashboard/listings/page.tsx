import { Home, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { getAgentListings } from "@/lib/agent-listings";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { getListingsLook, getOwnListings, getPinnedListings, photosOf } from "@/lib/own-listings";
import { button, card } from "@/lib/ui";
import { editMlsListing } from "./actions";
import { RemoveFound } from "./find";
import { FeatureButton, LayoutPicker } from "./look";

export const metadata = { title: "Listings · Porchcard" };

// Everything on an agent's Listings tab, in one place: the listings they
// added themselves (typed in: theirs to change; found by address: theirs to
// take off), and the ones that come from the MLS by their ID (Edit makes
// their own copy of one, which then stands in for it). One big button adds one.
export default async function ListingsPage() {
  const agent = await requireAgent();
  const [{ mls_agent_id: mlsId }] = await sql<{ mls_agent_id: string }[]>`
    select mls_agent_id from accounts where id = ${agent.id}`;
  const [own, found, look, matched] = await Promise.all([
    getOwnListings(agent.id),
    getPinnedListings(agent.id),
    getListingsLook(agent.id),
    // (Only the MLS's: with no account given, none of their own.)
    getAgentListings(mlsId.trim() || null, agent.full_name),
  ]);
  // (One they also found themselves is listed once, with theirs.)
  // (Nor one they've made their own copy of, to change: the copy is with theirs.)
  const copied = new Set(own.map(({ listing }) => listing.CopiedFrom));
  const fromMls = matched.filter(
    (listing) => !copied.has(listing.ListingKey) && !found.some((mine) => mine.ListingKey === listing.ListingKey),
  );
  const added = own.length + found.length;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="font-display text-4xl">Listings</h1>
        <Link href="/dashboard/listings/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Plus aria-hidden size={20} /> Add a listing
        </Link>
      </div>
      {/* How they're laid out on their profile: there once there's something to lay out. */}
      {added + fromMls.length > 0 && (
        <div className="mt-5">
          <LayoutPicker layout={look.layout} />
        </div>
      )}
      {added === 0 && fromMls.length === 0 && (
        <EmptyState icon={Home} title="Add your first listing" className="mt-8">
          Your listings show on your profile.
        </EmptyState>
      )}
      {added > 0 && (
        <section aria-labelledby="own-title" className="mt-6">
          {fromMls.length > 0 && (
            <h2 id="own-title" className="mb-2 px-1 text-lg font-semibold">
              Added by you
            </h2>
          )}
          <ul aria-label="Your listings" className={cn(card, "divide-y divide-stone-200")}>
            {own.map(({ listing, active, closed }) => {
              const photo = photosOf(listing)[0];
              const status = !active ? "Hidden" : !photo ? "Add a photo to show it" : closed ? "Closed · On your profile" : "On your profile";
              return (
                <Row
                  key={listing.ListingKey}
                  listing={listing}
                  status={status}
                  good={active && Boolean(photo)}
                  featured={look.featured === listing.ListingKey}
                  href={`/dashboard/listings/${listing.ListingKey}`}
                  action="Edit"
                />
              );
            })}
            {found.map((listing) => (
              <Row
                key={listing.ListingKey}
                listing={listing}
                status="On your profile"
                good
                featured={look.featured === listing.ListingKey}
                href={`/homes/${encodeURIComponent(listing.ListingKey)}`}
                action={<RemoveFound listingKey={listing.ListingKey} address={listing.UnparsedAddress} />}
              />
            ))}
          </ul>
        </section>
      )}
      {fromMls.length > 0 && (
        <section aria-labelledby="mls-title" className="mt-6">
          <h2 id="mls-title" className="px-1 text-lg font-semibold">
            From the MLS
          </h2>
          <p className="mb-2 px-1 text-body text-stone-600">
            Matched by your MLS ID ({mlsId}).{" "}
            <Link href="/dashboard/profile" className="font-semibold text-brand underline-offset-2 hover:underline">
              Change it
            </Link>
          </p>
          <ul aria-label="Listings from the MLS" className={cn(card, "divide-y divide-stone-200")}>
            {fromMls.map((listing) => (
              <Row
                key={listing.ListingKey}
                listing={listing}
                status="On your profile"
                good
                featured={look.featured === listing.ListingKey}
                href={`/homes/${encodeURIComponent(listing.ListingKey)}`}
                // Changing one makes their own copy of it, which takes its place.
                action={
                  <form action={editMlsListing.bind(null, listing.ListingKey)}>
                    <button
                      type="submit"
                      aria-label={`Edit ${listing.UnparsedAddress}`}
                      className={cn(button({ kind: "secondary" }), "shrink-0")}
                    >
                      Edit
                    </button>
                  </form>
                }
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// One listing: its photo, where it is, what it costs, whether it's on their
// profile, and the one thing to do with it.
function Row({
  listing,
  status,
  good,
  href,
  action,
  featured,
}: {
  listing: Listing;
  status: string;
  good: boolean;
  // It leads their profile.
  featured: boolean;
  href: string;
  // "Edit" or "View" go where the address goes; anything else is its own button.
  action: "Edit" | "View" | ReactNode;
}) {
  const photo = photosOf(listing)[0];
  return (
    <li className="flex items-center gap-4 p-4">
      <span className="relative block h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-200">
        {photo && <Image src={photo.MediaURL} alt="" fill sizes="96px" className="object-cover" />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold">
          <Link href={href} className="underline-offset-2 hover:underline">
            {listing.UnparsedAddress}
          </Link>
        </h3>
        <p className="truncate text-body text-stone-700">
          {formatPrice(listing.ListPrice)} · {listing.City}
        </p>
        <p className={cn("text-meta", good ? "text-emerald-700" : "text-amber-800")}>{status}</p>
      </div>
      {/* Only one that's on their profile can lead it. */}
      {good && <FeatureButton listingKey={listing.ListingKey} address={listing.UnparsedAddress} featured={featured} />}
      {typeof action === "string" ? (
        <Link href={href} aria-label={`${action} ${listing.UnparsedAddress}`} className={cn(button({ kind: "secondary" }), "shrink-0")}>
          {action}
        </Link>
      ) : (
        action
      )}
    </li>
  );
}
