import { homeKeyOf, addImportedComment, importedCommentSchema } from "@/lib/api/admin-engagement";
import { adminRoute, apiJson } from "@/lib/api/http";

// A comment on a home's page from a person brought in (or "owner"): about
// the home, a spot in one of its photos (media_key and spot), or answering a
// comment or someone's likes (parent), dated when it was really said (at).
// Send an Idempotency-Key, so a retry doesn't say it twice.
export const dynamic = "force-dynamic";

export const POST = adminRoute<{ key: string }>(
  async ({ params, json, owner }) => {
    const comment = await addImportedComment(homeKeyOf(params.key), await json(importedCommentSchema), owner);
    return apiJson({ comment }, 201);
  },
  { idempotent: true },
);
