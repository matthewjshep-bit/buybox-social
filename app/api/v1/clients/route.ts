import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { clientJson } from "@/lib/api/serialize";
import { getClientBook, isWaiting } from "@/lib/clients";

// The agent's clients, as the Clients page lists them: whoever is waiting on
// them first. `?waiting=true` gives only those (a request to see a home, or
// something they said, with no answer yet), for a tool that wants to know
// who to call back. Only ever the clients on this agent's own links.
export const dynamic = "force-dynamic";

export const GET = apiRoute(async ({ agent, url }) => {
  const waiting = url.searchParams.get("waiting");
  let onlyWaiting = false;
  if (waiting !== null) {
    const said = waiting.trim().toLowerCase();
    if (said === "true" || said === "1") onlyWaiting = true;
    else if (said !== "false" && said !== "0" && said !== "") {
      throw new ApiError(400, "invalid_request", "waiting is true or false.", "waiting");
    }
  }
  const { clients } = await getClientBook(agent.id);
  return apiJson({ clients: (onlyWaiting ? clients.filter(isWaiting) : clients).map(clientJson) });
});
