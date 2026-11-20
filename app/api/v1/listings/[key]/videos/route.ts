import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { ownListingJson, videoJson } from "@/lib/api/serialize";
import { videoFrom, videoSchema } from "@/lib/api/videos";
import { addOwnListingVideo } from "@/lib/own-listing-writes";
import { getOwnListing, OWN_VIDEOS_MOST, videosOf } from "@/lib/own-listings";

// One more video on one of the agent's own listings, after its photos: a
// YouTube, Vimeo or Loom link, or an https link straight to a video file
// (lib/api/videos.ts). It plays with the photos, wherever the listing shows.
export const dynamic = "force-dynamic";

const KEY_MOST = 100;

const notFound = () => new ApiError(404, "not_found", "We couldn't find that listing among yours.");
const full = () =>
  new ApiError(422, "limit_reached", `A listing can have up to ${OWN_VIDEOS_MOST} videos. Remove one first.`);

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

export const GET = apiRoute<{ key: string }>(async ({ agent, params }) => {
  const mine = await getOwnListing(agent.id, keyOf(params.key));
  if (!mine) throw notFound();
  return apiJson({ videos: videosOf(mine.listing).map(videoJson) });
});

export const POST = apiRoute<{ key: string }>(
  async ({ agent, params, json }) => {
    const key = keyOf(params.key);
    // Whether it's theirs, and has room, before anything is fetched.
    const mine = await getOwnListing(agent.id, key);
    if (!mine) throw notFound();
    if (videosOf(mine.listing).length >= OWN_VIDEOS_MOST) throw full();

    const video = await videoFrom((await json(videoSchema)).url);
    const added = await addOwnListingVideo(agent.id, key, video);
    if ("error" in added) {
      if (added.limit) throw full();
      if (added.duplicate) throw new ApiError(409, "conflict", added.error, "url");
      throw notFound();
    }
    const now = await getOwnListing(agent.id, key);
    if (!now) throw notFound();
    return apiJson({ video: videoJson(video), listing: ownListingJson(now) }, 201);
  },
  { idempotent: true },
);
