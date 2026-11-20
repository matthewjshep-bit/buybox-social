import { deleteAnyLink } from "@/lib/api/admin-engagement";
import { adminRoute } from "@/lib/api/http";

// Any agent's link, gone for good, with everyone on it and everything said
// there, opened or not (an agent can only delete one nobody has used). The
// homes on it stay. Asks for the id of the agent who sent it as ?agent=, so
// a wrong id can't take someone else's.
export const dynamic = "force-dynamic";

export const DELETE = adminRoute<{ id: string }>(async ({ params, url, target }) => {
  const agent = await deleteAnyLink(params.id, url.searchParams.get("agent"));
  target(agent);
  return new Response(null, { status: 204 });
});
