import {
  accountChangeSchema,
  deleteAccount,
  getAccount,
  NO_ACCOUNT,
  updateAccount,
} from "@/lib/api/admin-accounts";
import { ApiError, adminRoute, apiJson } from "@/lib/api/http";

// One account: read whole (with how much there is on it), changed (only
// what's sent; null clears what may be empty, and takes a photo or banner
// off), or deleted (lib/api/admin-accounts.ts says exactly what goes with
// it). Deleting asks for the account's email as ?confirm=, so a wrong id
// can't delete the wrong person.
export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const account = await getAccount(params.id);
  if (!account) throw NO_ACCOUNT();
  return apiJson({ account });
});

export const PATCH = adminRoute<{ id: string }>(
  async ({ params, json }) => {
    const change = await json(accountChangeSchema);
    if (Object.keys(change).length === 0) throw new ApiError(400, "invalid_request", "Send at least one field to change.");
    await updateAccount(params.id, change);
    const account = await getAccount(params.id);
    if (!account) throw NO_ACCOUNT();
    return apiJson({ account });
  },
  { maxBytes: 12 * 1024 * 1024 },
);

export const DELETE = adminRoute<{ id: string }>(async ({ params, url }) => {
  await deleteAccount(params.id, url.searchParams.get("confirm"));
  return new Response(null, { status: 204 });
});
