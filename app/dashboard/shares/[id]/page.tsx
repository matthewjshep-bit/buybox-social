import { ArrowLeft, Check, ChevronRight, Clock, Globe, Heart, PenLine, Plus, Tag, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar, Badge, HomeThumb } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { headlineFromTimeline, type FeedPost } from "@/lib/feed";
import { appUrl, cn, formatPrice, timeAgo } from "@/lib/format";
import { aspectOfTag, FACTS, mediaKeyOf, NO_PHOTO_LIKES, photoTags, tagPosition, thingOf } from "@/lib/photos";
import { aspectLabel, NO_REACTION, type Aspect, type ReactionState } from "@/lib/reactions";
import { comparePeople, suggestHomes, type Suggestion } from "@/lib/compare";
import { photoUrl } from "@/lib/person-photo";
import { getSharePhotoLikes, getShareTimelines, type TimelineReaction } from "@/lib/timeline";
import {
  clientActivity,
  confidantOf,
  describeTake,
  duration,
  getHomeViews,
  getShareListings,
  homeViewKey,
  spotsWhere,
  getShareOpens,
  getThread,
  linkTitle,
  photosSeenLine,
  type HomeView,
  type Share,
  type ShareOpen,
  type TakeMark,
  type ThreadComment,
} from "@/lib/shares";
import { button, card } from "@/lib/ui";
import { addSuggestedHome } from "../../actions";
import { Opened } from "../../opened";
import {
  AddPersonForm,
  EditPersonName,
  WelcomeEditor,
  CommentLike,
  CommentMenu,
  HomeMovedStatus,
  HomeScorecards,
  MarkSeen,
  RemoveHomeButton,
  RemovePersonButton,
  ReplyForm,
  ScorecardButton,
  SendLink,
  ShowTarget,
  SpotChip,
} from "./client";

type Listings = Awaited<ReturnType<typeof getShareListings>>;
type Listing = Listings[number];
type Thread = Awaited<ReturnType<typeof getThread>>;

const key = (thing: string) => thing.toLowerCase();
const uniq = (things: string[]) => things.filter((thing, i) => things.findIndex((t) => key(t) === key(thing)) === i);

// A client's page, one part at a time: the homes and what was said about
// them; what they want, and homes to send them next; and the people on it,
// each with their own link to send, and what it opens on.
const TABS = [
  { key: "homes", label: "Homes" },
  { key: "want", label: "What they want" },
  { key: "people", label: "People & link" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Everything one client has told this agent. At the top, who it's for and how
// it's going; then the part they asked for. Until it's been opened it starts
// on sending it, after that on the homes.
export default async function ShareDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const agent = await requireAgent();
  const { id } = await params;
  const { tab: asked } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const [share] = await sql<(Share & { quick: boolean })[]>`
    select id, token, agent_id, client_name, note, headline, quick from shares
    where id = ${id} and agent_id = ${agent.id}`;
  if (!share) notFound();

  const [listings, thread, people, opens, [{ latest }], confidant, [take], views, others, [me]] = await Promise.all([
    getShareListings(share.id, { includeRemoved: true }),
    getThread(share.id),
    // Everyone on the package: people the agent added, in the order they did,
    // and anyone who joined through the package's own link; with their
    // profile, once they're on Porchcard.
    sql<
      {
        id: string;
        first_name: string;
        token: string | null;
        profile: string | null;
        photo_v: string | null;
        bound: boolean;
        found: boolean;
      }[]
    >`
      select p.id, p.first_name, p.token, v.id as profile, left(md5(acc.photo_data_url), 10) as photo_v,
        p.account_id is not null as bound,
        -- Picked from Porchcard rather than typed in.
        coalesce(p.added_from in ('client', 'follow', 'search'), false) as found
      from participants p
      left join visitors v on v.account_id = p.account_id
      left join accounts acc on acc.id = p.account_id
      where p.share_id = ${id}
      order by p.invited_at nulls last, p.position nulls last, p.created_at, p.first_name`,
    getShareOpens(share.id),
    // The newest thing a client did here, to the microsecond, so seeing this
    // page clears exactly that much from the dashboard's "new".
    sql<{ latest: string | null }[]>`
      select to_char(max(a.at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as latest
      from (${clientActivity()}) a where a.share_id = ${id}`,
    // Whoever was told only they and the agent see what they say on it.
    confidantOf(share.id),
    // The agent's own first pass on it: their notes, likes and dislikes.
    sql<{ notes: number; likes: number; dislikes: number }[]>`
      select
        (select count(*)::int from comments
          where share_id = ${id} and agent_id is not null and parent_id is null and reply_to_participant is null) as notes,
        (select count(*)::int from share_agent_likes where share_id = ${id} and reaction = 'like') as likes,
        (select count(*)::int from share_agent_likes where share_id = ${id} and reaction = 'dislike') as dislikes`,
    // Where they spent their time on it, home by home.
    getHomeViews([id]),
    // Other links to the same client (the same name), newest first.
    share.client_name.trim()
      ? sql<{ id: string; created_at: Date; homes: number }[]>`
          select s.id, s.created_at,
            (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes
          from shares s
          where s.agent_id = ${agent.id} and s.id <> ${id}
            and lower(trim(s.client_name)) = ${share.client_name.trim().toLowerCase()}
          order by s.created_at desc`
      : [],
    // The agent's own face, for their comments in the thread.
    sql<{ visitor_id: string | null; photo_v: string | null }[]>`
      select v.id as visitor_id, left(md5(a.photo_data_url), 10) as photo_v
      from accounts a left join visitors v on v.account_id = a.id
      where a.id = ${agent.id}`,
  ]);
  const agentPhoto = me?.visitor_id ? photoUrl(me.visitor_id, me.photo_v) : null;
  const lastOpen = opens.reduce<string | null>((at, open) => (!at || open.lastAt > at ? open.lastAt : at), null);
  const tab = TABS.find((t) => t.key === asked)?.key;
  const tabHref = (key: Tab) => `/dashboard/shares/${share.id}?tab=${key}`;
  // Which part it starts on goes in the address, so the page stays on it when
  // it refreshes (a client opening the link meanwhile doesn't move the agent).
  if (!tab) redirect(tabHref(lastOpen ? "homes" : "people"));
  const active = listings.filter((l) => !l.removedAt);
  const removed = listings.filter((l) => l.removedAt);
  // Who it's for: the people on it, by first name, kept up to date by the
  // database; with nobody on it yet, the first home on it.
  const clientName = linkTitle(share.client_name, active[0]?.UnparsedAddress ?? listings[0]?.UnparsedAddress);
  const invitees = people.filter((p) => p.token);
  const joined = people.filter((p) => !p.token);
  const packageOpens = opens.filter((open) => !invitees.some((person) => person.id === open.participantId));
  const everyone = people.map((p) => ({ id: p.id, name: p.first_name }));
  // Each person who has signed up, to their profile.
  const profiles = new Map(people.flatMap((p) => (p.profile ? [[p.id, `/people/${p.profile}`] as const] : [])));
  const comparison = comparePeople(everyone, thread, listings);
  const [{ suggestions, together }, timelines, photoLikes] = await Promise.all([
    suggestHomes(everyone, thread, listings),
    // Each home's Porchcard: the link's own conversation, as its people see it.
    getShareTimelines(share.id, listings, null),
    getSharePhotoLikes(share.id, listings.map((listing) => listing.ListingKey), null),
  ]);
  // The clients' comments the agent has hearted, as their thread shows them.
  const liked = new Set(
    [...timelines.values()].flat().flatMap((item) => (item.kind === "comment" && item.likedBy ? [item.id] : [])),
  );
  const oneHome = active.length === 1 ? { address: active[0].UnparsedAddress, price: active[0].ListPrice } : undefined;
  // Every photo on their link, for "saw 3 of 4 photos".
  const photos = active.reduce((sum, listing) => sum + listing.Media.length, 0);
  // At a glance, at the top: when they last opened it, how the homes on it
  // went, how much of it they looked at, and for how long.
  const verdicts = active.map((listing) => homeVerdict(listing.ListingKey, thread));
  const likedHomes = verdicts.filter((v) => v === "like").length;
  const passedHomes = verdicts.filter((v) => v === "pass").length;
  const photosLooked = Math.min(photos, Math.max(0, ...opens.map((open) => open.photosSeen)));
  const viewOf = (listingKey: string) => views.get(homeViewKey(share.id, listingKey));
  const seconds = active.reduce((sum, listing) => sum + (viewOf(listing.ListingKey)?.seconds ?? 0), 0);
  // Each home as its Porchcard needs it, from this link alone: never anything
  // public, and nobody from any other link.
  // (Without when it was taken off the link: the card shows the listing alone.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const posts = listings.map(({ removedAt, ...listing }): FeedPost => {
    const timeline = timelines.get(listing.ListingKey) ?? [];
    const likes = timeline.filter(
      (item): item is TimelineReaction =>
        item.kind === "reaction" && !item.isAgent && (item.state.reaction === "like" || item.photos.length > 0),
    );
    return {
      listing,
      headline: headlineFromTimeline(timeline),
      likes: likes.length,
      likers: likes.map((item) => item.name),
      dislikes: 0,
      aspects: { liked: {}, disliked: {} },
      publicComments: 0,
      privateComments: 0,
      timeline,
      photoLikes: photoLikes.get(listing.ListingKey) ?? NO_PHOTO_LIKES,
      mine: NO_REACTION,
      buzz: { sends: 0, views: 0, lastActivityAt: null, trending: false },
      reasons: [],
      members: people.map((person) => person.first_name),
    };
  });
  return (
    <HomeScorecards
      posts={posts}
      offLink={removed.map((listing) => listing.ListingKey)}
      agentName={agent.full_name || "Your agent"}
    >
      <div className="@container">
        <LiveRefresh />
        <HomeMovedStatus />
        <MarkSeen shareId={share.id} latest={latest} />
        <ShowTarget />
        <Link href="/dashboard" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
          <ArrowLeft aria-hidden size={16} /> All clients
        </Link>

        {/* Who it's for, and the one thing to do next: send them more. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h1 className="mt-1 min-w-0 break-words font-display text-3xl">{clientName}</h1>
          <Link
            href={`/dashboard/new?share=${share.id}`}
            className={cn(button({ kind: "primary" }), "mt-1 shrink-0 whitespace-nowrap")}
          >
            <Plus aria-hidden size={16} /> Send more homes
          </Link>
        </div>
        {people.length > 0 && (
          <p className="mt-1 text-sm text-stone-700">
            On this link:{" "}
            {people.map((person, i) => (
              <span key={person.id}>
                {i > 0 && " · "}
                <PersonName name={person.first_name} href={profiles.get(person.id)} />
              </span>
            ))}{" "}
            ·{" "}
            <Link href={tabHref("people")} scroll={false} className="font-medium text-brand underline-offset-2 hover:underline">
              Add or remove people
            </Link>
          </p>
        )}
        {others.length > 0 && (
          <nav aria-label={`Other links to ${clientName}`} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-stone-700">Also sent to {clientName}:</span>
            {others.map((other) => (
              <Link
                key={other.id}
                href={`/dashboard/shares/${other.id}`}
                className="rounded-full bg-white px-3 py-1.5 font-medium ring-1 ring-stone-200 hover:ring-stone-400"
              >
                {other.created_at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}{" "}
                · {other.homes === 1 ? "1 home" : `${other.homes} homes`}
              </Link>
            ))}
          </nav>
        )}

        <dl aria-label="At a glance" className="mt-4 grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Glance label="Last opened" warn={!lastOpen}>
            {lastOpen ? <Opened at={lastOpen} bare /> : "Not yet"}
          </Glance>
          <Glance label={active.length === 1 ? "The home sent" : `${active.length} homes sent`}>
            {likedHomes + passedHomes === 0
              ? "No reactions yet"
              : [likedHomes > 0 && `${likedHomes} liked`, passedHomes > 0 && `${passedHomes} passed`].filter(Boolean).join(" · ")}
          </Glance>
          <Glance label="Photos looked at">{photos ? `${photosLooked} of ${photos}` : "None yet"}</Glance>
          <Glance label="Time on the homes">{seconds > 0 ? duration(seconds) : "None yet"}</Glance>
        </dl>

        <nav aria-label="Parts of this page" className="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200">
          {TABS.map((t) => {
            const count = t.key === "homes" ? active.length : t.key === "people" ? people.length : null;
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                scroll={false}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold",
                  t.key === tab ? "border-stone-900 text-ink" : "border-transparent text-stone-600 hover:text-ink",
                )}
              >
                {t.label}
                {count !== null && count > 0 && (
                  <span className="rounded-full bg-stone-200 px-1.5 text-xs font-semibold text-stone-700">{count}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {tab === "homes" && (
          <section aria-labelledby="homes-title" className="mt-5">
            <h2 id="homes-title" className="sr-only">
              Homes you sent
            </h2>
            {active.length === 0 ? (
              <p className={cn(card, "p-6 text-center text-stone-700")}>
                No homes on this link right now. Send some, or restore one below.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {active.map((listing) => (
                  <HomePanel
                    key={listing.ListingKey}
                    shareId={share.id}
                    listing={listing}
                    thread={thread}
                    liked={liked}
                    view={viewOf(listing.ListingKey)}
                    profiles={profiles}
                    agentPhoto={agentPhoto}
                  />
                ))}
              </div>
            )}
            {removed.length > 0 && (
              <section aria-labelledby="removed-title" className="mt-10">
                <h2 id="removed-title" className="font-display text-2xl">
                  Removed from their link
                </h2>
                <p className="text-sm text-stone-700">
                  {share.client_name || "Your client"} can&apos;t see these anymore. What they said about them still counts.
                </p>
                <div className="mt-3 flex flex-col gap-4">
                  {removed.map((listing) => (
                    <HomePanel
                      key={listing.ListingKey}
                      shareId={share.id}
                      listing={listing}
                      thread={thread}
                      liked={liked}
                      profiles={profiles}
                      agentPhoto={agentPhoto}
                    />
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {tab === "want" && (
          <>
            <WhatTheyWant
              clientName={clientName}
              comparison={comparison}
              homeCount={listings.length}
              thread={thread}
              profiles={profiles}
            />
            <Suggestions
              shareId={share.id}
              suggestions={suggestions}
              together={together}
              people={comparison.likers.map((s) => s.person.name)}
              everyone={everyone}
              thread={thread}
            />
          </>
        )}

        {tab === "people" && (
          <>
            <section aria-labelledby="links-title" className="mt-5">
              <h2 id="links-title" className="font-display text-2xl">
                People on this link
              </h2>
              <p className="text-sm text-stone-700">
                Everyone gets their own link, so you can see what each person likes, and where they agree.
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {invitees.map((person) => (
                  <li key={person.id} className={cn(card, "p-4")}>
                    <PersonHeader
                      shareId={share.id}
                      person={person}
                      profile={profiles.get(person.id)}
                      photo={person.profile ? photoUrl(person.profile, person.photo_v) : null}
                      removable={people.length > 1}
                      editable={!person.bound}
                      status={
                        // Picked from Porchcard: theirs from the start, and told
                        // about it (never for a quick Send, which the agent sent).
                        person.bound && opens.every((o) => o.participantId !== person.id) ? (
                          share.quick || !person.found ? "On Porchcard" : "On Porchcard · we let them know"
                        ) : (
                          <OpenedBy
                            opens={opens.filter((o) => o.participantId === person.id)}
                            name={person.first_name}
                            photos={photos}
                          />
                        )
                      }
                    />
                    <SendLink
                      bare
                      url={`${appUrl()}/s/${person.token}`}
                      clientName={person.first_name}
                      count={active.length}
                      home={oneHome}
                      label={`${person.first_name}'s link`}
                      who={person.first_name}
                    />
                  </li>
                ))}
                {/* Joined through the link the agent sent before adding anyone. */}
                {joined.map((person) => (
                  <li key={person.id} className={cn(card, "p-4")}>
                    <PersonHeader
                      shareId={share.id}
                      person={person}
                      profile={profiles.get(person.id)}
                      photo={person.profile ? photoUrl(person.profile, person.photo_v) : null}
                      removable={people.length > 1}
                      editable={!person.bound}
                      status="Joined through the link you sent first"
                    />
                  </li>
                ))}
                {invitees.length === 0 && (
                  <li>
                    <SendLink
                      url={`${appUrl()}/s/${share.token}`}
                      clientName={share.client_name}
                      count={active.length}
                      home={oneHome}
                      status={<OpenedBy opens={opens} photos={photos} />}
                    />
                  </li>
                )}
                {/* The package's own link, sent before anyone was added, still
                    says who opened it. */}
                {invitees.length > 0 && packageOpens.length > 0 && (
                  <li className={cn(card, "p-4 text-sm")}>
                    <p className="font-semibold">The link you sent first</p>
                    <p className="mt-0.5 text-muted">
                      <OpenedBy opens={packageOpens} photos={photos} />
                    </p>
                  </li>
                )}
              </ul>
              <div className="mt-3">
                <AddPersonForm
                  shareId={share.id}
                  confidant={confidant?.first_name ?? null}
                  taken={people.filter((p) => !p.bound).map((p) => p.first_name.trim().toLowerCase())}
                />
              </div>
            </section>

            {active.length > 0 && (
              <section aria-labelledby="opens-on-title" className="mt-10">
                <h2 id="opens-on-title" className="font-display text-2xl">
                  What their link opens on
                </h2>
                <div className="mt-3">
                  <WelcomeEditor
                    shareId={share.id}
                    headline={share.headline}
                    note={share.note}
                    // As the first person on it sees it (each sees their own name).
                    standard={`${invitees[0]?.first_name || share.client_name ? `${invitees[0]?.first_name || share.client_name}, I` : "I"} picked ${
                      active.length === 1 ? "this home" : `these ${active.length} homes`
                    } for you`}
                  />
                  {/* (Asked for before it's sent; once it's been opened, only said if it's there.) */}
                  {(!lastOpen || take.notes + take.likes + take.dislikes > 0) && (
                    <YourTake
                      // Their link, as the first of them will see it.
                      href={`/s/${invitees[0]?.token ?? share.token}`}
                      who={invitees.length === 1 ? invitees[0].first_name : share.client_name || "your client"}
                      notes={take.notes}
                      likes={take.likes}
                      dislikes={take.dislikes}
                      homes={active.length}
                    />
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </HomeScorecards>
  );
}

// A person's name, to their profile once they've signed up.
function PersonName({ name, href, className }: { name: string; href?: string; className?: string }) {
  if (!href) return <span className={cn("font-semibold", className)}>{name}</span>;
  return (
    <Link href={href} className={cn("font-semibold underline decoration-stone-300 underline-offset-2 hover:decoration-ink", className)}>
      {name}
    </Link>
  );
}

// Who someone on the link is: their name, whether they've opened it, their
// profile once they've signed up, and taking them off it.
function PersonHeader({
  shareId,
  person,
  profile,
  photo,
  removable,
  editable,
  status,
}: {
  shareId: string;
  person: { id: string; first_name: string };
  profile?: string;
  photo?: string | null;
  removable: boolean;
  // Not signed up, so the agent can fix how their name is spelled.
  editable: boolean;
  status: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <Avatar name={person.first_name} photo={photo} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{person.first_name}</span>
          {profile ? (
            <Link href={profile} className="text-sm font-medium text-brand underline-offset-2 hover:underline">
              View profile<span className="sr-only"> of {person.first_name}</span>
            </Link>
          ) : (
            <span className="text-sm text-muted">Hasn&apos;t signed up yet</span>
          )}
        </p>
        <p className="text-sm text-muted">{status}</p>
      </div>
      {editable && <EditPersonName shareId={shareId} personId={person.id} name={person.first_name} />}
      {removable && <RemovePersonButton shareId={shareId} personId={person.id} name={person.first_name} />}
    </div>
  );
}

// One number (or word) at the top of a client's page, with what it is.
function Glance({ label, warn = false, children }: { label: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(card, "p-3")}>
      <dt className="text-sm text-stone-700">{label}</dt>
      <dd className={cn("mt-0.5 font-semibold leading-snug", warn && "text-amber-900")}>{children}</dd>
    </div>
  );
}

// How a home went with everyone on the link: liked if anyone liked it (or
// something in it), passed if it was only passed on, null before anyone said.
function homeVerdict(listingKey: string, thread: Thread): "like" | "pass" | null {
  const people = new Set(
    [...thread.reactions, ...thread.photoLikes, ...thread.photoDislikes]
      .filter((row) => row.listingKey === listingKey)
      .map((row) => row.participantId),
  );
  let verdict: "like" | "pass" | null = null;
  for (const person of people) {
    const theirs = <T extends { participantId: string; listingKey: string }>(rows: T[]) =>
      rows.some((row) => row.participantId === person && row.listingKey === listingKey);
    const reaction = thread.reactions.find((r) => r.participantId === person && r.listingKey === listingKey)?.state.reaction;
    const said =
      reaction === "like"
        ? "like"
        : reaction === "dislike"
          ? "pass"
          : theirs(thread.photoLikes)
            ? "like"
            : theirs(thread.photoDislikes)
              ? "pass"
              : null;
    if (said === "like") return "like";
    verdict ??= said;
  }
  return verdict;
}


// The agent's first pass, before the link goes out (or after): their notes,
// likes and dislikes on the price, a room, anything, which everyone on the link sees
// as theirs. Optional, so asked for, not required; once there, a line to add
// more. It opens the link as their client sees it, to tap things there.
function YourTake({
  href,
  who,
  notes,
  likes,
  dislikes,
  homes,
}: {
  href: string;
  who: string;
  notes: number;
  likes: number;
  dislikes: number;
  homes: number;
}) {
  if (notes + likes + dislikes > 0) {
    // "1 note", "2 notes and 1 like", "1 note, 2 likes and 1 dislike"
    const parts = [
      notes > 0 && `${notes} ${notes === 1 ? "note" : "notes"}`,
      likes > 0 && `${likes} ${likes === 1 ? "like" : "likes"}`,
      dislikes > 0 && `${dislikes} ${dislikes === 1 ? "dislike" : "dislikes"}`,
    ].filter((part): part is string => Boolean(part));
    const said = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    return (
      <div className={cn(card, "mb-3 flex items-center gap-3 p-3 pl-4")}>
        <Check aria-hidden size={18} className="shrink-0 text-emerald-700" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Your take is on it.</span>{" "}
          <span className="text-muted">
            {said}, for {who} to see.
          </span>
        </p>
        <Link href={href} className={cn(button({ kind: "secondary" }), "shrink-0")}>
          <PenLine aria-hidden size={16} /> Add more
        </Link>
      </div>
    );
  }
  return (
    <div data-your-take className={cn(card, "mb-3 p-4")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <PenLine size={18} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            Add your take before you send
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">Recommended</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Tap the price, a room, anything on {homes === 1 ? "the home" : `the ${homes} homes`}, and like it or leave a
            quick note. {who.charAt(0).toUpperCase() + who.slice(1)} sees them on the link, with your face on each.
          </p>
        </div>
      </div>
      <Link href={href} className={cn(button({ kind: "primary", block: true }), "mt-3")}>
        <PenLine aria-hidden size={16} /> Add your notes
      </Link>
    </div>
  );
}

// Who has opened a link, when they last did, and how much of it they looked
// at: "Owen opened it Tuesday, 2:14 pm · saw 3 of 4 photos". On someone's own
// link, it's them (`name`); on a package's link, whoever has said their name
// on it, then anyone who hasn't yet. `photos`: how many the link has.
function OpenedBy({ opens, name, photos }: { opens: ShareOpen[]; name?: string; photos: number }) {
  if (opens.length === 0) return <>{name ? `${name} hasn't opened it yet` : "Not opened yet"}</>;
  const lines = opens
    .filter((open) => open.participantId)
    .map((open) => ({ at: open.lastAt, name: name ?? open.name, seen: open.photosSeen }));
  const unnamed = opens.find((open) => !open.participantId);
  if (unnamed) {
    lines.push({ at: unnamed.lastAt, name: lines.length ? "Someone else" : (name ?? null), seen: unnamed.photosSeen });
  }
  return (
    <>
      {lines.map((line, i) => {
        const seen = photosSeenLine(line.seen, photos);
        return (
          <span key={i} className="block">
            <Opened at={line.at} name={line.name} />
            {seen && (
              <>
                {" · "}
                <span className="whitespace-nowrap">{seen}</span>
              </>
            )}
          </span>
        );
      })}
    </>
  );
}

// How one person came down on one home, in a few words.
type TakeOf = { reaction: ReactionState["reaction"]; likes: string[]; passes: string[] };

// "Gas range · Mature trees", breaking only between things, the dot kept with
// the thing before it.
const listed = (things: string[]) =>
  things.map((thing, i) => (
    <span key={thing}>
      <span className="whitespace-nowrap">
        {thing}
        {i < things.length - 1 && " ·"}
      </span>
      {i < things.length - 1 && " "}
    </span>
  ));

// Liked (the home, or anything in it) or passed (Not for me, or only things
// they didn't like), counted the way the dashboard counts a home's verdicts.
const verdictOf = ({ reaction, likes, passes }: TakeOf): "like" | "pass" | null =>
  reaction === "dislike" || (!reaction && likes.length === 0 && passes.length > 0)
    ? "pass"
    : reaction === "like" || likes.length > 0
      ? "like"
      : null;

// "♥ Kitchen · Marble counters", "👎 Price", "Not yet". Passing, or only not
// liking things, leads with the thumbs down.
function Take({ take }: { take: TakeOf }) {
  const { reaction, likes, passes } = take;
  const verdict = verdictOf(take);
  const passed = verdict === "pass";
  if (!verdict) return <span className="text-stone-500">Not yet</span>;
  const like = (passed ? likes.length > 0 : true) && (
    <span className="inline-flex items-start gap-1.5">
      <Heart aria-hidden size={14} className="mt-[3px] shrink-0 text-rose-600" />
      <span>
        {likes.length > 0 ? (
          <>
            <span className="sr-only">{passed ? "but liked " : "liked "}</span>
            {listed(likes)}
          </>
        ) : (
          "Liked"
        )}
      </span>
    </span>
  );
  const pass = (passed || passes.length > 0) && (
    <span className="inline-flex items-start gap-1.5">
      <ThumbsDown aria-hidden size={14} className="mt-[3px] shrink-0 text-amber-800" />
      <span>
        <span className="sr-only">{!passed ? "but not " : reaction === "dislike" && passes.length ? "passed on " : passes.length ? "didn't like " : ""}</span>
        {passes.length > 0 ? listed(passes) : "Passed"}
      </span>
    </span>
  );
  // The spaces keep the words apart when read aloud or copied.
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      {passed ? pass : like} {passed ? like : pass}
    </span>
  );
}

// What each person likes and passes on, across every home ever sent, including
// ones since removed; and with two or more people, where they agree and differ,
// home by home: a card per home on a phone, a table where there's room.
function WhatTheyWant({
  clientName,
  comparison,
  homeCount,
  thread,
  profiles,
}: {
  clientName: string;
  comparison: ReturnType<typeof comparePeople>;
  homeCount: number;
  thread: Thread;
  // Each person who has signed up, to their profile.
  profiles: Map<string, string>;
}) {
  const { summaries, homes, likers, both, only } = comparison;
  const several = summaries.length >= 2;
  // The table's cells, plus what each person didn't like in a home's photos
  // and facts, so a pass says why, and the spots they tapped that aren't on
  // anything named ("A spot in the kitchen", "2 spots outside").
  const takeOf = (home: (typeof homes)[number], personId: string): TakeOf => {
    const cell = home.cells[personId];
    const theirs = <T extends { participantId: string; listingKey: string }>(rows: T[]) =>
      rows.filter((r) => r.participantId === personId && r.listingKey === home.listing.ListingKey);
    const spots = (rows: { tag: string; mediaKey: string }[]) =>
      spotsWhere(home.listing, rows.filter((r) => r.tag.startsWith("@"))).map(
        (where) => where[0].toUpperCase() + where.slice(1),
      );
    const disliked = theirs(thread.photoDislikes);
    return {
      reaction: cell.reaction,
      likes: [...cell.likes, ...spots(theirs(thread.photoLikes))],
      passes: uniq([...cell.passes, ...disliked.filter((d) => !d.tag.startsWith("@")).map((d) => d.tag), ...spots(disliked)]),
    };
  };
  // Each person's take on each home, and how many they liked and passed on,
  // from the same takes, so the summary and the cards below always agree: a
  // spot liked in a photo counts as liking that home.
  const takes = Object.fromEntries(summaries.map((s) => [s.person.id, homes.map((home) => takeOf(home, s.person.id))]));
  const tally = Object.fromEntries(
    summaries.map((s) => {
      const verdicts = takes[s.person.id].map(verdictOf);
      return [s.person.id, { liked: verdicts.filter((v) => v === "like").length, passed: verdicts.filter((v) => v === "pass").length }];
    }),
  );
  const heard = summaries.filter((s) => tally[s.person.id].liked + tally[s.person.id].passed > 0);
  // Where they agree is worked out among those who've liked particular
  // things; when that isn't everyone, it says who.
  const names = likers.map((s) => s.person.name);
  const inCommon =
    likers.length === summaries.length
      ? likers.length === 2
        ? "Both like"
        : "Everyone likes"
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} ${likers.length === 2 ? "both" : "all"} like`;
  return (
    <section aria-labelledby="profile-title" className={cn(card, "@container mt-6 p-5")}>
      <h2 id="profile-title" className="font-display text-2xl">
        {several ? "What they each want" : `What ${summaries[0]?.person.name ?? clientName} wants`}
      </h2>
      {heard.length === 0 ? (
        <p className="mt-1 text-stone-700">
          Once they react, you&apos;ll see what {several ? "each person likes and passes on" : "they like and pass on"}{" "}
          here, across every home you send.
        </p>
      ) : (
        <>
          {likers.length >= 2 && (
            <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
              <p>
                <span className="font-semibold">{inCommon}:</span>{" "}
                {both.length > 0 ? both.join("\u00a0· ") : <span className="text-muted">nothing in common yet</span>}
              </p>
              {likers.map((s) =>
                only[s.person.id]?.length ? (
                  <p key={s.person.id}>
                    <span className="font-semibold">Only {s.person.name}:</span> {only[s.person.id].join("\u00a0· ")}
                  </p>
                ) : null,
              )}
            </div>
          )}
          <ul className="mt-4 flex flex-col gap-4">
            {summaries.map((s) => (
              <li key={s.person.id}>
                <p className="text-body">
                  <PersonName name={s.person.name} href={profiles.get(s.person.id)} />{" "}
                  {tally[s.person.id].liked + tally[s.person.id].passed === 0 ? (
                    <span className="text-muted">hasn&apos;t reacted yet</span>
                  ) : (
                    tallyLine(tally[s.person.id], homeCount)
                  )}
                </p>
                <Things label="Likes" tone="like" things={s.likes} />
                <Things label="Passes on" tone="pass" things={s.passes} />
                {/* Liked in one home, passed on in another: once, on its own. */}
                <Things label="Depends on the home" tone="mixed" things={s.mixed} />
              </li>
            ))}
          </ul>
          {several && (
            <>
              {/* Phones: a card per home, a line per person, nothing cut off.
                  Folded away to start with, since each home further down says
                  the same beside its comments. */}
              <details className="group mt-5 @md:hidden">
                <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2 font-semibold hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-stone-500 transition-transform group-open:rotate-90" />
                  Home by home{" "}
                  <span className="font-normal text-muted">
                    · {homes.length} {homes.length === 1 ? "home" : "homes"}
                  </span>
                </summary>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {homes.map((home, i) => (
                    <li key={home.listing.ListingKey} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                      <p className="flex items-center gap-2.5">
                        <HomeThumb src={home.listing.Media[0]?.MediaURL} sizes="40px" className="size-10" />
                        <span className="min-w-0 font-semibold leading-snug">{home.listing.UnparsedAddress}</span>
                      </p>
                      {/* Names take the room they need, up to a point, then wrap. */}
                      <ul className="mt-2 grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-sm">
                        {summaries.map((s) => (
                          <li key={s.person.id} className="col-span-2 grid grid-cols-subgrid">
                            <span data-person-name className="max-w-[7.5rem] break-words font-semibold">
                              {s.person.name}
                            </span>{" "}
                            <Take take={takes[s.person.id][i]} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
              {/* With room: the table, its homes column kept in view as it scrolls. */}
              <h3 className="mt-6 hidden font-semibold @md:block">Home by home</h3>
              <div className="mt-2 hidden overflow-x-auto @md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Each home, by person</caption>
                  <thead>
                    <tr className="border-b border-stone-200 text-muted">
                      <th scope="col" className="sticky left-0 z-10 bg-white py-2 pr-3 font-medium">
                        Home
                      </th>
                      {summaries.map((s) => (
                        <th key={s.person.id} scope="col" className="min-w-36 py-2 pr-3 font-medium">
                          {s.person.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {homes.map((home, i) => (
                      <tr key={home.listing.ListingKey} className="border-b border-stone-100 align-top">
                        <th scope="row" className="sticky left-0 z-10 w-36 bg-white py-2 pr-3 font-medium">
                          {home.listing.UnparsedAddress}
                        </th>
                        {summaries.map((s) => (
                          <td key={s.person.id} className="py-2 pr-3">
                            <Take take={takes[s.person.id][i]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

// How many of the homes someone liked and passed on, saying only what they
// did: "liked 2 of 3 homes · passed on 1", "liked all 3 homes", "liked both
// homes", "passed on 1 of 2 homes"; on a link with one home, "liked the home".
function tallyLine({ liked, passed }: { liked: number; passed: number }, homes: number) {
  if (homes === 1) return liked > 0 ? "liked the home" : "passed on the home";
  const of = (n: number) =>
    n < homes ? `${n} of ${homes} homes` : homes === 2 ? "both homes" : `all ${homes} homes`;
  return [liked > 0 && `liked ${of(liked)}`, passed > 0 && `passed on ${liked > 0 ? passed : of(passed)}`]
    .filter(Boolean)
    .join(" · ");
}

// Likes, Passes on, or (liked in one home, passed on in another) Depends on
// the home, each with its things.
function Things({ label, tone, things }: { label: string; tone: "like" | "pass" | "mixed"; things: string[] }) {
  if (things.length === 0) return null;
  const Icon = tone === "like" ? Heart : tone === "pass" ? ThumbsDown : null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
      <span
        className={cn(
          "flex items-center gap-1 font-semibold",
          tone === "like" ? "text-rose-800" : tone === "pass" ? "text-amber-900" : "text-stone-700",
        )}
      >
        {Icon && <Icon aria-hidden size={14} />}
        {label}
      </span>
      {things.map((thing) => (
        <span
          key={thing}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
            tone === "like"
              ? "bg-rose-50 text-rose-900 ring-rose-200"
              : tone === "pass"
                ? "bg-amber-50 text-amber-900 ring-amber-200"
                : "bg-stone-100 text-stone-800 ring-stone-200",
          )}
        >
          {thing}
        </span>
      ))}
    </div>
  );
}

const PRICE_RANGE = "their price range";

// Why a home might suit them: "Ben: mature trees · Nina: in Seattle", and the
// price once, for whoever it suits ("priced like homes they both liked",
// "priced like homes Ben and Nina liked").
function reasonsLine(reasons: Suggestion["reasons"]) {
  const people = Object.entries(reasons).filter(([, why]) => why.length > 0);
  if (people.length === 0) return "";
  const priced = people.filter(([, why]) => why.includes(PRICE_RANGE)).map(([name]) => name);
  const parts = people.flatMap(([name, why]) => {
    const own = why.filter((w) => w !== PRICE_RANGE);
    return own.length ? [`${name}: ${own.join(", ")}`] : [];
  });
  if (priced.length > 0) {
    const who =
      priced.length === people.length && people.length > 1
        ? people.length === 2
          ? "they both"
          : "they all"
        : priced.length === 1
          ? priced[0]
          : `${priced.slice(0, -1).join(", ")} and ${priced.at(-1)}`;
    parts.push(`priced like homes ${who} liked`);
  }
  // The dot stays with the reason before it when the line wraps. One capital,
  // at the start, as in a sentence.
  const line = parts.join("\u00a0· ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// The kinds of things in a home that someone liked in others ("layout,
// natural light"), for when nothing more particular is why it's suggested.
function aspectsIn(listing: Pick<Listing, "Media">, liked: Set<Aspect>) {
  const found = new Set<Aspect>();
  for (const photo of listing.Media) {
    for (const tag of photoTags(photo)) {
      const aspect = aspectOfTag(photo, tag);
      if (aspect && liked.has(aspect)) found.add(aspect);
    }
  }
  return [...found].slice(0, 2).map((aspect) => aspectLabel(aspect).toLowerCase());
}

// Homes not on the package yet that fit what they've liked so far.
function Suggestions({
  shareId,
  suggestions,
  together,
  people,
  everyone,
  thread,
}: {
  shareId: string;
  suggestions: Suggestion[];
  together: boolean;
  people: string[];
  everyone: { id: string; name: string }[];
  thread: Thread;
}) {
  if (suggestions.length === 0) return null;
  // The kinds of things each person has liked, in photos and in their verdicts.
  const likedAspects = (name: string) => {
    const ids = new Set(everyone.filter((p) => p.name === name).map((p) => p.id));
    return new Set<Aspect>([
      ...thread.photoLikes.filter((l) => ids.has(l.participantId)).flatMap((l) => (l.aspect ? [l.aspect] : [])),
      ...thread.reactions.filter((r) => ids.has(r.participantId)).flatMap((r) => r.state.liked),
    ]);
  };
  // Someone with no particular reason gets the kinds of things it shares with
  // what they liked, so every pick says why.
  const why = ({ listing, reasons }: Suggestion) =>
    reasonsLine(
      Object.fromEntries(
        Object.entries(reasons).map(([name, own]) => [name, own.length ? own : aspectsIn(listing, likedAspects(name))]),
      ),
    );
  return (
    <section aria-labelledby="suggest-title" className={cn(card, "mt-6 p-5")}>
      <h2 id="suggest-title" className="font-display text-2xl">
        {together ? `Homes ${people.length === 2 ? "they might both" : "they might all"} like` : `Homes ${people[0] ?? "they"} might like`}
      </h2>
      <p className="text-sm text-muted">From what they&apos;ve liked so far.</p>
      <ul className="mt-3 flex flex-col gap-4">
        {suggestions.map(({ listing, reasons }) => (
          // On a narrow phone, Add sits under the words rather than squeezing them.
          <li
            key={listing.ListingKey}
            className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
          >
            <HomeThumb src={listing.Media[0]?.MediaURL} sizes="64px" className="size-16 self-start sm:self-center" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{listing.UnparsedAddress}</p>
              <p className="text-stone-700">
                <span className="font-display text-base text-ink">{formatPrice(listing.ListPrice)}</span> ·{" "}
                {listing.City}
              </p>
              <p className="text-muted">{why({ listing, reasons })}</p>
            </div>
            <form action={addSuggestedHome.bind(null, shareId, listing.ListingKey)} className="col-start-2 sm:col-start-3">
              <button type="submit" className={button({ kind: "secondary" })}>
                <Plus aria-hidden size={16} /> Add
                <span className="sr-only"> {listing.UnparsedAddress}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The chip under a comment about a spot: the photo with a dot where the client
// tapped, or one of the facts ("Price").
function CommentSpot({ listing, spot }: { listing: Listing; spot: NonNullable<ThreadComment["spot"]> }) {
  if (spot.mediaKey === FACTS) {
    return (
      <span className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-meta font-semibold text-stone-700">
        <Tag aria-hidden size={13} />
        <span className="sr-only">About </span>
        {spot.tag}
      </span>
    );
  }
  const index = listing.Media.findIndex((m) => mediaKeyOf(m) === spot.mediaKey);
  const photo = listing.Media[index];
  if (!photo) return null;
  return (
    <SpotChip
      label={thingOf(photo, spot.tag) ?? `A spot in photo ${index + 1}`}
      photo={photo.MediaURL}
      at={tagPosition(photo, spot.tag)}
      photoNumber={index + 1}
      photoCount={listing.Media.length}
      description={photo.ShortDescription}
    />
  );
}

function HomePanel({
  shareId,
  listing,
  thread,
  liked,
  view,
  profiles,
  agentPhoto = null,
}: {
  shareId: string;
  listing: Listing;
  thread: Thread;
  // The agent's own photo, on their comments.
  agentPhoto?: string | null;
  // The comments the agent has hearted.
  liked: Set<string>;
  // Each person who has signed up, to their profile.
  profiles: Map<string, string>;
  // How long it was on their screen, and how many of its photos they looked at.
  view?: HomeView;
}) {
  const looked = view
    ? [view.seconds > 0 && `Spent ${duration(view.seconds)} on it`, photosSeenLine(view.photosSeen, listing.Media.length)]
        .filter(Boolean)
        .join(" · ")
    : "";
  // One line per person: their reaction plus what they liked, and didn't, in
  // the photos and the facts.
  const lines = new Map<string, { name: string; state: ReactionState; likes: TakeMark[]; dislikes: TakeMark[]; tags: string[] }>();
  const lineOf = (participantId: string, name: string) => {
    const line = lines.get(participantId) ?? { name, state: NO_REACTION, likes: [], dislikes: [], tags: [] };
    lines.set(participantId, line);
    return line;
  };
  for (const r of thread.reactions.filter((r) => r.listingKey === listing.ListingKey)) {
    lineOf(r.participantId, r.name).state = r.state;
  }
  for (const like of thread.photoLikes.filter((l) => l.listingKey === listing.ListingKey)) {
    const line = lineOf(like.participantId, like.name);
    line.likes.push({ mediaKey: like.mediaKey, tag: like.tag });
    line.tags.push(like.tag);
  }
  for (const dislike of thread.photoDislikes.filter((l) => l.listingKey === listing.ListingKey)) {
    lineOf(dislike.participantId, dislike.name).dislikes.push({ mediaKey: dislike.mediaKey, tag: dislike.tag });
  }
  const reactions = [...lines].map(([participantId, line]) => ({ participantId, ...line }));
  const comments = thread.comments.filter((c) => c.listingKey === listing.ListingKey);
  const isRemoved = Boolean(listing.removedAt);
  const reelHref = `/reel?from=share:${shareId}&home=${encodeURIComponent(listing.ListingKey)}`;
  return (
    <section
      id={`home-${listing.ListingKey}`}
      aria-label={listing.UnparsedAddress}
      className={cn(
        card,
        "@container scroll-mt-4 p-4 transition-[box-shadow] duration-1000 data-target:ring-2 data-target:ring-amber-300",
      )}
    >
      {/* Narrow (a phone, or a column beside the Porchcard), the buttons sit
          in a row of their own underneath, so the words keep the width: the
          address on one line, the price and city on the next. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 @md:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* The home, full screen, with everyone on the link's take on it, and
            the link's other homes either side (once it's off the link, it's
            in none). One link, so the keyboard meets it once, at the address. */}
        {isRemoved ? (
          <HomeThumb src={listing.Media[0]?.MediaURL} sizes="72px" className="size-16 opacity-60 grayscale @md:size-18" />
        ) : (
          <Link href={reelHref} tabIndex={-1} aria-hidden className="rounded-xl">
            <HomeThumb src={listing.Media[0]?.MediaURL} sizes="72px" className="size-16 @md:size-18" />
          </Link>
        )}
        <div className="min-w-0">
          {/* Focus lands here when the last comment on a removed home goes. */}
          <h3 tabIndex={-1} className="font-semibold leading-snug outline-none">
            {isRemoved ? (
              listing.UnparsedAddress
            ) : (
              <Link href={reelHref} className="underline-offset-2 hover:underline">
                {listing.UnparsedAddress}
              </Link>
            )}
          </h3>
          <p className="text-sm text-stone-700">
            <span className="font-display text-lg text-ink">{formatPrice(listing.ListPrice)}</span>{" "}
            <span className="whitespace-nowrap">· {listing.City}</span>
          </p>
          {looked && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-stone-700">
              <Clock aria-hidden size={14} className="mt-[3px] shrink-0 text-stone-500" />
              <span>{looked[0].toUpperCase() + looked.slice(1)}</span>
            </p>
          )}
        </div>
        {/* What everyone on the link thinks of it, then Remove. */}
        <div className="col-span-2 mt-3 flex flex-wrap items-center gap-1 @md:col-span-1 @md:-mr-1 @md:mt-0 @md:justify-self-end">
          <ScorecardButton listingKey={listing.ListingKey} address={listing.UnparsedAddress} />
          <RemoveHomeButton
            shareId={shareId}
            listingKey={listing.ListingKey}
            address={listing.UnparsedAddress}
            removed={isRemoved}
          />
        </div>
      </div>

      {reactions.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {reactions.map((r) => {
            const passed = r.state.reaction === "dislike" || (!r.state.reaction && !r.tags.length && r.dislikes.length > 0);
            const Icon = passed ? ThumbsDown : Heart;
            return (
              <li key={r.participantId} className="flex items-start gap-2">
                <Icon aria-hidden size={15} className={cn("mt-0.5 shrink-0", passed ? "text-amber-800" : "text-rose-600")} />
                <span>
                  <PersonName name={r.name} href={profiles.get(r.participantId)} />{" "}
                  {describeTake(listing, r.state, r.likes, r.dislikes)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No reactions yet.</p>
      )}

      {comments.length > 0 && (
        // (The Porchcard's "See all" brings the keyboard here.)
        <ul aria-label="Comments" tabIndex={-1} className="mt-4 flex scroll-mt-4 flex-col gap-4 border-t border-stone-100 pt-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              id={`comment-${comment.id}`}
              className="-mx-2 -my-1 flex scroll-mt-4 gap-3 rounded-xl px-2 py-1 transition-[background-color,box-shadow] duration-1000 data-target:bg-amber-50 data-target:ring-2 data-target:ring-amber-200"
            >
              <Avatar
                name={comment.name}
                tone={comment.isAgent ? "agent" : "person"}
                photo={comment.isAgent ? agentPhoto : undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 text-meta leading-snug text-muted">
                  <PersonName
                    name={comment.name}
                    href={comment.participantId ? profiles.get(comment.participantId) : undefined}
                    className="text-sm text-ink"
                  />
                  {comment.isAgent && (
                    <Badge tone="ink" small>
                      Agent
                    </Badge>
                  )}
                  <span>· {timeAgo(comment.createdAt)}</span>
                  {comment.replyTo && (
                    <span>
                      · replying to {comment.replyTo.name}
                      {comment.replyTo.likes && "'s likes"}
                    </span>
                  )}
                  {comment.sharedPublicly && (
                    <span className="inline-flex items-center gap-1">
                      · <Globe aria-hidden size={11} /> Shared publicly
                    </span>
                  )}
                </p>
                {comment.spot && <CommentSpot listing={listing} spot={comment.spot} />}
                <p className="mt-0.5 whitespace-pre-line break-words text-body leading-snug">{comment.body}</p>
                {/* A client's words on a home still on their link: they'd see the heart. */}
                {!comment.isAgent && !isRemoved && (
                  <CommentLike commentId={comment.id} name={comment.name} liked={liked.has(comment.id)} />
                )}
              </div>
              <CommentMenu commentId={comment.id} name={comment.name} />
            </li>
          ))}
        </ul>
      )}
      {!isRemoved && <ReplyForm shareId={shareId} listingKey={listing.ListingKey} />}
    </section>
  );
}
