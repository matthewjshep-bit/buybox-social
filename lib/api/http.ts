import { createHash, randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { sql } from "../db";
import { agentById, authenticate, type ApiAgent, type ApiCaller, type ApiKeyInfo, type ApiOwner } from "./auth";

// What every /api/v1 route is wrapped in (`export const GET = apiRoute(...)`):
// who's asking (by their key, never a cookie), how often they may, a request
// sent twice by a tool that retried it answered once, and every answer and
// every mistake as JSON in the same shape. A route only says what it does.
// /api/admin/v1 routes are wrapped in its sibling, adminRoute, which works
// the same way for the site owner's admin keys alone.
//
// An admin key on /api/v1 acts as one agent, named by the Porchcard-Account
// header (their account id): the route then runs exactly as it would for
// that agent's own key. Every write made with an admin key, here or on
// /api/admin/v1, is noted in api_admin_log.

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "limit_reached"
  | "rate_limited"
  | "server_error";

// Thrown anywhere under a route to answer with it: `{ error: { code,
// message, field } }`, `field` when it's about one thing that was sent.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiJson = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });

const errorJson = (error: ApiError, headers?: HeadersInit) =>
  apiJson(
    { error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } },
    error.status,
    headers,
  );

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);

type BaseContext<P extends Record<string, string>> = {
  request: Request;
  params: P;
  key: ApiKeyInfo;
  // The body, read as JSON and checked against `schema`.
  json: <T>(schema: ZodType<T>) => Promise<T>;
  url: URL;
};

export type ApiContext<P extends Record<string, string> = Record<string, never>> = BaseContext<P> & {
  agent: ApiAgent;
  // True when it's the owner's admin key acting as this agent
  // (Porchcard-Account), not the agent's own key.
  actingAs: boolean;
};

export type AdminContext<P extends Record<string, string> = Record<string, never>> = BaseContext<P> & {
  owner: ApiOwner;
  // The account this request is about, for api_admin_log, when it isn't the
  // `id` in the path (an account just made, say).
  target: (accountId: string) => void;
};

// The header an admin key names the agent it acts as with, on /api/v1.
export const ACTING_HEADER = "Porchcard-Account";

type Options = { maxBytes?: number; idempotent?: boolean };

const DEFAULT_MAX_BYTES = 64 * 1024;
const IDEMPOTENCY_KEY_MOST = 100;

// Requests a minute for each key: enough for a CRM working through a list,
// not enough for one gone wrong to crowd out everyone else.
const ratePerMinute = () => {
  const set = Number(process.env.API_RATE_PER_MINUTE);
  return Number.isInteger(set) && set > 0 ? set : 120;
};

// Now and then (about one request in a hundred), what's no longer needed is
// cleared away by whichever request comes along. Never in the way: if it
// fails, it's only tried again later.
const nowAndThen = () => Math.random() < 0.01;
async function tidy(query: () => Promise<unknown>) {
  try {
    await query();
  } catch (error) {
    console.error("api: tidying up failed", error);
  }
}

// One more request in this key's current minute, counted in a single
// statement so requests at the same moment can't both read the same count.
// Gives back the count so far and the seconds until the minute turns.
async function countRequest(keyId: string) {
  const [row] = await sql<{ n: number; reset: number }[]>`
    insert into api_rate (key_id, window_start, n)
    values (${keyId}, date_trunc('minute', now()), 1)
    on conflict (key_id, window_start) do update set n = api_rate.n + 1
    returning n, ceil(extract(epoch from date_trunc('minute', now()) + interval '1 minute' - now()))::int as reset`;
  if (nowAndThen()) await tidy(() => sql`delete from api_rate where window_start < now() - interval '1 hour'`);
  return row;
}

// The body, as bytes, no more than `maxBytes` of it: a Content-Length over
// that is turned away before anything is read, and a body that turns out
// longer is stopped as soon as it passes the limit.
async function readBody(request: Request, maxBytes: number): Promise<Buffer> {
  const tooLarge = () =>
    new ApiError(413, "payload_too_large", `The body is too large. The most this accepts is ${formatBytes(maxBytes)}.`);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`;

// "application/json", with or without a charset.
const isJson = (request: Request) =>
  /^application\/json\s*(;|$)/i.test(request.headers.get("content-type")?.trim() ?? "");

// The first thing wrong with what was sent, as an ApiError about that field
// ("people.0.first_name"), or about the body as a whole.
function invalid(issues: { path: PropertyKey[]; message: string }[]): ApiError {
  const issue = issues[0];
  const field = issue?.path.map((part) => String(part)).join(".") || undefined;
  return new ApiError(400, "invalid_request", issue?.message ?? "Something sent isn't right.", field);
}

// A request sent with an Idempotency-Key: claimed by the first to arrive, in
// one statement, so two copies sent at once can't both go ahead. A claim is
// `status` 0 until its answer is stored over it. Returns either the claim
// (go ahead) or the answer to give instead.
type Claim = { claimed: true } | { claimed: false; response: Response };

async function claim(keyId: string, idemKey: string, requestHash: string, again = true): Promise<Claim> {
  // Taken over only when the one before is more than a day old, or was left
  // unfinished with this same request longer ago than any request can run
  // (its server went away mid-way), so it can be tried again.
  const [won] = await sql`
    insert into api_idempotency (key_id, idem_key, request_hash, status, body)
    values (${keyId}, ${idemKey}, ${requestHash}, 0, 'null'::jsonb)
    on conflict (key_id, idem_key) do update set
      request_hash = excluded.request_hash, status = 0, body = 'null'::jsonb, created_at = now()
    where api_idempotency.created_at < now() - interval '24 hours'
      or (api_idempotency.status = 0 and api_idempotency.request_hash = excluded.request_hash
          and api_idempotency.created_at < now() - interval '15 minutes')
    returning 1`;
  if (won) return { claimed: true };
  const [stored] = await sql<{ request_hash: string; status: number; body: unknown }[]>`
    select request_hash, status, body from api_idempotency
    where key_id = ${keyId} and idem_key = ${idemKey}`;
  // (Gone in between, given up by the request that had it: try once more.)
  if (!stored) {
    if (again) return claim(keyId, idemKey, requestHash, false);
    throw new ApiError(409, "conflict", "A request with this Idempotency-Key is still being worked on. Try again in a moment.");
  }
  if (stored.request_hash !== requestHash) {
    throw new ApiError(
      409,
      "conflict",
      "This Idempotency-Key was already used for a different request. Use a new key for each new request.",
    );
  }
  if (stored.status === 0) {
    throw new ApiError(
      409,
      "conflict",
      "A request with this Idempotency-Key is still being worked on. Try again in a moment.",
    );
  }
  return {
    claimed: false,
    response: apiJson(stored.body, stored.status, { "Idempotent-Replayed": "true" }),
  };
}

// The answer to a claimed request, kept a day for a retry: a success, or a
// mistake in what was sent (the same request would get the same answer). A
// failure of ours (5xx) isn't kept, so a retry can go through.
async function settle(keyId: string, idemKey: string, response: Response | null) {
  let body: unknown = undefined;
  if (response && response.status < 500) {
    try {
      body = await response.clone().json();
    } catch {
      body = undefined;
    }
  }
  if (response && body !== undefined) {
    await sql`
      update api_idempotency set status = ${response.status}, body = ${sql.json(body as Parameters<typeof sql.json>[0])}
      where key_id = ${keyId} and idem_key = ${idemKey} and status = 0`;
  } else {
    await release(keyId, idemKey);
  }
  if (nowAndThen()) {
    await tidy(() => sql`delete from api_idempotency where created_at < now() - interval '24 hours'`);
  }
}

// A claim given up without an answer, so the same request can be tried again.
async function release(keyId: string, idemKey: string) {
  try {
    await sql`delete from api_idempotency where key_id = ${keyId} and idem_key = ${idemKey} and status = 0`;
  } catch (error) {
    console.error("api: letting go of an Idempotency-Key failed", error);
  }
}

// What a Next.js helper means when shared code calls it: notFound() is a 404
// here, as JSON like any other.
const digestOf = (error: unknown) =>
  typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : "";
const isNotFound = (error: unknown) => digestOf(error).startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
const isRedirect = (error: unknown) => digestOf(error).startsWith("NEXT_REDIRECT");

export function apiRoute<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: ApiContext<P>) => Promise<Response>,
  opts: Options = {},
): (request: Request, context: { params: Promise<P> }) => Promise<Response> {
  return route<P>("v1", opts, (base, who) => {
    if (!("agent" in who)) throw new Error("apiRoute: no agent");
    return handler({ ...base, agent: who.agent, actingAs: who.actingAs });
  });
}

// An /api/admin/v1 route: the site owner's admin keys only (an agent's key,
// however good, is a 401 here). Otherwise as apiRoute.
export function adminRoute<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: AdminContext<P>) => Promise<Response>,
  opts: Options = {},
): (request: Request, context: { params: Promise<P> }) => Promise<Response> {
  return route<P>("admin", opts, (base, who, setTarget) => {
    if (!("owner" in who)) throw new Error("adminRoute: no owner");
    return handler({ ...base, owner: who.owner, target: setTarget });
  });
}

type Who = { agent: ApiAgent; actingAs: boolean } | { owner: ApiOwner };

const UNAUTHORIZED: Record<"v1" | "admin", string> = {
  v1: "Send your API key as \"Authorization: Bearer pc_live_…\". Make one on your Edit profile page, under Connect your tools.",
  admin: "Send an admin key as \"Authorization: Bearer pc_admin_…\".",
};

// Methods that change nothing, and so aren't noted in api_admin_log.
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

// A write made with an admin key, noted for the owner to look back on (only
// the path: a query can carry an email). Never in the way of the answer.
async function logAdminWrite(entry: {
  keyId: string;
  method: string;
  path: string;
  accountId: string | null;
  status: number;
}) {
  try {
    await sql`
      insert into api_admin_log (key_id, method, path, account_id, status)
      values (${entry.keyId}, ${entry.method}, ${entry.path}, ${entry.accountId}, ${entry.status})`;
  } catch (error) {
    console.error("api: noting an admin write failed", error);
  }
}

function route<P extends Record<string, string>>(
  scope: "v1" | "admin",
  opts: Options,
  run: (base: BaseContext<P>, who: Who, setTarget: (accountId: string) => void) => Promise<Response>,
): (request: Request, context: { params: Promise<P> }) => Promise<Response> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  return async (request, context) => {
    const requestId = randomUUID();
    // Headers on every answer, whatever it is.
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      "X-Content-Type-Options": "nosniff",
    });
    // The same response with those headers on it (a handler's own headers
    // kept, and copied, since some responses' can't be changed).
    const finish = (response: Response) => {
      const out = new Headers(response.headers);
      headers.forEach((value, name) => out.set(name, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
    };

    let idem: { keyId: string; idemKey: string } | null = null;
    // An admin key's request, once it's known to be one, and the account it's
    // about (for api_admin_log).
    let admin: ApiCaller | null = null;
    let target: string | null = null;
    let rateLimited = false;
    let response: Response;
    try {
      const caller = await authenticate(request);
      if (!caller || (scope === "admin" && caller.kind !== "admin")) {
        headers.set("WWW-Authenticate", 'Bearer realm="Porchcard API"');
        throw new ApiError(401, "unauthorized", UNAUTHORIZED[scope]);
      }
      if (caller.kind === "admin") admin = caller;

      const limit = ratePerMinute();
      const { n, reset } = await countRequest(caller.key.id);
      headers.set("X-RateLimit-Limit", String(limit));
      headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - n)));
      if (n > limit) {
        rateLimited = true;
        headers.set("Retry-After", String(Math.max(1, reset)));
        throw new ApiError(
          429,
          "rate_limited",
          `That's more than ${limit} requests in a minute. Wait ${Math.max(1, reset)} seconds and try again.`,
        );
      }

      const params = ((await context?.params) ?? {}) as P;
      if (scope === "admin" && isUuid((params as Record<string, string>).id)) {
        target = (params as Record<string, string>).id;
      }

      // Who the route runs for: the agent whose key it is, the agent an
      // admin key names, or (on /api/admin/v1) the owner.
      let who: Who;
      if (caller.kind === "agent") {
        who = { agent: caller.agent, actingAs: false };
      } else if (scope === "admin") {
        who = { owner: caller.owner };
      } else {
        const asked = request.headers.get(ACTING_HEADER)?.trim();
        if (!asked) {
          throw new ApiError(
            400,
            "invalid_request",
            `An admin key acts as one agent: send their account id as the ${ACTING_HEADER} header.`,
            ACTING_HEADER,
          );
        }
        const agent = isUuid(asked) ? await agentById(asked) : null;
        if (!agent) throw new ApiError(404, "not_found", "No agent with that id.");
        target = agent.id;
        who = { agent, actingAs: true };
      }

      const url = new URL(request.url);
      // The body is read once, when it's first wanted, and kept.
      let body: Promise<Buffer> | null = null;
      const rawBody = () => (body ??= readBody(request, maxBytes));

      let replay: Response | null = null;
      const idemKey = request.headers.get("idempotency-key");
      if (opts.idempotent && request.method === "POST" && idemKey !== null) {
        if (!idemKey.trim() || idemKey.length > IDEMPOTENCY_KEY_MOST || !/^[\x21-\x7e]+$/.test(idemKey)) {
          throw new ApiError(
            400,
            "invalid_request",
            `An Idempotency-Key is 1 to ${IDEMPOTENCY_KEY_MOST} letters, digits or symbols, with no spaces.`,
          );
        }
        // An admin key acting as an agent keeps each agent's keys apart, so
        // the same Idempotency-Key used for two agents never gives one the
        // other's answer.
        const scopedKey = "agent" in who && who.actingAs ? `${who.agent.id}:${idemKey}` : idemKey;
        const requestHash = createHash("sha256")
          .update(`${request.method}\n${url.pathname}\n`)
          .update(await rawBody())
          .digest("hex");
        const claimed = await claim(caller.key.id, scopedKey, requestHash);
        if (claimed.claimed) idem = { keyId: caller.key.id, idemKey: scopedKey };
        else replay = claimed.response;
      }

      const json = async <T>(schema: ZodType<T>): Promise<T> => {
        if (!isJson(request)) {
          throw new ApiError(415, "unsupported_media_type", "Send the body as JSON, with Content-Type: application/json.");
        }
        const bytes = await rawBody();
        let parsed: unknown;
        try {
          parsed = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw new ApiError(
            400,
            "invalid_request",
            bytes.length === 0 ? "Send a JSON body." : "The body isn't valid JSON.",
          );
        }
        const result = schema.safeParse(parsed);
        if (!result.success) throw invalid(result.error.issues);
        return result.data;
      };

      response =
        replay ??
        (await run({ request, params, key: caller.key, json, url }, who, (accountId) => {
          if (isUuid(accountId)) target = accountId;
        }));
    } catch (error) {
      if (error instanceof ApiError) {
        response = errorJson(error);
      } else if (isNotFound(error)) {
        response = errorJson(new ApiError(404, "not_found", "Not found."));
      } else {
        // Next.js's own signals that aren't about the answer (a page being
        // built ahead of time) are its to handle, not ours to swallow. A
        // redirect from shared code means nothing to a tool: it's a failure
        // of ours, below, like any other.
        if (!isRedirect(error)) {
          if (idem) await release(idem.keyId, idem.idemKey);
          unstable_rethrow(error);
        }
        console.error(`api: ${request.method} ${new URL(request.url).pathname} failed (${requestId})`, error);
        response = errorJson(
          new ApiError(500, "server_error", `Something went wrong on our side. If it keeps happening, quote ${requestId}.`),
        );
      }
    }

    if (idem) {
      try {
        await settle(idem.keyId, idem.idemKey, response);
      } catch (error) {
        // The answer still goes out; a retry would run the request again.
        console.error(`api: keeping the answer for an Idempotency-Key failed (${requestId})`, error);
      }
    }
    // (Not the requests turned away for coming too fast: those changed
    // nothing, and a tool gone wrong would fill the log with them.)
    if (admin && !READS.has(request.method) && !rateLimited) {
      await logAdminWrite({
        keyId: admin.key.id,
        method: request.method,
        path: new URL(request.url).pathname,
        accountId: target,
        status: response.status,
      });
    }
    return finish(response);
  };
}
