import { apiJson, apiRoute, ApiError, isUuid } from "@/lib/api/http";
import { deleteWebhook } from "@/lib/api/webhooks";

// One of the agent's webhooks, by its id.
export const dynamic = "force-dynamic";

const notFound = () => new ApiError(404, "not_found", "We couldn't find that webhook.");

// Stops sending to it, at once, and forgets it. Only ever their own.
export const DELETE = apiRoute<{ id: string }>(async ({ agent, params }) => {
  if (!isUuid(params.id)) throw notFound();
  if (!(await deleteWebhook(agent.id, params.id))) throw notFound();
  return apiJson({ deleted: true });
});
