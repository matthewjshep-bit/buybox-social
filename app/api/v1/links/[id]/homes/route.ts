import { z } from "zod";
import { apiJson, apiRoute, ApiError, isUuid } from "@/lib/api/http";
import { linkJson } from "@/lib/api/serialize";
import { getClientBook } from "@/lib/clients";
import { addHomesToLink } from "@/lib/sending";

// More homes on a link the agent already sent, after the ones there, the same
// as Add homes on the link's page. A home they took off it before comes back.
// People on it who are on Porchcard hear about it from us as they would then
// (once a day at most from each agent); nobody else is told anything.

const homeKey = z
  .string({ error: "Each home is its key, as text." })
  .trim()
  .min(1, "Each home is its key, as text.")
  .max(100, "That isn't a home's key.");

const moreHomes = z.object({
  homes: z
    .array(homeKey, { error: "homes is a list of 1 to 3 home keys, like [\"N12345678\"]." })
    .min(1, "Add between 1 and 3 homes.")
    .max(3, "Add between 1 and 3 homes."),
});

export const POST = apiRoute<{ id: string }>(
  async ({ agent, params, json }) => {
    const notFound = new ApiError(404, "not_found", "We couldn't find that link.");
    if (!isUuid(params.id)) throw notFound;
    const id = params.id.toLowerCase();
    const { homes } = await json(moreHomes);

    // (It checks the link is the agent's own before anything else.)
    const result = await addHomesToLink(agent.id, id, homes);
    if ("error" in result) {
      if (result.notFound) throw notFound;
      if (result.unavailable) throw new ApiError(409, "conflict", result.error, "homes");
      throw new ApiError(400, "invalid_request", result.error, "homes");
    }

    // The link as it is now, with its new homes counted.
    const { links } = await getClientBook(agent.id);
    const link = links.find((one) => one.shareId === id);
    if (!link) throw notFound;
    // `added`: how many weren't on it before (one already there isn't counted).
    return apiJson({ link: linkJson(link), added: result.added });
  },
  { idempotent: true },
);
