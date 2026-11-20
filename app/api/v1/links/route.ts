import { SEND_HOMES_MOST } from "@/lib/send-limits";
import { z } from "zod";
import { apiJson, apiRoute, ApiError } from "@/lib/api/http";
import { linkJson } from "@/lib/api/serialize";
import { getClientBook } from "@/lib/clients";
import { appUrl } from "@/lib/format";
import { NOT_AN_EMAIL, type PersonPick } from "@/lib/people-picker";
import { sendHomes } from "@/lib/sending";

// The agent's links (each a send of homes), and a new one: the same as Send
// homes on the dashboard, done by the agent's own tool. Porchcard emails only
// the people on it who are on Porchcard, as it does when the agent sends from
// the site; the link comes back here, for the tool to send on.

const LIMIT_DEFAULT = 50;
const LIMIT_MOST = 100;

// A whole number from the query, or the default when it isn't there. Anything
// else is a mistake worth saying, rather than quietly reading as something.
function wholeNumber(url: URL, name: string, fallback: number, least: number, most: number) {
  const given = url.searchParams.get(name);
  if (given === null || given.trim() === "") return fallback;
  const n = /^\d+$/.test(given.trim()) ? Number(given.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < least || n > most) {
    throw new ApiError(
      400,
      "invalid_request",
      most === Number.MAX_SAFE_INTEGER
        ? `${name} is a whole number, ${least} or more.`
        : `${name} is a whole number from ${least} to ${most}.`,
      name,
    );
  }
  return n;
}

// Every link they've sent, newest first, a page at a time.
export const GET = apiRoute(async ({ agent, url }) => {
  const limit = wholeNumber(url, "limit", LIMIT_DEFAULT, 1, LIMIT_MOST);
  const offset = wholeNumber(url, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const { links } = await getClientBook(agent.id);
  return apiJson({ links: links.slice(offset, offset + limit).map(linkJson), total: links.length });
});

// A first name as the agent would type it on the site: never an email, so
// someone's email can't find them, nor become their name on a link.
const firstName = z
  .string({ error: "A first_name is text, like \"Jenny\"." })
  .trim()
  .min(1, "Give each person a first name.")
  .max(40, "First names can be up to 40 characters.")
  .refine((name) => !name.includes("@"), NOT_AN_EMAIL);

// Someone the link is for: a first name, or someone on Porchcard by their
// profile (the id at the end of their profile_url), one or the other.
const person = z
  .object(
    {
      first_name: firstName.optional(),
      profile_id: z.uuid({ error: "A profile_id is the id at the end of someone's profile_url." }).optional(),
    },
    { error: "Each person is an object, like { \"first_name\": \"Jenny\" }." },
  )
  .refine((p) => (p.first_name === undefined) !== (p.profile_id === undefined), {
    error: "Give each person either a first_name or a profile_id.",
  });

const homeKey = z
  .string({ error: "Each home is its key, as text." })
  .trim()
  .min(1, "Each home is its key, as text.")
  .max(100, "That isn't a home's key.");

const newLink = z.object({
  homes: z
    .array(homeKey, { error: "homes is a list of home keys, like [\"N12345678\"]." })
    .min(1, "Send at least one home.")
    .max(SEND_HOMES_MOST, `Send up to ${SEND_HOMES_MOST} homes at a time.`),
  people: z
    .array(person, { error: "people is a list, like [{ \"first_name\": \"Jenny\" }]." })
    .max(6, "A link can be for up to 6 people.")
    .optional(),
  note: z.string({ error: "A note is text." }).trim().max(500, "Notes can be up to 500 characters.").optional(),
});

// A new link with these homes, for these people (or, with nobody named, for
// whoever opens it first). Each person gets their own link, given back here.
export const POST = apiRoute(
  async ({ agent, json }) => {
    const body = await json(newLink);
    const people: PersonPick[] = (body.people ?? []).map((p) =>
      p.profile_id !== undefined ? { visitorId: p.profile_id } : { name: p.first_name ?? "" },
    );
    const made = await sendHomes(agent, { listingKeys: body.homes, people, note: body.note ?? "" });
    if ("error" in made) {
      if (made.unavailable) throw new ApiError(409, "conflict", made.error, "homes");
      if (made.limit) throw new ApiError(422, "limit_reached", made.error);
      throw new ApiError(400, "invalid_request", made.error, made.field);
    }

    // The link as the list above gives it. (Read only now, after it's made.)
    const { links } = await getClientBook(agent.id);
    const link = links.find((one) => one.shareId === made.shareId);
    if (!link) throw new Error(`api: link ${made.shareId} was made but isn't in the agent's links`);
    return apiJson(
      {
        link: linkJson(link),
        // The first person's own link, or the link anyone can use when
        // nobody is named on it.
        url: `${appUrl()}/s/${made.token}`,
        // Everyone on it, in the order they were given, each with their own.
        people: made.people.map((p) => ({ id: p.participantId, name: p.name, url: `${appUrl()}/s/${p.token}` })),
      },
      201,
    );
  },
  { idempotent: true },
);
