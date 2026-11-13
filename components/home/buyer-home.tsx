import { House, Map as MapIcon, Send, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FollowText } from "@/components/home/follow-text";
import { HomeShell, ProfileRail, type RailLink } from "@/components/home/home-shell";
import { Lenses } from "@/components/home/lens-pills";
import { PicksMasonry } from "@/components/home/picks-masonry";
import { FollowingFeed } from "@/components/home-feed";
import { Avatar } from "@/components/ui";
import type { FeedPost } from "@/lib/feed";
import type { FollowCounts } from "@/lib/follows";
import { cn } from "@/lib/format";
import type { FeedWho, FollowedFace, HomeFeedEntry } from "@/lib/home-feed";
import type { MyLink } from "@/lib/my-links";
import type { ReactionState } from "@/lib/reactions";
import { button, card } from "@/lib/ui";
import type { HomeLens } from "./agent-home";

// Anyone else's home: discovery. Down the left, them: their card (who they
// follow, who follows them) and their places. In the middle, the homes their
// agent sent, when there are any; then what the people they follow liked (or,
// a tap away, homes picked for them), until "You're all caught up"; then more
// homes picked by their taste. Down the right on a wide screen, people worth
// following. One filled button: their agent's homes.

// "Bellevue · Kirkland · you've rated 3 of 9"
function metaOf(link: MyLink) {
  const rated = Math.max(0, link.homes - link.unrated);
  return [...link.cities.slice(0, 3), `you've rated ${rated} of ${link.homes}`].join(" · ");
}

// The homes their agent sent, over a photo of one of them: how many are
// waiting, and the agent's latest word. The page's one filled button.
function FromYourAgent({ links }: { links: MyLink[] }) {
  const [link, ...others] = links;
  const first = link.agent.firstName || link.agent.name;
  const title =
    link.unrated > 0 ? `${link.unrated} new ${link.unrated === 1 ? "home" : "homes"} for you` : `Your homes from ${first}`;
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
            <p className="truncate text-meta text-white/90">{metaOf(link)}</p>
            {link.latestAgentReply && (
              <p className="truncate text-meta text-white/90">
                <span className="font-semibold">{first}:</span> {link.latestAgentReply.body}
              </p>
            )}
          </div>
          <Link href={`/s/${link.token}`} className={cn(button({ kind: "light" }), "shrink-0")}>
            See them<span className="sr-only">, the homes from {link.agent.name}</span>
          </Link>
        </div>
      </div>
      {others.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 px-1 text-meta text-muted">
          <span>
            +{others.length} more {others.length === 1 ? "link" : "links"}:
          </span>
          {others.slice(0, 3).map((other) => (
            <Link
              key={other.shareId}
              href={`/s/${other.token}`}
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

// People worth following, beside the stream on a wide screen.
function TastePeople({ people }: { people: (FeedWho & { profileId: string })[] }) {
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="taste-rail-title" className={cn(card, "p-4")}>
      <h2 id="taste-rail-title" className="text-body font-semibold">
        People with your taste
      </h2>
      <ul className="mt-1 divide-y divide-stone-200">
        {people.slice(0, 3).map((person) => (
          <li key={person.profileId} className="flex items-center gap-3 py-1.5">
            <Link href={`/people/${person.profileId}`} className="group flex min-h-11 min-w-0 flex-1 items-center gap-3">
              <Avatar name={person.face || person.name} tone={person.agent ? "agent" : "person"} photo={person.photo} size={9} />
              <span className="truncate text-body group-hover:underline">{person.name}</span>
            </Link>
            <FollowText personId={person.profileId} name={person.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BuyerHome({
  firstName,
  me,
  follows,
  profileHref,
  links,
  followed,
  suggestions,
  feed,
  mine,
  seenAt,
  picks,
  lens,
}: {
  firstName: string;
  me: { name: string; photo: string | null };
  follows: FollowCounts;
  profileHref: string;
  // The links they're on, newest first.
  links: MyLink[];
  followed: FollowedFace[];
  suggestions: (FeedWho & { profileId: string })[];
  feed: HomeFeedEntry[];
  mine: Record<string, ReactionState>;
  seenAt: string | null;
  picks: FeedPost[];
  lens: HomeLens;
}) {
  // Following first for someone with people to follow along with (or an
  // agent, whose clients follow them); otherwise homes picked for them.
  const fallback = followed.length >= 3 || links.length > 0 ? "following" : "foryou";
  const initial = lens.initial === "following" || lens.initial === "foryou" ? lens.initial : fallback;
  const agentName = links[0] && (links[0].agent.firstName || links[0].agent.name);
  const places: RailLink[] = [
    ...(links[0]
      ? [{ href: `/s/${links[0].token}`, label: `Homes from ${agentName}`, icon: <Send size={18} /> }]
      : []),
    { href: "/reel", label: "Browse homes", icon: <House size={18} /> },
    { href: "/search", label: "Map", icon: <MapIcon size={18} /> },
    { href: profileHref, label: "Your page", icon: <UserRound size={18} /> },
  ];
  const listOf = (which: "following" | "followers") =>
    profileHref.endsWith("/me") ? profileHref : `${profileHref}/${which}`;
  return (
    <HomeShell
      title={firstName ? `Hi, ${firstName}` : "Your home"}
      left={
        <ProfileRail
          name={me.name}
          photo={me.photo}
          agent={false}
          line={agentName ? `Looking with ${links[0].agent.name}` : "Finding a home"}
          href={profileHref}
          stats={[
            { label: "Following", value: follows.following, href: listOf("following") },
            { label: "Followers", value: follows.followers, href: listOf("followers") },
          ]}
          links={places}
        />
      }
      right={<TastePeople people={suggestions} />}
    >
      {links.length > 0 && <FromYourAgent links={links} />}
      <section aria-labelledby="stream-title">
        <h2 id="stream-title" className="sr-only">
          What&apos;s new
        </h2>
        <Lenses
          label="Show"
          lenses={[
            { key: "following", label: "Following" },
            { key: "foryou", label: "For you" },
          ]}
          initial={initial}
          fromUrl={lens.fromUrl && (lens.initial === "following" || lens.initial === "foryou")}
          panels={{
            following: (
              <FollowingFeed
                entries={feed}
                mine={mine}
                seenAt={seenAt}
                suggestions={suggestions}
                empty={
                  followed.length === 0
                    ? "Follow people with your taste, and what they like shows up here."
                    : "Nothing from the people you follow yet. What they like shows up here."
                }
              />
            ),
            foryou: null,
          }}
        />
      </section>
      <PicksMasonry
        picks={picks}
        intro={followed.length === 0 && links.length === 0 ? "Like a few homes and we'll learn your taste." : undefined}
      />
    </HomeShell>
  );
}
