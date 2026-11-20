import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { clientJson, linkJson } from "@/lib/api/serialize";
import { getClientFeedback } from "@/lib/client-feedback";
import { getClientBook } from "@/lib/clients";
import { appUrl } from "@/lib/format";

// One of the agent's clients, by the id GET /clients gives them
// ("acct:<uuid>", "name:jenny" or "p:<uuid>"): the links they're on, and
// their feedback rolled up, as their page on the Clients page has it. Found
// only among this agent's own clients, so an id from anyone else's book is
// simply not found.
export const dynamic = "force-dynamic";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CLIENT_ID = new RegExp(`^(?:acct:${UUID}|p:${UUID}|name:.{1,100})$`, "i");

// The id as the client book keys it: decoded when it came in encoded
// ("acct%3A…"), and in lower case (every key is: uuids as the database gives
// them, names as personKeys folds them), so "name:Jenny" finds Jenny too.
function clientIdOf(raw: string) {
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // Already plain.
  }
  id = id.trim().toLowerCase();
  return CLIENT_ID.test(id) ? id : null;
}

const notFound = () => new ApiError(404, "not_found", "We couldn't find that client.");

export const GET = apiRoute<{ id: string }>(async ({ agent, params }) => {
  const id = clientIdOf(params.id ?? "");
  if (!id) throw notFound();
  const { clients } = await getClientBook(agent.id);
  const client = clients.find((c) => c.key === id);
  if (!client) throw notFound();

  // (Only on this agent's links, whoever the ids say they are: see getClientFeedback.)
  const feedback = await getClientFeedback(agent.id, client.participantIds);
  return apiJson({
    client: clientJson(client),
    links: client.links.map(linkJson),
    feedback: {
      liked: feedback.liked,
      passed: feedback.passed,
      sent: feedback.sent,
      likes: feedback.likes.map(({ thing, homes }) => ({ thing, homes })),
      dislikes: feedback.dislikes.map(({ thing, homes }) => ({ thing, homes })),
      mixed: feedback.mixed,
      // The homes they've done anything with first, newest first; then the
      // rest. Each with its page on the site (not the agent's own view of
      // it, which only opens signed in).
      homes: feedback.homes.map((home) => ({
        key: home.key,
        address: home.address ?? "",
        city: home.city ?? "",
        reaction: home.reaction === "like" ? "liked" : home.reaction === "dislike" ? "passed" : null,
        likes: home.likes,
        dislikes: home.dislikes,
        comments: home.comments,
        url: `${appUrl()}/homes/${encodeURIComponent(home.key)}`,
      })),
    },
  });
});
