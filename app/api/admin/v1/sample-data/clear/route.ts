import { clearSampleData } from "@/lib/api/admin-engagement";
import { adminRoute, apiJson } from "@/lib/api/http";

// The demo's people, views and sign-ups (scripts/seed-demo.ts) and the sample
// homes, gone; says how many of each, and what's left (the demo's accounts
// go through DELETE /accounts/{id}, and a sample home still on a link stays).
export const dynamic = "force-dynamic";

export const POST = adminRoute(async () => apiJson(await clearSampleData()));
