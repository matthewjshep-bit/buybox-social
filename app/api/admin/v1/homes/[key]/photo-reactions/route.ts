import { homeKeyOf, importedPhotoReactionSchema, setImportedPhotoReaction } from "@/lib/api/admin-engagement";
import { adminRoute, apiJson } from "@/lib/api/http";

// A like or dislike on one thing in one photo (media_key, and a tag on it or
// a spot "@x,y" in percent), or on one of the home's facts (media_key
// "facts"), for a person brought in (or "owner"); null takes it back. A like
// replaces a dislike on the same thing, and the other way around.
export const dynamic = "force-dynamic";

export const PUT = adminRoute<{ key: string }>(async ({ params, json, owner }) => {
  const reaction = await setImportedPhotoReaction(
    homeKeyOf(params.key),
    await json(importedPhotoReactionSchema),
    owner,
  );
  return apiJson({ reaction });
});
