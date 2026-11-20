import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { apiFieldName, listingChangeSchema, listingInputFrom } from "@/lib/api/photos";
import { ownListingJson } from "@/lib/api/serialize";
import { deleteOwnListing, patchOwnListing, WITHDRAWN_INSTEAD } from "@/lib/own-listing-writes";
import { getOwnListing } from "@/lib/own-listings";

// One of the agent's own listings (a key starting "OWN-"), to read, change or
// take down: only ever one of theirs. Any other home is read with GET
// /homes/{key}, and isn't theirs to change here. Changes are checked and
// kept the same way the Listings page's edit form keeps them.
export const dynamic = "force-dynamic";

const KEY_MOST = 100;

const notFound = () => new ApiError(404, "not_found", "We couldn't find that listing among yours.");

// The key from the address, as it was given, or nothing worth looking up.
function keyOf(raw: string | undefined) {
  let key = raw ?? "";
  try {
    key = decodeURIComponent(key);
  } catch {
    // Already plain.
  }
  key = key.trim();
  if (!key || key.length > KEY_MOST) throw notFound();
  return key;
}

// One of theirs as it is now, or a 404.
async function theirs(agentId: string, key: string) {
  const mine = await getOwnListing(agentId, key);
  if (!mine) throw notFound();
  return mine;
}

export const GET = apiRoute<{ key: string }>(async ({ agent, params }) => {
  const mine = await theirs(agent.id, keyOf(params.key));
  return apiJson({ listing: ownListingJson(mine) });
});

// Only what's sent changes. A field that may be left out (description,
// year_built, arv, rehab) is cleared with null.
export const PATCH = apiRoute<{ key: string }>(async ({ agent, params, json }) => {
  const key = keyOf(params.key);
  await theirs(agent.id, key);
  const change = listingInputFrom(await json(listingChangeSchema));
  if (Object.keys(change).length === 0) {
    throw new ApiError(400, "invalid_request", "Send at least one field to change.");
  }
  const saved = await patchOwnListing(agent, key, change);
  if ("error" in saved) {
    // (Without a field, it's that the listing went in the meantime.)
    if (!saved.field) throw notFound();
    throw new ApiError(400, "invalid_request", saved.error, apiFieldName(saved.field));
  }
  return apiJson({ listing: ownListingJson(await theirs(agent.id, key)) });
});

// Gone for good, as Delete on the Listings page does it. One that's on a link
// they sent stays there for whoever has the link, hidden from their profile
// instead, and the answer says so.
export const DELETE = apiRoute<{ key: string }>(async ({ agent, params }) => {
  const gone = await deleteOwnListing(agent.id, keyOf(params.key));
  if ("error" in gone) throw notFound();
  if ("withdrawn" in gone) return apiJson({ withdrawn: true, message: WITHDRAWN_INSTEAD });
  return apiJson({ deleted: true });
});
