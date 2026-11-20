import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { absoluteUrl, ownListingJson } from "@/lib/api/serialize";
import { removeOwnListingPhoto } from "@/lib/own-listing-writes";
import { getOwnListing, photosOf } from "@/lib/own-listings";

// A photo off one of the agent's own listings. It's named by the id it was
// added with (POST /listings/{key}/photos gives it back), or by its address
// as the listing's "photos" give it (URL-encoded), since a photo that came
// with a copy of an MLS listing has no id of its own. Photos only: a video
// is taken off on the Listings page, which can also clear it out of file
// storage.
export const dynamic = "force-dynamic";

const KEY_MOST = 100;
const PHOTO_ID_MOST = 2000;

const noListing = () => new ApiError(404, "not_found", "We couldn't find that listing among yours.");
const noPhoto = () => new ApiError(404, "not_found", "That photo isn't on this listing.");

// A part of the address as it was meant, whether or not it was decoded
// already on the way in.
function plain(raw: string | undefined) {
  const text = raw ?? "";
  try {
    return decodeURIComponent(text).trim();
  } catch {
    return text.trim();
  }
}

export const DELETE = apiRoute<{ key: string; photoId: string }>(async ({ agent, params }) => {
  const key = plain(params.key);
  if (!key || key.length > KEY_MOST) throw noListing();
  const mine = await getOwnListing(agent.id, key);
  if (!mine) throw noListing();

  const asked = [params.photoId ?? "", plain(params.photoId)].filter((id) => id && id.length <= PHOTO_ID_MOST);
  if (asked.length === 0) throw noPhoto();
  const photo = photosOf(mine.listing).find((item) =>
    asked.some((id) => id === item.MediaKey || id === item.MediaURL || id === absoluteUrl(item.MediaURL)),
  );
  if (!photo) throw noPhoto();

  // (A photo goes by its key, or its address when it has none: as the
  // Listings page removes it.)
  const removed = await removeOwnListingPhoto(agent.id, key, photo.MediaKey ?? photo.MediaURL);
  if ("error" in removed) throw noListing();

  const now = await getOwnListing(agent.id, key);
  if (!now) throw noListing();
  return apiJson({ listing: ownListingJson(now) });
});
