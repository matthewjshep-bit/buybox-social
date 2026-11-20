import { deleteImportedVisitor } from "@/lib/api/admin-engagement";
import { adminRoute } from "@/lib/api/http";

// One person brought in, gone with every like, pass and comment they were
// given. Only someone brought in through POST /visitors: never a person who
// joined on their own.
export const dynamic = "force-dynamic";

export const DELETE = adminRoute<{ id: string }>(async ({ params }) => {
  await deleteImportedVisitor(params.id);
  return new Response(null, { status: 204 });
});
