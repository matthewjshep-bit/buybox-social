import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getAgentListings } from "@/lib/agent-listings";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";
import { OWN_PHOTOS_MOST } from "@/lib/own-listings";
import { FindListing } from "../find";
import { NewListingForm } from "../form";

export const metadata = { title: "Add a listing · Porchcard" };

// A new listing, the quick way or by hand: find it by its address or MLS
// number and tap Add (its facts and photos come with it), or enter it
// yourself, photos and all, in one go.
export default async function NewListingPage() {
  const agent = await requireAgent();
  const [{ mls_agent_id: mlsId }] = await sql<{ mls_agent_id: string }[]>`
    select mls_agent_id from accounts where id = ${agent.id}`;
  // What's already on their Listings, so a search says so.
  const have = (await getAgentListings(mlsId.trim() || null, agent.full_name, agent.id)).map((listing) => listing.ListingKey);
  return (
    <>
      <Link href="/dashboard/listings" className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 font-medium hover:bg-black/5">
        <ArrowLeft aria-hidden size={18} /> Listings
      </Link>
      <h1 className="mt-2 font-display text-4xl">Add a listing</h1>
      <section aria-labelledby="find-title" className={cn(card, "mt-6 p-5")}>
        <h2 id="find-title" className="mb-3 text-lg font-semibold">
          Find it
        </h2>
        <FindListing have={have} />
      </section>
      <section aria-labelledby="enter-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="enter-title" className="mb-3 text-lg font-semibold">
          Or enter it yourself
        </h2>
        <NewListingForm most={OWN_PHOTOS_MOST} />
      </section>
    </>
  );
}
