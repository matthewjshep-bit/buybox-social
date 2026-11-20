import { homeKeyOf, importedReactionSchema, setImportedReaction } from "@/lib/api/admin-engagement";
import { adminRoute, apiJson } from "@/lib/api/http";

// A like or pass on a whole home ("dislike" is a pass), with the specifics
// liked and disliked, for a person brought in (or "owner"); a null reaction
// takes it back. Set, not added: sending it again changes nothing.
export const dynamic = "force-dynamic";

export const PUT = adminRoute<{ key: string }>(async ({ params, json, owner }) => {
  const reaction = await setImportedReaction(homeKeyOf(params.key), await json(importedReactionSchema), owner);
  return apiJson({ reaction });
});
