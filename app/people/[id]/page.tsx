import { Bookmark, Heart, Home, Lock, MessageCircle, Pencil, ThumbsDown, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type CSSProperties } from "react";
import { FollowButton, Toast } from "@/app/people/[id]/client";
import { BetweenCard } from "@/components/between-card";
import { FeedFilter } from "@/components/feed-filter";
import { ListingGrid } from "@/components/listing-grid";
import { ListingsMap } from "@/components/listings-map";
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
import { getMyLinks } from "@/lib/my-links";
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
import { getListingCounts } from "@/lib/listing-counts";
import { getListingsLook, OWN_PREFIX } from "@/lib/own-listings";
import { getSavedHomes } from "@/lib/saved";
import { storyOf } from "@/lib/taste-story";
import { ANONYMOUS_BUYER } from "@/lib/timeline";
import { yourClient, type YourClient } from "@/lib/your-client";
import { button, link as linkClass, pageLabel, pill, tab as tabClass } from "@/lib/ui";

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
    // Who follows them, whom they follow (as whoever's looking may know it:
    // never an agent's clients), and whether that's whoever's looking.
    getFollowCounts(person.id, visitor?.id ?? null),
    follows(visitor?.id, person.id),
    visitor ? follows(person.id, visitor.id) : false,
  ]);
  const { name, face, unnamed } = await nameOf(person, isMe, client);
  // On their own page, someone an agent has sent homes to is told those stay
  // private. (The bar at the top has already asked for the same links.)
  const onLink = isMe && account?.role && account.role !== "agent" ? (await getMyLinks(account.id)).length > 0 : false;
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

  // Where each of their listings is, for the map under them (those that say where).
  const pins = listings.flatMap((listing) =>
    listing.Latitude != null && listing.Longitude != null
      ? [
          {
            key: listing.ListingKey,
            latitude: listing.Latitude,
            longitude: listing.Longitude,
            price: listing.ListPrice,
            address: listing.UnparsedAddress,
          },
        ]
      : [],
  );
  const taste = showTaste && tab === "activity";

  // Who they are, across the top; under it, what's theirs: an agent's
  // listings (and where they are), or what they've done, their taste beside it.
  return (
    <main
      className="mx-auto max-w-4xl px-4 pb-16 pt-4 lg:px-6 lg:pt-6"
      // Whatever is focused in the feed scrolls clear of the filters stuck above it.
      style={{ "--filters": about ? "5rem" : "0.5rem" } as CSSProperties}
    >
      {/* Their own: said small, as the dashboard says what it is. */}
      {isMe && <p className={cn(pageLabel, "mb-2")}>Your public profile</p>}
      <ProfileHeader
        name={name}
        fullName={person.isAgent && !unnamed ? person.agentName || undefined : undefined}
        face={face}
        isMe={isMe}
        // (Said only while it's so: by default what they do there shows here.)
        onLink={onLink && person.hideLinks}
        unnamed={unnamed}
        agent={person.isAgent}
        since={person.since}
        people={{ ...people, href: `/people/${person.id}` }}
        photo={person.photo}
        followsYou={followsYou}
        client={
          client
            ? {
                homes: `/reel?from=client:${client.participantId}`,
                // (Signed up, or they'd have no page: so their client page is their account's.)
                page: person.accountId
                  ? `/dashboard/clients/${encodeURIComponent(`acct:${person.accountId}`)}`
                  : `/dashboard/shares/${client.shareId}`,
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
      {between.length > 0 && <BetweenCard id="between" links={between} name={name} className="mt-3" />}
      {tabs && (
        <div className="mt-3 flex items-end border-b border-stone-200">
          <nav aria-label="Sections" className="-mb-px flex gap-1">
            {(["listings", "activity"] as const).map((key) => (
              <Link
                key={key}
                href={`/people/${person.id}?tab=${key}`}
                scroll={false}
                aria-current={tab === key ? "page" : undefined}
                className={tabClass(tab === key)}
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
              className={cn(linkClass, "ml-auto flex min-h-11 items-center gap-1.5 px-2 text-sm")}
            >
              <Pencil aria-hidden size={15} /> Edit listings
            </Link>
          )}
        </div>
      )}

      <div
        className={cn(
          "mt-4",
          tab === "activity" &&
            (taste ? "lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-6" : "mx-auto max-w-[600px]"),
        )}
      >
        {/* Their taste goes with what they've done: beside it on a wide screen (staying put
            as the feed scrolls), above it on a phone. With their listings, it's out of the way. */}
        {taste && (
          <div className="mb-3 lg:sticky lg:top-2 lg:mb-0">
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
        <div className="min-w-0">
        {isMe && tab === "activity" && show === "all" && !about && !before && (
          <PostComposer me={{ name: face || name, photo: person.photo, agent: person.isAgent }} />
        )}
        {tab === "listings" ? (
          <>
          <ListingGrid
            listings={listings}
            from={`listings:${person.id}`}
            counts={await getListingCounts(listings.map((listing) => listing.ListingKey))}
            // As they chose to lay them out.
            layout={(await getListingsLook(person.accountId)).layout}
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
            {pins.length > 0 && <ListingsMap homes={pins} from={`listings:${person.id}`} />}
          </>
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
                <ListingGrid
                  listings={saved}
                  from="saved"
                  label="Saved homes"
                  layout="grid2"
                  counts={await getListingCounts(saved.map((listing) => listing.ListingKey))}
                />
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
                  <Link href="/search" data-empty-action className={button({ kind: "primary" })}>
                    Search homes
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
      </div>
      {/* What you just did on your page, said in a word: "Link copied", "Like removed". */}
      {isMe && <Toast />}
    </main>
  );
}
