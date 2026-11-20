import { deleteImportedComment, homeKeyOf } from "@/lib/api/admin-engagement";
import { adminRoute } from "@/lib/api/http";

// A comment from someone brought in (or the owner) taken back, with any
// replies under it. Anyone else's stays: those are theirs to take back.
export const dynamic = "force-dynamic";

export const DELETE = adminRoute<{ key: string; id: string }>(async ({ params, owner }) => {
  await deleteImportedComment(homeKeyOf(params.key), params.id, owner);
  return new Response(null, { status: 204 });
});
