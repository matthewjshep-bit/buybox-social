import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { loadSearchReel } from "@/app/homes/actions";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { ReelFeed } from "@/components/reel";
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
// above and the rest below, for as long as you scroll.
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
  const map = `/search?${new URLSearchParams([...new URLSearchParams(query), ...(start ? [["home", start]] : [])])}`;

  return (
    <ReelFeed
      initial={posts}
      mode="public"
      infinite={keys.length > first.length}
      loadMore={loadSearchReel.bind(null, query)}
      actions={publicReelActions}
      myName={name}
      prompt={PUBLIC_PROMPT}
      focus={start ? { key: start, n: 0 } : null}
      header={
        <>
          <SiteHeader overlay />
          <Link
            href={map}
            className="absolute right-3 top-[calc(env(safe-area-inset-top)_+_3.75rem)] flex min-h-10 items-center gap-1.5 rounded-full bg-black/45 px-3.5 text-sm font-semibold text-white backdrop-blur-md hover:bg-black/60 sm:right-6"
          >
            <ArrowLeft aria-hidden size={16} /> Back to map
          </Link>
        </>
      }
      end={
        <div className="max-w-sm">
          <h2 className="font-display text-2xl">That&apos;s every home in this search</h2>
          <p className="mt-2 text-white/80">Change the filters on the map to see more.</p>
          <Link
            href={map}
            className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-5 font-semibold text-ink"
          >
            <ArrowLeft aria-hidden size={17} /> Back to the map
          </Link>
        </div>
      }
    />
  );
}
