import { connection } from "next/server";
import { loadSearchReel } from "@/app/homes/actions";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { SearchReel } from "@/components/search-view";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel, REEL_PAGE } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { searchHomes } from "@/lib/search";
import { filtersQuery, parseFilters } from "@/lib/search-options";
import { getTaste } from "@/lib/taste";

export const metadata = { title: "Homes · BuyBox Social" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// The homes a map search found, full screen like the home page's feed, in the
// map's order: opened on the one picked beside the map, with those before it
// above and the rest below, for as long as you scroll. The address follows
// the home on screen (`SearchReel`).
export default async function SearchFeed({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  const filters = parseFilters(params);
  const start = typeof params.home === "string" && params.home.length <= 100 ? params.home : null;
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor, name } = await getPublicIdentity(viewer, device);
  const [results, taste] = await Promise.all([searchHomes(filters, visitor?.id ?? null), getTaste(visitor?.id)]);

  const keys = results.map((result) => result.listing.ListingKey);
  if (start && !keys.includes(start)) keys.unshift(start);
  // Everything up to the one picked, and a few after; the rest as you go.
  const first = keys.slice(0, (start ? keys.indexOf(start) : 0) + REEL_PAGE);
  const posts = first.length ? await getReel(viewer, device, taste, { only: first, limit: first.length }) : [];

  const query = filtersQuery(filters);
  return (
    <SearchReel
      query={query}
      start={start}
      siteHeader={<SiteHeader overlay />}
      sender={viewer?.role === "agent" ? { profileComplete: Boolean(viewer.full_name) } : null}
      initial={posts}
      mode="public"
      infinite={keys.length > first.length}
      loadMore={loadSearchReel.bind(null, query)}
      actions={publicReelActions}
      myName={name}
      prompt={PUBLIC_PROMPT}
    />
  );
}
