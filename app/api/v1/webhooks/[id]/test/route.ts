import { apiJson, apiRoute, ApiError, isUuid } from "@/lib/api/http";
import { sendTestEvent } from "@/lib/api/webhooks";

// Sends one of the agent's webhooks a "ping" now, to see it gets there,
// whether it's on or paused. Tried once (the tool is waiting on the answer),
// and it never pauses a webhook or turns one back on.
export const dynamic = "force-dynamic";

export const POST = apiRoute<{ id: string }>(async ({ agent, params }) => {
  const notFound = new ApiError(404, "not_found", "We couldn't find that webhook.");
  if (!isUuid(params.id)) throw notFound;
  const delivery = await sendTestEvent(agent.id, params.id);
  if (!delivery) throw notFound;
  return apiJson({ delivery: { status: delivery.status, ok: delivery.ok, error: delivery.error } });
});
