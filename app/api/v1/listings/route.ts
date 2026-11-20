import { getAgentListings } from "@/lib/agent-listings";
import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { apiFieldName, newListingInput, newListingSchema } from "@/lib/api/photos";
import { homeJson, ownListingJson } from "@/lib/api/serialize";
import { createOwnListing, listingFacts } from "@/lib/own-listing-writes";
import { getOwnListing, getOwnListings, getPinnedListings } from "@/lib/own-listings";

// The agent's listings, as their Listings page has them: the ones they added
// themselves (theirs to change: "own"), the homes they found and put on their
// profile ("pinned"), and the ones from the MLS under their MLS ID and name
// ("mls"). Each home once: a copy they made of an MLS listing, to change it,
// stands in for the original. And a new listing of their own, checked and
// kept exactly as the Add a listing form keeps one.
export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ agent }) => {
  const mlsId = agent.mls_agent_id.trim() || null;
  const [own, pinned, matched] = await Promise.all([
    getOwnListings(agent.id),
    getPinnedListings(agent.id),
    // (Only the MLS's: with no account given, none of their own.)
    getAgentListings(mlsId, agent.full_name),
  ]);
  const copied = new Set(own.flatMap(({ listing }) => (listing.CopiedFrom ? [listing.CopiedFrom] : [])));
  const pinnedKeys = new Set(pinned.map((listing) => listing.ListingKey));
  const found = pinned.filter((listing) => !copied.has(listing.ListingKey));
  const fromMls = matched.filter((listing) => !copied.has(listing.ListingKey) && !pinnedKeys.has(listing.ListingKey));
  return apiJson({
    listings: [
      ...own.map((mine) => ({ ...ownListingJson(mine), source: "own" as const })),
      ...found.map((listing) => ({ ...homeJson(listing), source: "pinned" as const })),
      ...fromMls.map((listing) => ({ ...homeJson(listing), source: "mls" as const })),
    ],
  });
});

// A new listing. It's on their profile once it has a photo (POST
// /listings/{key}/photos), unless it's sent with "shown": false.
export const POST = apiRoute(
  async ({ agent, json }) => {
    const body = await json(newListingSchema);
    const checked = listingFacts(newListingInput(body));
    if ("error" in checked) {
      throw new ApiError(400, "invalid_request", checked.error, checked.field ? apiFieldName(checked.field) : undefined);
    }
    const made = await createOwnListing(agent, checked.facts);
    if ("error" in made) {
      throw made.limit
        ? new ApiError(422, "limit_reached", made.error)
        : new ApiError(400, "invalid_request", made.error);
    }
    const listing = await getOwnListing(agent.id, made.key);
    if (!listing) throw new Error(`listing ${made.key} wasn't there after it was made`);
    return apiJson({ listing: ownListingJson(listing) }, 201);
  },
  { idempotent: true, maxBytes: 64 * 1024 },
);
