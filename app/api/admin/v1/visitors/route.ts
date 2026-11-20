import { wholeNumber } from "@/lib/api/admin-accounts";
import { ensureImportedVisitor, importedVisitorSchema, listImportedVisitors } from "@/lib/api/admin-engagement";
import { adminRoute, apiJson } from "@/lib/api/http";

// People brought in from the owner's other tools, to give the likes, passes
// and comments they made there (lib/api/admin-engagement.ts): a first name
// and a ref the tool chooses, no account and no way to sign in as them. The
// same ref finds the same person again (200, with the name it's given now);
// a new one is a 201.
export const dynamic = "force-dynamic";

const LIMIT_DEFAULT = 50;
const LIMIT_MOST = 100;

export const GET = adminRoute(async ({ url }) => {
  const limit = wholeNumber(url, "limit", LIMIT_DEFAULT, 1, LIMIT_MOST);
  const offset = wholeNumber(url, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  return apiJson(await listImportedVisitors(limit, offset));
});

export const POST = adminRoute(
  async ({ json }) => {
    const { visitor, made } = await ensureImportedVisitor(await json(importedVisitorSchema));
    return apiJson({ visitor }, made ? 201 : 200);
  },
  { idempotent: true },
);
