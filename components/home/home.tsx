import { Bookmark, Building2, House, ListChecks, Send, UserRoundSearch } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HomeShell, ProfileRail, type RailLink } from "@/components/home/home-shell";
import { ClientActivity } from "@/components/home/client-activity";
import { PeopleCard } from "@/components/home/people-card";
import { FollowingFeed } from "@/components/home-feed";
import { Avatar } from "@/components/ui";
import type { BannerChoice } from "@/lib/banner";
import type { ClientEvent } from "@/lib/client-activity";
import type { ClientBook } from "@/lib/clients";
import type { FollowCounts } from "@/lib/follows";
import { cn } from "@/lib/format";
import type { FeedCounts, HomeFeedEntry } from "@/lib/home-feed";
import { hasRated, waitingLinks, type MyLink } from "@/lib/my-links";
import type { FoundPerson } from "@/lib/people";
import type { ReactionState } from "@/lib/reactions";
import { button, card } from "@/lib/ui";

// Home, one page for everyone. Down the left, them: their card and the places
// the bar at the top doesn't have. In the middle: the box to send homes; the
// homes their agent sent that are still waiting, when there are any; then
// their feed (lib/home-feed.ts): the home they just rated on their agent's
// link first, as their own ("You liked this home"), then what the people they
// follow did, woven with what's popular, new, near them and picked for them,
// until "You're all caught up". People to follow: down the right
// on a wide screen; on a narrower one, in the middle, in the feed.
// An agent's is the same page with their clients besides. Straight under the
// box to send homes: "Your clients", whoever is waiting first (ClientsRail).
// And two ways to look at the feed: Following (what the people they follow
// did in public, a client among them marked "Your client") or Clients
// (everything their clients did on the homes they were sent, theirs alone to
// see).

// "3 of 9 rated", then "Bellevue · Kirkland": the count first, so a narrow
// phone cuts the cities, never how far along they are.
function MetaOf({ link }: { link: MyLink }) {
  const rated = Math.max(0, link.homes - link.unrated);
  const cities = link.cities.slice(0, 3).join(" · ");
  return (
    <p className="flex min-w-0 gap-1 text-meta text-white/90">
      <span className="shrink-0">{`${rated} of ${link.homes} rated`}</span>
      {cities && <span className="min-w-0 truncate">· {cities}</span>}
    </p>
  );
}

// Their link, opened on the first home still waiting, not on ones they've
// already rated.
const openOn = (link: MyLink) =>
  link.firstWaiting ? `/s/${link.token}?home=${encodeURIComponent(link.firstWaiting)}` : `/s/${link.token}`;

// The homes their agent sent, over a photo of one of them: how many are
// waiting, and the agent's latest word. Only while some are waiting: once
// they've rated them all it's gone, and those homes are under Rated homes.
function FromYourAgent({ links }: { links: MyLink[] }) {
  const [link, ...others] = links;
  const first = link.agent.firstName || link.agent.name;
  // (Only links with a home still waiting come here: waitingLinks.)
  const title = `${link.unrated} new ${link.unrated === 1 ? "home" : "homes"} for you`;
  return (
    <section aria-labelledby="from-agent-title" className="flex flex-col gap-1.5">
      <div className="relative h-[184px] overflow-hidden rounded-2xl bg-stone-700 text-white">
        {link.firstPhoto && (
          <Image src={link.firstPhoto} alt="" fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
        )}
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 to-black/5" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <div className="min-w-0 flex-1 [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
            <p className="flex items-center gap-2 text-meta font-semibold">
              <Avatar name={link.agent.name} tone="agent" photo={link.agent.photo} size={6} className="ring-1 ring-white/60" />
              From {link.agent.name}
            </p>
            <h2 id="from-agent-title" className="mt-0.5 font-display text-2xl leading-tight">
              {title}
            </h2>
            <MetaOf link={link} />
            {link.latestAgentReply && (
              <p className="truncate text-meta text-white/90">
                <span className="font-semibold">{first}:</span> {link.latestAgentReply.body}
              </p>
            )}
          </div>
          <Link href={openOn(link)} className={cn(button({ kind: "light" }), "shrink-0")}>
            See them<span className="sr-only">, the homes from {link.agent.name}</span>
          </Link>
        </div>
      </div>
      {others.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 px-1 text-meta text-muted">
          <span>More:</span>
          {others.slice(0, 3).map((other) => (
            <Link
              key={other.shareId}
              href={openOn(other)}
              className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
            >
              Homes from {other.agent.firstName || other.agent.name}
              {other.cities[0] && <span className="ml-1 font-normal text-muted">· {other.cities[0]}</span>}
            </Link>
          ))}
        </p>
      )}
    </section>
  );
}

export function Home({
  firstName,
  me,
  follows,
  profileHref,
  links,
  suggestions,
  feed,
  mine,
  counts,
  agent,
}: {
  firstName: string;
  me: { id: string; name: string; photo: string | null; banner: BannerChoice };
  follows: FollowCounts;
  profileHref: string;
  // The links they're on, newest first.
  links: MyLink[];
  // People to follow, the likeliest first: the card shows three.
  suggestions: FoundPerson[];
  feed: HomeFeedEntry[];
  mine: Record<string, ReactionState>;
  // How many liked each home in the feed and how many comments it has, by key.
  counts: Record<string, FeedCounts>;
  // An agent, and so their clients too (and what those clients did on the
  // homes they were sent): everything else is anyone's home.
  agent?: { book: ClientBook; brokerage: string; brandColor: string; listings?: string; activity: ClientEvent[] };
}) {
  const agentName = links[0] && (links[0].agent.firstName || links[0].agent.name);
  // The card at the top: only the links with homes still waiting.
  const waiting = waitingLinks(links);
  // Only what the bar at the top doesn't have (it has Search, Send,
  // the Dashboard, and their own page under their face). Someone on an
  // agent's link (a pro too, when they're someone's client): the way back to
  // it, and the homes they've already liked or passed on.
  const saved: RailLink = { href: "/people/me?show=saved", label: "Saved homes", icon: <Bookmark size={18} /> };
  const people: RailLink = { href: "/search/people", label: "Find people", icon: <UserRoundSearch size={18} /> };
  const sent: RailLink[] = [
    ...(links[0] ? [{ href: `/s/${links[0].token}`, label: `Homes from ${agentName}`, icon: <House size={18} /> }] : []),
    ...(hasRated(links) ? [{ href: "/people/me/rated", label: "Rated homes", icon: <ListChecks size={18} /> }] : []),
  ];
  const places: RailLink[] = agent
    ? [{ href: "/dashboard/listings", label: agent.listings ?? "Listings", icon: <Building2 size={18} /> }, ...sent, saved, people]
    : [...sent, saved, people];
  const listOf = (which: "following" | "followers") =>
    profileHref.endsWith("/me") ? profileHref : `${profileHref}/${which}`;
  // People to follow where there's no rail beside the feed (a phone, a
  // tablet): the same card, in the middle. In a feed with cards in it, after
  // the caught-up line (or the third card), so a long feed doesn't bury it;
  // with no feed yet, once, under it.
  // (A pro's is what their clients are doing instead.)
  const peopleInline = (where: string) =>
    agent ? (
      <ClientActivity events={agent.activity} id={`activity-${where}`} className="lg:hidden" live={false} />
    ) : (
      <PeopleCard people={suggestions} id={`people-${where}`} className="lg:hidden" />
    );
  const quiet = feed.length === 0;
  // One feed for everyone: what the people they follow did, woven together
  // with what's popular, new deals and listings, homes near them and homes
  // picked for them (lib/home-feed.ts). Not a timeline, so no "new since".
  const following = (
    <FollowingFeed
      entries={feed}
      mine={mine}
      counts={counts}
      me={{ name: me.name, photo: me.photo, agent: Boolean(agent) }}
      seenAt={null}
      among={peopleInline("following")}
      empty={
        follows.following === 0 ? (
          <>
            <p>Follow people to see what they like.</p>
            <span className="mt-3 flex flex-wrap justify-center gap-2">
              <Link href="/search/people" className={button({ kind: "secondary" })}>
                Find people
              </Link>
              <Link href="/search" className={button({ kind: "secondary" })}>
                Search homes
              </Link>
            </span>
          </>
        ) : (
          "Nothing new yet."
        )
      }
    />
  );
  return (
    <HomeShell
      // (No greeting for an agent: it's their place of work.)
      title={!agent && firstName ? `Hi, ${firstName}` : "Your home"}
      left={
        <ProfileRail
          name={me.name}
          photo={me.photo}
          seed={me.id}
          banner={me.banner}
          agent={Boolean(agent)}
          bandColor={agent?.brandColor}
          line={
            agent ? agent.brokerage.trim() || "Real estate agent" : agentName ? `Looking with ${links[0].agent.name}` : ""
          }
          href={profileHref}
          stats={
            agent
              ? // (Who follows them is on their public profile: this number is their clients.)
                [{ label: "Clients", value: agent.book.clients.length, href: "/dashboard" }]
              : [
                  { label: "Following", value: follows.following, href: listOf("following") },
                  { label: "Followers", value: follows.followers, href: listOf("followers") },
                ]
          }
          links={places}
        />
      }
      // Beside the feed: a pro's clients, as they act on what was sent them;
      // for anyone else, people to follow.
      right={
        agent ? (
          <ClientActivity events={agent.activity} id="activity-rail" />
        ) : (
          <PeopleCard people={suggestions} id="people-rail" />
        )
      }
    >
      {/* Shaped like a box to type in, with the bar's own paper plane in it:
          the steps for sending homes (an agent's, to a client). */}
      <div className={cn(card, "flex items-center gap-3 p-3")}>
        <Avatar name={me.name} tone={agent ? "agent" : "person"} photo={me.photo} size={10} />
        <Link
          href={agent ? "/dashboard/new" : "/send"}
          aria-label={agent ? "Send homes to a client" : "Send homes to someone"}
          className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-stone-300 px-4 text-body hover:border-stone-400 hover:bg-stone-50"
        >
          <Send aria-hidden size={18} className="shrink-0 text-stone-500" />
          <span className="text-stone-600">Send homes…</span>
        </Link>
      </div>
      {/* (An agent's clients, and what they did, are on Clients.) */}
      {waiting.length > 0 && <FromYourAgent links={waiting} />}
      <section aria-labelledby="stream-title">
        <h2 id="stream-title" className="sr-only">
          Your feed
        </h2>
        {following}
      </section>
      {quiet && peopleInline("inline")}
    </HomeShell>
  );
}
