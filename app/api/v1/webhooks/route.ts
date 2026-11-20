import { z } from "zod";
import { apiJson, apiRoute, ApiError } from "@/lib/api/http";
import { createWebhook, EVENTS, listWebhooks, webhookJson } from "@/lib/api/webhooks";

// Where the agent's tools want to be told when a client does something on
// one of their links (opens it, likes a home, says something). Each is sent
// signed with its own secret, given back once, when it's added.
export const dynamic = "force-dynamic";

// Their webhooks, newest first, with how the last send went. Never a secret.
export const GET = apiRoute(async ({ agent }) => {
  const webhooks = await listWebhooks(agent.id);
  return apiJson({ webhooks: webhooks.map(webhookJson) });
});

const body = z.object({
  url: z.string({ error: "Give the url to send to. It starts with https://" }),
  // Which events: all of them when left out.
  events: z
    .array(z.string({ error: `Each event is one of ${EVENTS.join(", ")}.` }), {
      error: `events is a list, like ["home.liked", "comment.created"].`,
    })
    .max(20, `events can only be ${EVENTS.join(", ")}.`)
    .optional(),
});

// A new webhook. Its `secret` is in this answer only: keep it to check the
// Porchcard-Signature on what's sent. (Idempotent, so a tool that retries
// after a dropped connection doesn't add the same one twice.)
export const POST = apiRoute(
  async ({ agent, json }) => {
    const input = await json(body);
    const made = await createWebhook(agent.id, input.url, input.events);
    if ("error" in made) {
      if (made.limit) throw new ApiError(422, "limit_reached", made.error);
      throw new ApiError(400, "invalid_request", made.error, made.field);
    }
    return apiJson({ webhook: webhookJson(made.webhook), secret: made.secret }, 201);
  },
  { idempotent: true },
);
