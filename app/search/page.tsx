import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { SearchView } from "@/components/search-view";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { searchHomes } from "@/lib/search";
import { parseFilters } from "@/lib/search-options";
import { getTaste } from "@/lib/taste";

export const metadata = { title: "Map · Porchcard" };

// The most homes shown beside the map at once.
const MAX_SHOWN = 60;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  // Opened from a home's address: start on that home.
  const home = typeof params.home === "string" && params.home.length <= 100 ? params.home : null;
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor, name } = await getPublicIdentity(viewer, device);
  const [results, taste] = await Promise.all([searchHomes(filters, visitor?.id ?? null), getTaste(visitor?.id)]);

  // The search's homes in its order, with the one asked for first if the
  // filters would have left it out.
  const keys = results.map((r) => r.listing.ListingKey).slice(0, MAX_SHOWN);
  if (home && !keys.includes(home)) keys.unshift(home);
  const posts = keys.length ? await getReel(viewer, device, taste, { only: keys, limit: keys.length }) : [];
  const startKey = home && posts.some((post) => post.listing.ListingKey === home) ? home : null;

  return (
    <SearchView
      filters={filters}
      count={results.length}
      posts={posts}
      startKey={startKey}
      actions={publicReelActions}
      myName={name}
      prompt={PUBLIC_PROMPT}
      sender={viewer?.role === "agent" ? { profileComplete: Boolean(viewer.full_name) } : null}
    />
  );
}
