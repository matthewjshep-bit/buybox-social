import { Bookmark, Heart, Home, Lock, MessageCircle, Pencil, ThumbsDown, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type CSSProperties } from "react";
import { FollowButton, Toast } from "@/app/people/[id]/client";
import { BetweenCard } from "@/components/between-card";
import { FeedFilter } from "@/components/feed-filter";
import { ListingGrid } from "@/components/listing-grid";
import { PostComposer } from "@/components/post-composer";
import { ProfileFeed } from "@/components/profile-feed";
import { ProfileHeader } from "@/components/profile-header";
import { TasteControls } from "@/components/taste-controls";
import { TasteStoryCard } from "@/components/taste-story-card";
import { EmptyState } from "@/components/ui";
import { getAgentListings, sameAgent } from "@/lib/agent-listings";
import { getCurrentUser } from "@/lib/auth";
import { getBetween } from "@/lib/between";
import { readDevice } from "@/lib/engagement";
import { follows, getFollowCounts } from "@/lib/follows";
import { cn } from "@/lib/format";
import {
  getProfileFeed,
  getProfilePerson,
  getProfileRows,
  getProfileSummary,
  isProfileShow,
  isTopicSide,
  parseAbout,
  parseBefore,
  PROFILE_FILTERS,
  type ProfilePerson,
  type ProfileShow,
  type TopicSide,
} from "@/lib/profile";
import { getPublicIdentity } from "@/lib/public";
import { OWN_PREFIX } from "@/lib/own-listings";
import { getSavedHomes } from "@/lib/saved";
import { storyOf } from "@/lib/taste-story";
import { ANONYMOUS_BUYER } from "@/lib/timeline";
import { yourClient, type YourClient } from "@/lib/your-client";
import { button, pill } from "@/lib/ui";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Who's looking: their own visitor row, if they have one. Once per request,
// for the page and its metadata alike.
const viewer = cache(async () => {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  return visitor;
});

// An agent looking at their own client's page: who they are on the agent's
// links. Only ever the agent's own, and only to them.
const clientOf = cache(async (personId: string, isMe: boolean): Promise<YourClient | null> => {
  if (isMe) return null;
  const account = await getCurrentUser();
  return account?.role === "agent" ? yourClient(account.id, personId) : null;
});

// What their page calls them. Someone who signed in with just an email has no
// name yet: on their own page it's "You" (the heading says "Your page" and asks
// for one), with the initial the header shows, from their email; to their
// agent, the first name the agent gave them on a link; to anyone else they're
// "A buyer", a plain figure. Never a stand-in like "Someone".
async function nameOf(person: ProfilePerson, isMe: boolean, client: YourClient | null = null) {
  if (person.name.trim()) return { name: person.name, face: person.name, unnamed: false };
  if (!isMe && client?.firstName) return { name: client.firstName, face: client.firstName, unnamed: false };
  if (!isMe) return { name: person.isAgent ? "An agent" : ANONYMOUS_BUYER, face: "", unnamed: true };
  return { name: "You", face: (await getCurrentUser())?.email ?? "", unnamed: true };
}

// What their page says about their taste, from everything public they've
// done (read with the feed's first page), less anything they've switched off.
const tasteOf = cache(async (person: ProfilePerson, mine: boolean) =>
  storyOf(await getProfileRows(person.id, mine), { hidden: person.tasteHidden, hidePasses: person.hidePasses }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const person = id.length > 64 ? null : await getProfilePerson(id);
  if (!person) return { title: "Not found · Porchcard" };
  const visitor = await viewer();
  const isMe = visitor?.id === person.id;
  const story = await tasteOf(person, isMe);
  const { name, unnamed } = await nameOf(person, isMe, await clientOf(person.id, isMe));
  // (An agent's page goes by their whole name.)
  const title = `${unnamed && isMe ? "Your profile" : (person.isAgent && person.agentName) || name} · Porchcard`;
  // The headline is from what everyone can see, whoever is looking, and it's
  // what a shared link to the page says under its title.
  // An agent with listings: their page is those first, so it says so.
  const listed = person.isAgent && !unnamed && (await getAgentListings(person.mlsAgentId, person.agentName, person.accountId)).length > 0;
  const description = listed
    ? `${name}'s listings${person.brokerage ? ` · ${person.brokerage}` : ""}, on Porchcard.`
    : story.headline ??
    (unnamed ? `What ${isMe ? "you like" : "they like"} in homes, on Porchcard.` : `What ${name} likes in homes, on Porchcard.`);
  return { title, description, openGraph: { title, description } };
}

// Someone's page, Facebook-style: who they are and what they keep liking,
// then everything they've done in public, one card per home per day, newest
// first. Filters and paging are plain links, so it all works without scripts.
export default async function ProfilePage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (id.length > 64) notFound();
  const [person, visitor] = await Promise.all([getProfilePerson(id), viewer()]);
  if (!person) notFound();
  const before = parseBefore(query.before);
  const isMe = visitor?.id === person.id;
  // What they pass on is theirs to keep from everyone else.
  const passes = isMe || !person.hidePasses;
  // Everything that needs only who they are and who's looking, read together.
  const [client, summary, listings, story, account, people, following, followsYou] = await Promise.all([
    // An agent's own client: said so, to that agent, with their homes a tap away.
    clientOf(person.id, isMe),
    getProfileSummary(person.id, isMe, passes),
    // An agent's page leads with their listings, when they have any.
    person.isAgent ? getAgentListings(person.mlsAgentId, person.agentName, person.accountId) : [],
    tasteOf(person, isMe),
    getCurrentUser(),
    // Who follows them, whom they follow, and whether that's whoever's looking.
    getFollowCounts(person.id),
    follows(visitor?.id, person.id),
    visitor ? follows(person.id, visitor.id) : false,
  ]);
  const { name, face, unnamed } = await nameOf(person, isMe, client);
  const show: ProfileShow = isProfileShow(query.show) ? query.show : "all";
  // The homes they saved: on their own profile only, and only ever theirs to see.
  const savedView = isMe && query.show === "saved";
  const saved = savedView ? await getSavedHomes(person.id) : [];
  // Their passes, asked for by someone they keep them from.
  const keptPrivate = show === "passed" && !passes;
  // Only a specific, or a thing they've done something with, can be a topic.
  const topic = parseAbout(query.about);
  const label = topic ? summary.topics.get(topic.toLowerCase()) : undefined;
  const about = label ? topic : null;
  const side: TopicSide | null =
    about && isTopicSide(query.side) && (passes || query.side === "like") ? query.side : null;
  // An agent's listings lead their page; what they've done is the other tab.
  // A filter or a page of earlier activity is always Activity.
  const tabs = listings.length > 0;
  const tab: "listings" | "activity" =
    tabs && query.tab !== "activity" && show === "all" && !savedView && !about && !before ? "listings" : "activity";
  const [feed, between] = await Promise.all([
    keptPrivate || tab === "listings"
      ? { cards: [], earlier: null }
      : getProfileFeed(person.id, { show, about, side, before, mine: isMe, passes }),
    // What's between whoever's looking and them: the links they're both on.
    // First on the page, for the one looking only.
    !isMe && account?.role && person.accountId ? getBetween(account.id, person.accountId) : [],
  ]);

  // The same page with other filters; paging starts over.
  const href = (next: { show?: ProfileShow; about?: string | null; side?: TopicSide; before?: string | null }) => {
    const params = new URLSearchParams();
    // Activity's own links say so, where Listings would otherwise lead.
    if (tabs) params.set("tab", "activity");
    const nextShow = next.show ?? show;
    const nextAbout = next.about === undefined ? about : next.about;
    const nextSide = next.about === undefined ? side : next.side;
    if (nextShow !== "all") params.set("show", nextShow);
    if (nextAbout) params.set("about", nextAbout);
    if (nextAbout && nextSide) params.set("side", nextSide);
    if (next.before) params.set("before", next.before);
    const search = params.toString();
    return `/people/${person.id}${search ? `?${search}` : ""}`;
  };

  const nothingYet = summary.counts.homes === 0 && feed.cards.length === 0 && !before;
  const chipHref = (key: string, side: TopicSide) => href({ about: key, side });
  const current = about ? { key: about.toLowerCase(), side } : null;
  // Everyone else sees only what they've kept on; they see it all, marked,
  // and counted from everything they've done (as their feed shows it).
  const loves = isMe ? story.own.loves : story.loves.filter((chip) => !chip.hidden);
  const passChips = isMe ? story.own.passes : passes ? story.passes.filter((chip) => !chip.hidden) : [];
  // The card is the things they like (and pass on): with none to show, it's
  // only on their own page, saying how to get there.
  const prompt = isMe && loves.length === 0 && passChips.length === 0;
  const showTaste = loves.length > 0 || passChips.length > 0 || (isMe && summary.counts.homes > 0);
  // Anything to switch: a chip, or passes (kept private or not) even when no chip shows them.
  const controllable = isMe && (loves.length > 0 || passChips.length > 0 || story.hasPasses || person.hidePasses);
  // What to show, on the first day's line: passes only for those who may see them.
  const control = keptPrivate ? null : (
    <FeedFilter
      current={savedView ? "saved" : show}
      options={[
        ...(["all", "liked", "passed", "comments"] as const)
          .filter((key) => key !== "passed" || passes)
          .map((key) => ({
            key,
            label: PROFILE_FILTERS[key],
            href: href({ show: key }),
            lock: key === "passed" && isMe && person.hidePasses,
          })),
        // Theirs alone, so only on their own profile.
        ...(isMe
          ? [{ key: "saved", label: "Saved", href: `/people/${person.id}?${tabs ? "tab=activity&" : ""}show=saved`, lock: true }]
          : []),
      ]}
    />
  );

  return (
    <main
      className="mx-auto max-w-xl px-4 pb-16 pt-4 lg:grid lg:max-w-6xl lg:grid-cols-[360px_minmax(0,600px)] lg:items-start lg:justify-center lg:gap-8 lg:px-6 lg:pt-6 xl:max-w-[1360px] xl:grid-cols-[340px_minmax(0,600px)_320px]"
      // Whatever is focused in the feed scrolls clear of the filters stuck above it.
      style={{ "--filters": about ? "5rem" : "0.5rem" } as CSSProperties}
    >
      {/* It stays put beside the feed only on screens tall enough to hold it (and then scrolls on
          its own if it still runs long); on shorter ones it scrolls away with the page, so nothing
          in it ever sits below the fold out of reach. On the widest screens it steps aside: who
          they are down the left, their taste down the right, each staying put the same way. */}
      <div className="flex flex-col gap-3 *:shrink-0 lg:-m-1 lg:p-1 xl:contents [@media(min-width:64rem)_and_(min-height:860px)]:sticky [@media(min-width:64rem)_and_(min-height:860px)]:top-2 [@media(min-width:64rem)_and_(min-height:860px)]:max-h-[calc(100dvh-1rem)] [@media(min-width:64rem)_and_(min-height:860px)]:overflow-y-auto [@media(min-width:64rem)_and_(min-height:860px)]:overscroll-contain">
        <div className="xl:col-start-1 xl:row-start-1 [@media(min-width:80rem)_and_(min-height:860px)]:sticky [@media(min-width:80rem)_and_(min-height:860px)]:top-2 [@media(min-width:80rem)_and_(min-height:860px)]:max-h-[calc(100dvh-1rem)] [@media(min-width:80rem)_and_(min-height:860px)]:overflow-y-auto [@media(min-width:80rem)_and_(min-height:860px)]:overscroll-contain xl:-m-1 xl:self-start xl:p-1">
          <ProfileHeader
            name={name}
            fullName={person.isAgent && !unnamed ? person.agentName || undefined : undefined}
            face={face}
            isMe={isMe}
            unnamed={unnamed}
            agent={person.isAgent}
            since={person.since}
            homes={summary.counts.homes}
            people={{ ...people, href: `/people/${person.id}` }}
            photo={person.photo}
            followsYou={followsYou}
            client={
              client
                ? {
                    homes: `/reel?from=client:${client.participantId}`,
                    link: `/dashboard/shares/${client.shareId}`,
                  }
                : undefined
            }
            bio={person.bio}
            links={person.links}
            brokerage={person.brokerage}
            personId={person.id}
            brandColor={person.brandColor}
            banner={person.banner}
            follow={
              isMe ? undefined : (
                <FollowButton
                  personId={person.id}
                  name={name}
                  following={following}
                  signIn={account?.role ? undefined : `/login?next=${encodeURIComponent(`/people/${person.id}`)}`}
                />
              )
            }
          />
        </div>
        {between.length > 0 && <BetweenCard id="between-phone" links={between} name={name} className="lg:hidden" />}
        {/* Their taste goes with what they've done: with their listings, it's out of the way. */}
        {showTaste && tab === "activity" && (
          <div className={cn("xl:col-start-3 xl:row-start-1 [@media(min-width:80rem)_and_(min-height:860px)]:sticky [@media(min-width:80rem)_and_(min-height:860px)]:top-2 [@media(min-width:80rem)_and_(min-height:860px)]:max-h-[calc(100dvh-1rem)] [@media(min-width:80rem)_and_(min-height:860px)]:overflow-y-auto [@media(min-width:80rem)_and_(min-height:860px)]:overscroll-contain xl:-m-1 xl:self-start xl:p-1")}>
            <TasteStoryCard
              name={name}
              isMe={isMe}
              prompt={prompt}
              loves={loves}
              passes={passChips}
              passesPrivate={isMe && person.hidePasses}
              current={current}
              chipHref={chipHref}
              controls={
                controllable ? (
                  <TasteControls loves={story.own.loves} passes={story.own.passes} hidePasses={person.hidePasses} />
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      {/* With their listings, the grid takes the room their taste would have had. */}
      <div className={cn("mt-3 min-w-0 lg:mt-0 xl:col-start-2 xl:row-start-1", tab === "listings" && "xl:col-span-2")}>
        {between.length > 0 && (
          <BetweenCard id="between-wide" links={between} name={name} className="mb-4 hidden lg:block" />
        )}
        {tabs && (
          <div className="mb-4 flex items-end border-b border-stone-200">
          <nav aria-label="Sections" className="-mb-px flex gap-1">
            {(["listings", "activity"] as const).map((key) => (
              <Link
                key={key}
                href={`/people/${person.id}?tab=${key}`}
                scroll={false}
                aria-current={tab === key ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 border-b-2 px-4 text-body font-semibold",
                  tab === key ? "border-stone-900 text-ink" : "border-transparent text-stone-600 hover:text-ink",
                )}
              >
                {key === "listings" ? "Listings" : "Activity"}
                {key === "listings" && <span className="text-muted tabular-nums">{listings.length}</span>}
              </Link>
            ))}
          </nav>
            {/* Their own: where they add and change the listings they keep themselves. */}
            {isMe && (
              <Link
                href="/dashboard/listings"
                className="ml-auto flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-brand underline-offset-2 hover:underline"
              >
                <Pencil aria-hidden size={15} /> Edit listings
              </Link>
            )}
          </div>
        )}
        {isMe && tab === "activity" && show === "all" && !about && !before && (
          <PostComposer me={{ name: face || name, photo: person.photo, agent: person.isAgent }} />
        )}
        {tab === "listings" ? (
          <ListingGrid
            listings={listings}
            from={`listings:${person.id}`}
            // A home they put here that someone else listed says who did.
            credit={(listing) =>
              listing.ListAgentFullName && !sameAgent(person.agentName, listing.ListAgentFullName)
                ? `Listed by ${listing.ListAgentFullName}`
                : null
            }
            // Their own profile: each listing they added themselves, a tap from changing it.
            edit={
              isMe
                ? (listing) => (listing.ListingKey.startsWith(OWN_PREFIX) ? `/dashboard/listings/${listing.ListingKey}` : null)
                : undefined
            }
          />
        ) : savedView ? (
          <section aria-labelledby="saved-title">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="saved-title" className="flex items-center gap-1.5 text-body font-semibold text-muted">
                Saved
                <Lock aria-hidden size={13} />
                <span className="sr-only">Only you see this</span>
              </h2>
              {control}
            </div>
            <div className="mt-2">
              {saved.length > 0 ? (
                <ListingGrid listings={saved} from="saved" label="Saved homes" />
              ) : (
                <EmptyState icon={Bookmark} title="Nothing saved yet">
                  Save a home to find it here.
                </EmptyState>
              )}
            </div>
          </section>
        ) : nothingYet ? (
          isMe ? (
            <>
              {/* Nothing liked or said yet still leaves the way to what they saved. */}
              <div className="mb-1 flex justify-end">{control}</div>
              <EmptyState
                icon={Home}
                title="Nothing here yet"
                action={
                  <Link href="/reel" data-empty-action className={button({ kind: "primary" })}>
                    See homes
                  </Link>
                }
              />
            </>
          ) : (
            <EmptyState icon={Home} title="Nothing yet">
              {name} hasn&apos;t liked anything yet.
            </EmptyState>
          )
        ) : (
          <>
            {/* A taste chip can narrow it; then it says so, with the way back. (Liked, Didn't like
                and Comments are chosen on the first day's line.) Its own edge and background reach
                past the cards' rings, so nothing shows round it once it sticks. */}
            {about && label && (
              <nav
                aria-label="Showing"
                className="sticky top-0 z-30 -mx-4 flex flex-wrap gap-2 bg-surface px-4 py-3 shadow-[0_1px_0_var(--color-stone-200)] lg:-mx-2 lg:-mt-3 lg:px-2"
              >
                <Link
                  href={href({ about: null })}
                  aria-label={`Remove ${label}`}
                  className={cn(pill(), "min-w-0 bg-white text-ink ring-2 ring-ink hover:bg-stone-50")}
                >
                  {side === "like" && <Heart aria-hidden size={14} className="shrink-0 fill-rose-600 text-rose-600" />}
                  {side === "pass" && <ThumbsDown aria-hidden size={14} className="shrink-0 text-amber-700" />}
                  <span className="truncate">{label}</span>
                  <X aria-hidden size={16} className="shrink-0" />
                </Link>
              </nav>
            )}
            {keptPrivate ? (
              <EmptyState
                icon={Lock}
                title={`${name} keeps passes private.`}
                action={
                  <Link href={href({ show: "all" })} data-empty-action className={button({ kind: "secondary" })}>
                    See everything
                  </Link>
                }
              />
            ) : feed.cards.length > 0 || feed.earlier ? (
              <ProfileFeed
                cards={feed.cards}
                name={name}
                face={face}
                isMe={isMe}
                agent={person.isAgent}
                earlierHref={feed.earlier ? href({ before: feed.earlier }) : null}
                reelFrom={person.id}
                photo={person.photo}
                filters={{ show, about, side }}
                control={control}
              />
            ) : (
              <>
                {/* Nothing to show still leaves the way to show something else. */}
                <div className="mb-1 flex justify-end">{control}</div>
                {before ? (
                  <EmptyState icon={Home} title="That's all">
                    <Link href={href({})} className="font-semibold text-brand underline-offset-2 hover:underline">
                      Newest
                    </Link>
                  </EmptyState>
                ) : label ? (
                  <EmptyState icon={Home} title={`Nothing about the ${label.toLowerCase()} yet.`} />
                ) : show === "passed" ? (
                  <EmptyState icon={ThumbsDown} title="Nothing passed on yet." />
                ) : show === "comments" ? (
                  <EmptyState icon={MessageCircle} title="No comments yet." />
                ) : (
                  <EmptyState icon={Heart} title="Nothing liked yet." />
                )}
              </>
            )}
          </>
        )}
      </div>
      {/* What you just did on your page, said in a word: "Link copied", "Like removed". */}
      {isMe && <Toast />}
    </main>
  );
}
