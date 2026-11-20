import { ApiError, apiJson, apiRoute } from "@/lib/api/http";
import { homeJson } from "@/lib/api/serialize";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";

// One home, by its key: any MLS home here, for sale or sold, and the agent's
// own listings whatever they've done with them. A listing someone else added
// themselves only when it's one they show (never one they've hidden, nor one
// they took down), as anyone could see it on their profile.
export const dynamic = "force-dynamic";

const KEY_MOST = 100;

const notFound = () => new ApiError(404, "not_found", "We couldn't find that home.");

export const GET = apiRoute<{ key: string }>(async ({ agent, params }) => {
  let key = params.key ?? "";
  try {
    key = decodeURIComponent(key);
  } catch {
    // Already plain.
  }
  key = key.trim();
  if (!key || key.length > KEY_MOST) throw notFound();

  const [row] = await sql<{ data: Listing }[]>`
    select data from listings
    where listing_key = ${key}
      and (
        owner_account_id = ${agent.id}
        or (standard_status in ('Active', 'Closed')
            and (owner_account_id is null or coalesce((data->>'Hidden')::boolean, false) = false))
      )`;
  if (!row) throw notFound();
  return apiJson({ home: homeJson(row.data) });
});
