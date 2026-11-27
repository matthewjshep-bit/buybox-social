import { Home, Plus, Send, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Loading, Placeholder } from "@/components/route-state";
import { EmptyState } from "@/components/ui";
import { getAgentListings } from "@/lib/agent-listings";
import { requireAgent, type Agent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { getListingsLook, getOwnListings, getPinnedListings, photosOf } from "@/lib/own-listings";
import { button, card, link, pageTitle, sectionTitle } from "@/lib/ui";
import { editMlsListing } from "./actions";
import { RemoveFound } from "./find";
import { FeatureButton } from "./look";
import { listingWords } from "@/lib/kinds";

export const metadata = { title: "Listings · Porchcard" };

// Everything on an agent's Listings tab, in one place: the listings they
// added themselves (typed in: theirs to change; found by address: theirs to
// take off), and the ones that come from the MLS by their ID (Edit makes
// their own copy of one, which then stands in for it). One big button adds
// one. Each that's on their profile and for sale has Send beside it: the way
// to a link for a client, with that home already picked.
// The title and the button come at once; the rows (a few reads) follow, their
// shape held in the meantime.
export default async function ListingsPage() {
  const agent = await requireAgent();
  // An investor's are deals; everyone else's, listings.
  const words = listingWords(agent.kind);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className={pageTitle}>{words.Mine}</h1>
        <Link href="/dashboard/listings/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Plus aria-hidden size={20} /> Add a {words.one}
        </Link>
      </div>
      <Suspense fallback={<ListingsLoading many={words.many} />}>
        <Listings agent={agent} />
      </Suspense>
    </>
  );
}

// The shape of a few rows, while they're read.
function ListingsLoading({ many }: { many: string }) {
  return (
    <div aria-busy>
      <Loading what={`your ${many}`} />
      <Placeholder className="mt-4 h-4 w-72 max-w-full" />
      <ul aria-hidden className={cn(card, "mt-6 divide-y divide-stone-200")}>
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center md:gap-4">
            <span className="flex min-w-0 flex-1 items-start gap-4 md:items-center">
              <span className="block h-16 w-24 shrink-0 animate-pulse rounded-xl bg-stone-200" />
              <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                <Placeholder className="h-4 w-4/5" />
                <Placeholder className="h-3.5 w-1/2" />
              </span>
            </span>
            <span className="flex gap-2">
              <Placeholder className="h-11 w-24" />
              <Placeholder className="h-11 w-20" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Listings({ agent }: { agent: Agent }) {
  const words = listingWords(agent.kind);
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
  // Whether any row has a star to explain (only one that's on their profile does).
  const starred = found.length + fromMls.length > 0 || own.some(({ listing, active }) => active && photosOf(listing).length > 0);
  // Whether one of those rows has the star now (the one that leads may have
  // been hidden since, or taken off).
  const leading =
    look.featured !== null &&
    (found.some((listing) => listing.ListingKey === look.featured) ||
      fromMls.some((listing) => listing.ListingKey === look.featured) ||
      own.some(({ listing, active }) => listing.ListingKey === look.featured && active && photosOf(listing).length > 0));
  return (
    <>
      {/* What the star on a row is for, said once (on a touch screen nothing else
          says it). How they're laid out on their profile is among their
          profile's settings. */}
      {added + fromMls.length > 0 && (
        <p className="mt-3 text-body text-stone-700">
          {starred && (
            <>
              <Star
                aria-hidden
                size={16}
                className={cn("-mt-0.5 mr-1 inline", leading ? "fill-current text-amber-500" : "text-stone-500")}
              />
              {leading
                ? `The starred ${words.one} shows first on your profile.`
                : `Tap the star on a ${words.one} to show it first on your profile.`}{" "}
            </>
          )}
          <Link href="/people/me/edit#layout" className={link}>
            Change the layout
          </Link>
        </p>
      )}
      {added === 0 && fromMls.length === 0 && (
        <EmptyState icon={Home} title={`Add your first ${words.one}`} className="mt-8">
          Your {words.many} show on your profile.
        </EmptyState>
      )}
      {added > 0 && (
        <section aria-labelledby="own-title" className="mt-6">
          {fromMls.length > 0 && (
            <h2 id="own-title" className={cn(sectionTitle, "mb-4")}>
              Added by you
            </h2>
          )}
          <ul aria-label={`Your ${words.many}`} className={cn(card, "divide-y divide-stone-200")}>
            {own.map(({ listing, active, closed }) => {
              const photo = photosOf(listing)[0];
              const status = !active ? "Hidden" : !photo ? "Add a photo to show it" : closed ? "Closed · On your profile" : "On your profile";
              return (
                <Row
                  key={listing.ListingKey}
                  listing={listing}
                  status={status}
                  good={active && Boolean(photo)}
                  // (A link takes only homes still for sale.)
                  send={active && Boolean(photo) && !closed}
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
                good
                send
                featured={look.featured === listing.ListingKey}
                href={`/homes/${encodeURIComponent(listing.ListingKey)}`}
                action={<RemoveFound listingKey={listing.ListingKey} address={listing.UnparsedAddress} />}
              />
            ))}
          </ul>
        </section>
      )}
      {fromMls.length > 0 && (
        <section aria-labelledby="mls-title" className={added > 0 ? "mt-10" : "mt-6"}>
          <h2 id="mls-title" className={sectionTitle}>
            From the MLS
          </h2>
          <p className="mb-4 mt-1 text-body text-stone-600">
            Matched by your MLS ID ({mlsId}).{" "}
            <Link href="/people/me/edit#details" className={link}>
              Change it
            </Link>
          </p>
          <ul aria-label="Listings from the MLS" className={cn(card, "divide-y divide-stone-200")}>
            {fromMls.map((listing) => (
              <Row
                key={listing.ListingKey}
                listing={listing}
                good
                send
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
// profile (said only on their own, where it can be otherwise: a found one or
// one from the MLS always is), and what can be done with it: the star (it
// leads their profile), Send, and Edit (or Remove). In the type of every
// other home row (the price in the display type), its buttons the 44px ones
// of a row. On a phone the buttons go under the words, so the address and the
// price are never cut short; side by side from a tablet up.
function Row({
  listing,
  status,
  good,
  send = false,
  href,
  action,
  featured,
}: {
  listing: Listing;
  // Where it stands, when it can be other than on their profile.
  status?: string;
  good: boolean;
  // It can go on a link: on their profile, and for sale.
  send?: boolean;
  // It leads their profile.
  featured: boolean;
  href: string;
  // "Edit" or "View" go where the address goes; anything else is its own button.
  action: "Edit" | "View" | ReactNode;
}) {
  const photo = photosOf(listing)[0];
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4 md:items-center">
        {/* The photo goes where the address does (for the pointer and a
            finger; the address is its one link for a screen reader). */}
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="relative block h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-200"
        >
          {photo && <Image src={photo.MediaURL} alt="" fill sizes="96px" className="object-cover" />}
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lead font-semibold leading-snug md:truncate">
            <Link href={href} className="underline-offset-4 hover:underline">
              {listing.UnparsedAddress}
            </Link>
          </h3>
          <p className="mt-0.5 text-body text-stone-700 md:truncate">
            <span className="font-display">{formatPrice(listing.ListPrice)}</span> · {listing.City}
          </p>
          {status && <p className={cn("mt-0.5 text-meta", good ? "text-emerald-700" : "text-amber-800")}>{status}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Only one that's on their profile can lead it. (On a phone the star
            sits at the row's far end, clear of the two buttons, and a little
            into the row's edge, so all three fit on one line at 360px.) */}
        {good && (
          <span className="order-last -mr-2 ml-auto md:order-none md:mx-0">
            <FeatureButton listingKey={listing.ListingKey} address={listing.UnparsedAddress} featured={featured} />
          </span>
        )}
        {send && (
          <Link
            href={`/send?home=${encodeURIComponent(listing.ListingKey)}`}
            aria-label={`Send ${listing.UnparsedAddress}`}
            className={cn(button({ kind: "secondary" }), "shrink-0")}
          >
            <Send aria-hidden size={18} /> Send
          </Link>
        )}
        {typeof action === "string" ? (
          <Link
            href={href}
            aria-label={`${action} ${listing.UnparsedAddress}`}
            className={cn(button({ kind: "secondary" }), "shrink-0")}
          >
            {action}
          </Link>
        ) : (
          action
        )}
      </div>
    </li>
  );
}
