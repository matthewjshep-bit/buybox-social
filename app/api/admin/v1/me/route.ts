import { adminRoute, apiJson } from "@/lib/api/http";

// Which admin key this is, and whose: the first thing a tool asks, to check
// it was set up with the right one. (Never the key itself.)
export const dynamic = "force-dynamic";

export const GET = adminRoute(async ({ key, owner }) =>
  apiJson({
    key: { name: key.name, prefix: key.prefix },
    owner: { id: owner.id, email: owner.email, name: owner.full_name.trim() },
  }),
);
