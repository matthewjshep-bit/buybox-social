import { createAccount, getAccount, listAccounts, newAccountSchema, wholeNumber } from "@/lib/api/admin-accounts";
import { ApiError, adminRoute, apiJson } from "@/lib/api/http";

// Every account on the site, newest first (`q` finds them by name, email,
// phone, brokerage or MLS ID; `role` keeps to agents or buyers), and a new
// one, made ready for its person to sign in to with its email. Nobody is
// emailed: the owner tells them. Their listings, links, clients and
// webhooks are then reached through /api/v1 as them (Porchcard-Account).
export const dynamic = "force-dynamic";

const LIMIT_DEFAULT = 50;
const LIMIT_MOST = 100;
const Q_MOST = 100;

export const GET = adminRoute(async ({ url }) => {
  const q = url.searchParams.get("q") ?? "";
  if (q.length > Q_MOST) throw new ApiError(400, "invalid_request", `Keep q to ${Q_MOST} characters.`, "q");
  const role = url.searchParams.get("role")?.trim() || null;
  if (role !== null && role !== "agent" && role !== "buyer") {
    throw new ApiError(400, "invalid_request", "role is “agent” or “buyer”.", "role");
  }
  const limit = wholeNumber(url, "limit", LIMIT_DEFAULT, 1, LIMIT_MOST);
  const offset = wholeNumber(url, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  return apiJson(await listAccounts({ q, role, limit, offset }));
});

// (Photos may come as data URLs, so the body may be large.)
export const POST = adminRoute(
  async ({ json, target }) => {
    const id = await createAccount(await json(newAccountSchema));
    target(id);
    const account = await getAccount(id);
    if (!account) throw new Error(`account ${id} wasn't there after it was made`);
    return apiJson({ account }, 201);
  },
  { idempotent: true, maxBytes: 12 * 1024 * 1024 },
);
