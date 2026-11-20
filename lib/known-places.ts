import { cache } from "react";
import { sql } from "./db";
import { placeLabel } from "./places";

// Places to suggest as someone types where they are: the cities homes here
// are in, the busiest first ("Seattle, WA").
export const knownPlaces = cache(async (): Promise<string[]> => {
  const rows = await sql<{ city: string; state: string }[]>`
    select initcap(btrim(data->>'City')) as city, upper(btrim(data->>'StateOrProvince')) as state
    from listings
    where btrim(coalesce(data->>'City', '')) <> '' and length(btrim(coalesce(data->>'StateOrProvince', ''))) = 2
    group by 1, 2
    order by count(*) desc, 1
    limit 200`;
  return rows.map((row) => placeLabel(row));
});
