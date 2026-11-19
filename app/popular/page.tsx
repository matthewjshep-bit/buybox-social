import { Flame } from "lucide-react";
import Link from "next/link";
import { PopularHomes, PopularTop } from "@/components/popular";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { defaultPeriod, getPopularHomes, isPeriod } from "@/lib/popular";
import { button, pageColumn } from "@/lib/ui";

export const metadata = { title: "Popular · Porchcard" };

// Popular, in the bar: the homes people like and talk about most, number one
// first, over this week, this month, or all time. (Its other half, the
// people who like and comment the most, is /popular/people.) Opens on this
// week unless too little happened in it to make a list.
export default async function PopularPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, params] = await Promise.all([getCurrentUser(), searchParams]);
  const period = isPeriod(params.period) ? params.period : await defaultPeriod("homes");
  const homes = await getPopularHomes(period);
  return (
    <main className={pageColumn()}>
      <PopularTop on="homes" period={period} people={Boolean(account)} />
      {homes.length > 0 ? (
        <PopularHomes homes={homes} period={period} />
      ) : (
        <EmptyState
          icon={Flame}
          className="mt-4"
          title={period === "all" ? "Nothing here yet" : "Nothing yet in that time"}
          action={
            <Link href="/search" className={button({ kind: "secondary" })}>
              Search homes
            </Link>
          }
        >
          Like a home and it shows up here.
        </EmptyState>
      )}
    </main>
  );
}
