import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { photoFrom, photoSchema } from "@/lib/api/photos";
import { absoluteUrl, ownListingJson } from "@/lib/api/serialize";
import { addOwnListingPhoto } from "@/lib/own-listing-writes";
import { getOwnListing, OWN_PHOTOS_MOST, photosOf } from "@/lib/own-listings";

// One more photo on one of the agent's own listings, at the end of its
// photos: by its https address (our server fetches it, and only from the
// public internet) or sent as a data URL. Either way it's kept as the
// Listings page keeps a photo: a JPEG no bigger than 1600 px along its long
// side, with nothing of the original file (where it was taken) left on it.
// A listing with a photo shows on their profile, unless they've hidden it.
export const dynamic = "force-dynamic";

const KEY_MOST = 100;

const notFound = () => new ApiError(404, "not_found", "We couldn't find that listing among yours.");
const full = () => new ApiError(422, "limit_reached", `A listing can have up to ${OWN_PHOTOS_MOST} photos. Remove one first.`);

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

export const POST = apiRoute<{ key: string }>(
  async ({ agent, params, json }) => {
    const key = keyOf(params.key);
    // Whether it's theirs, and has room, before any photo is fetched or read.
    const mine = await getOwnListing(agent.id, key);
    if (!mine) throw notFound();
    if (photosOf(mine.listing).length >= OWN_PHOTOS_MOST) throw full();

    const photo = await photoFrom(await json(photoSchema));
    const added = await addOwnListingPhoto(agent.id, key, photo.dataUrl, photo.width, photo.height);
    if ("error" in added) {
      // What changed while the photo was being made: the listing gone, or
      // filled up by another request.
      const now = await getOwnListing(agent.id, key);
      if (!now) throw notFound();
      if (photosOf(now.listing).length >= OWN_PHOTOS_MOST) throw full();
      throw new ApiError(400, "invalid_request", added.error);
    }

    const now = await getOwnListing(agent.id, key);
    if (!now) throw notFound();
    return apiJson(
      {
        photo: { id: added.id, url: absoluteUrl(added.url), width: photo.width, height: photo.height },
        listing: ownListingJson(now),
      },
      201,
    );
  },
  // (A photo sent as a data URL is a third bigger than the photo itself.)
  { idempotent: true, maxBytes: 12 * 1024 * 1024 },
);
