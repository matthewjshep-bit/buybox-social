import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getAgentListings } from "@/lib/agent-listings";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn } from "@/lib/format";
import { backLink, card, pageTitle } from "@/lib/ui";
import { OWN_PHOTOS_MOST } from "@/lib/own-listings";
import { FindListing } from "../find";
import { EnterItYourself } from "../form";
import { listingWords } from "@/lib/kinds";

export const metadata = { title: "Add a listing · Porchcard" };

// A new listing, one way at a time: find it by its address or MLS number and
// tap Add (its facts and photos come with it). Only when it isn't there is
// the other way asked for, under the card: enter it yourself, photos and all,
// in one go (?manual=1 in the address keeps that open through a reload).
export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ manual?: string | string[] }> }) {
  const agent = await requireAgent();
  const { manual } = await searchParams;
  const [{ mls_agent_id: mlsId }] = await sql<{ mls_agent_id: string }[]>`
    select mls_agent_id from accounts where id = ${agent.id}`;
  // What's already on their Listings, so a search says so.
  const have = (await getAgentListings(mlsId.trim() || null, agent.full_name, agent.id)).map((listing) => listing.ListingKey);
  return (
    <>
      <Link href="/dashboard/listings" className={backLink}>
        <ArrowLeft aria-hidden size={18} /> {listingWords(agent.kind).Many}
      </Link>
      <h1 className={cn(pageTitle, "mt-2")}>Add a {listingWords(agent.kind).one}</h1>
      <section aria-labelledby="find-title" className={cn(card, "mt-6 p-5")}>
        <h2 id="find-title" className="mb-3 text-lg font-semibold">
          Find it
        </h2>
        <FindListing have={have} />
      </section>
      <EnterItYourself open={manual === "1"} most={OWN_PHOTOS_MOST} noun={listingWords(agent.kind).one} />
    </>
  );
}
