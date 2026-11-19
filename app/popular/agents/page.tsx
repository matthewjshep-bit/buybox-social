import { Building2 } from "lucide-react";
import { FollowButton } from "@/app/people/[id]/client";
import { PersonRow } from "@/components/person-row";
import { PopularTop } from "@/components/popular";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import { getPopularAgents } from "@/lib/popular";
import { getPublicIdentity } from "@/lib/public";
import { card, pageColumn } from "@/lib/ui";

export const metadata = { title: "Popular agents · Porchcard" };

// "8 for sale · 3 closed", leaving out a nothing.
const listings = (forSale: number, closed: number) =>
  [forSale > 0 && `${forSale} for sale`, closed > 0 && `${closed} closed`].filter(Boolean).join(" · ");

// Popular's third part: the agents with the most listings of their own, for
// sale and closed together, number one first. For anyone: an agent's page
// and their listings are public already. Only homes they listed themselves
// count (lib/popular.ts), so a home someone else listed that they put on
// their page is on their page but not in their number here.
export default async function PopularAgentsPage() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  const agents = await getPopularAgents({
    visitorId: account?.role ? (visitor?.id ?? null) : null,
    accountId: account?.id ?? null,
  });
  return (
    <main className={pageColumn()}>
      <PopularTop on="agents" people={Boolean(account)} />
      {agents.length > 0 ? (
        <ol aria-label="Popular agents" className={cn(card, "mt-4 divide-y divide-stone-100")}>
          {agents.map((agent, i) => (
            <PersonRow
              key={agent.profileId}
              rank={i + 1}
              href={`/people/${agent.profileId}?tab=listings`}
              name={agent.me ? `${agent.name} (you)` : agent.name}
              face={agent.face}
              photo={agent.photo}
              agent
              line={[agent.brokerage, listings(agent.forSale, agent.closed)].filter(Boolean).join(" · ")}
              action={
                // (Following is for someone signed in; and never yourself.)
                account && !agent.me ? (
                  <FollowButton small stay personId={agent.profileId} name={agent.name} following={agent.iFollow} />
                ) : undefined
              }
            />
          ))}
        </ol>
      ) : (
        <EmptyState icon={Building2} className="mt-4" title="No agents with listings yet" />
      )}
    </main>
  );
}
