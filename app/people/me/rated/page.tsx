import { ArrowLeft, Heart, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, HomeThumb } from "@/components/ui";
import { getCurrentUser, signInPath } from "@/lib/auth";
import { cn, formatPrice } from "@/lib/format";
import { getRatedHomes, type RatedHome } from "@/lib/my-links";
import { backLink, card, groupLabel, pageColumn, pageTitle } from "@/lib/ui";

export const metadata = { title: "Rated homes · Porchcard" };

// The homes their agents sent that they've made up their mind on: Liked, then
// Passed, the newest first in each. Home's card at the top is only for homes
// still waiting, so this is where the rest go. A tap opens the home on its
// link, where they can change their mind. Only their own take: what the
// agent noted, and anyone else's, is never here.
export default async function RatedHomesPage() {
  const account = await getCurrentUser();
  if (!account?.role) redirect(await signInPath("/people/me/rated"));
  const homes = await getRatedHomes(account.id);
  const groups = [
    { id: "liked", title: "Liked", homes: homes.filter((home) => home.verdict === "like") },
    { id: "passed", title: "Passed", homes: homes.filter((home) => home.verdict === "pass") },
  ].filter((group) => group.homes.length > 0);

  return (
    <main className={pageColumn()}>
      <Link href="/" className={backLink}>
        <ArrowLeft aria-hidden size={18} />
        Home
      </Link>
      <h1 className={cn(pageTitle, "mt-2")}>Rated homes</h1>
      {homes.length > 0 && <p className="mt-1 text-body text-muted">Tap a home to change your mind.</p>}
      {homes.length === 0 ? (
        <EmptyState title="Homes you like or pass on show up here." className="mt-6" />
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`rated-${group.id}`}>
              <h2 id={`rated-${group.id}`} className={groupLabel}>
                {group.title} · {group.homes.length}
              </h2>
              <ul className={cn(card, "mt-2 divide-y divide-stone-100 overflow-hidden")}>
                {group.homes.map((home) => (
                  <Row key={home.listingKey} home={home} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

// One home: its photo, price and address, who sent it, and their take, the
// whole row a link to it on their link.
function Row({ home }: { home: RatedHome }) {
  const liked = home.verdict === "like";
  return (
    <li>
      <Link
        href={`/s/${home.token}?home=${encodeURIComponent(home.listingKey)}`}
        className="flex min-h-11 items-center gap-3 p-3 hover:bg-stone-50"
      >
        <HomeThumb src={home.photo} sizes="64px" className="size-16" />
        <span className="min-w-0 flex-1">
          {home.price !== null && <span className="block font-semibold tabular-nums">{formatPrice(home.price)}</span>}
          <span className="block truncate text-body">{home.address}</span>
          <span className="block truncate text-meta text-muted">From {home.agentName}</span>
        </span>
        {/* Their take, by its icon as on the photo: a rose heart, or the X. */}
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            liked ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-800",
          )}
        >
          {liked ? (
            <Heart aria-hidden size={18} className="fill-current" />
          ) : (
            <X aria-hidden size={18} strokeWidth={2.5} />
          )}
          <span className="sr-only">{liked ? "Liked" : "Passed"}</span>
        </span>
      </Link>
    </li>
  );
}
