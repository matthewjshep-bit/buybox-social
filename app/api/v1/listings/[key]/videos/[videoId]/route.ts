import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { absoluteUrl, ownListingJson } from "@/lib/api/serialize";
import { removeOwnListingPhoto, STORED_VIDEO } from "@/lib/own-listing-writes";
import { getOwnListing, videosOf } from "@/lib/own-listings";

// A video off one of the agent's own listings, by the id in its "videos"
// (or the address it was added with, URL-encoded). One uploaded on the
// Listings page is taken off there, which also clears it out of file storage.
export const dynamic = "force-dynamic";

const KEY_MOST = 100;
const ID_MOST = 2000;

const noListing = () => new ApiError(404, "not_found", "We couldn't find that listing among yours.");
const noVideo = () => new ApiError(404, "not_found", "That video isn't on this listing.");

function plain(raw: string | undefined) {
  const text = raw ?? "";
  try {
    return decodeURIComponent(text).trim();
  } catch {
    return text.trim();
  }
}

export const DELETE = apiRoute<{ key: string; videoId: string }>(async ({ agent, params }) => {
  const key = plain(params.key);
  if (!key || key.length > KEY_MOST) throw noListing();
  const mine = await getOwnListing(agent.id, key);
  if (!mine) throw noListing();

  const asked = [params.videoId ?? "", plain(params.videoId)].filter((id) => id && id.length <= ID_MOST);
  const video = videosOf(mine.listing).find((item) =>
    asked.some((id) => id === item.MediaKey || id === item.MediaURL || id === absoluteUrl(item.MediaURL)),
  );
  if (!video) throw noVideo();
  const id = video.MediaKey ?? video.MediaURL;
  if (!video.VideoEmbed && STORED_VIDEO.test(id)) {
    throw new ApiError(409, "conflict", "This video was uploaded on the site. Take it off on your Listings page.");
  }
  const removed = await removeOwnListingPhoto(agent.id, key, id);
  if ("error" in removed) throw noListing();
  const now = await getOwnListing(agent.id, key);
  if (!now) throw noListing();
  return apiJson({ listing: ownListingJson(now) });
});
