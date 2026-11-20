import { adminLog, wholeNumber } from "@/lib/api/admin-accounts";
import { adminRoute, apiJson } from "@/lib/api/http";

// Everything changed with an admin key, here or on /api/v1 as an agent,
// newest first: which key, what was asked (never the query), about which
// account, and how it went. (Reading it isn't noted in it.)
export const dynamic = "force-dynamic";

const LIMIT_DEFAULT = 50;
const LIMIT_MOST = 100;

export const GET = adminRoute(async ({ url }) => {
  const limit = wholeNumber(url, "limit", LIMIT_DEFAULT, 1, LIMIT_MOST);
  const offset = wholeNumber(url, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  return apiJson(await adminLog(limit, offset));
});
