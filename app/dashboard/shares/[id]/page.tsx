import { ArrowLeft, Globe, Heart, Plus, RotateCcw, Tag, ThumbsDown, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl, cn, formatPrice, timeAgo } from "@/lib/format";
import { FACTS, mediaKeyOf, tagPosition, thingOf } from "@/lib/photos";
import { NO_REACTION, type ReactionState } from "@/lib/reactions";
import { comparePeople, suggestHomes, type Suggestion } from "@/lib/compare";
import {
  clientActivity,
  describeTake,
  getShareListings,
  spotsWhere,
  getShareOpens,
  getThread,
  type Share,
  type ShareOpen,
  type TakeMark,
  type ThreadComment,
} from "@/lib/shares";
import { addSuggestedHome, setHomeRemoved } from "../../actions";
import { Opened } from "../../opened";
import {
  AddPersonForm,
  ClientNameEditor,
  CommentMenu,
  MarkSeen,
  ReplyForm,
  SendLink,
  ShowTarget,
  SpotChip,
} from "./client";

type Listings = Awaited<ReturnType<typeof getShareListings>>;
type Listing = Listings[number];
type Thread = Awaited<ReturnType<typeof getThread>>;

const key = (thing: string) => thing.toLowerCase();
const uniq = (things: string[]) => things.filter((thing, i) => things.findIndex((t) => key(t) === key(thing)) === i);

// Everything one client has told this agent, on one page. Wide screens get two
// columns: what they want on the left, the homes and what was said on the right.
export default async function ShareDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [share] = await sql<Share[]>`
    select id, token, agent_id, client_name, note from shares
    where id = ${id} and agent_id = ${agent.id}`;
  if (!share) notFound();

  const [listings, thread, people, opens, [{ latest }]] = await Promise.all([
    getShareListings(share.id, { includeRemoved: true }),
    getThread(share.id),
    // Everyone on the package: people the agent added, and anyone who joined
    // through the package's own link.
    sql<{ id: string; first_name: string; token: string | null }[]>`
      select id, first_name, token from participants
      where share_id = ${id}
      order by invited_at nulls last, created_at, first_name`,
    getShareOpens(share.id),
    // The newest thing a client did here, to the microsecond, so seeing this
    // page clears exactly that much from the dashboard's "new".
    sql<{ latest: string | null }[]>`
      select to_char(max(a.at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as latest
      from (${clientActivity()}) a where a.share_id = ${id}`,
  ]);
  const active = listings.filter((l) => !l.removedAt);
  const removed = listings.filter((l) => l.removedAt);
  const clientName = share.client_name || "Unnamed client";
  const invitees = people.filter((p) => p.token);
  const packageOpens = opens.filter((open) => !invitees.some((person) => person.id === open.participantId));
  const everyone = people.map((p) => ({ id: p.id, name: p.first_name }));
  const comparison = comparePeople(everyone, thread, listings);
  const { suggestions, together } = await suggestHomes(everyone, thread, listings);
  const oneHome = active.length === 1 ? active[0].UnparsedAddress : undefined;

  return (
    <div data-wide>
      <LiveRefresh />
      <MarkSeen shareId={share.id} latest={latest} />
      <ShowTarget />
      <Link href="/dashboard" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft aria-hidden size={16} /> All shares
      </Link>
      <ClientNameEditor shareId={share.id} name={share.client_name} />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        <div>
          <section aria-labelledby="links-title" className="mt-4">
            <h2 id="links-title" className="sr-only">
              Their links
            </h2>
            <div className="flex flex-col gap-3">
              {invitees.length > 0 ? (
                <>
                  {invitees.map((person) => (
                    <SendLink
                      key={person.id}
                      url={`${appUrl()}/s/${person.token}`}
                      clientName={person.first_name}
                      count={active.length}
                      address={oneHome}
                      label={`${person.first_name}'s link`}
                      status={<OpenedBy opens={opens.filter((o) => o.participantId === person.id)} name={person.first_name} />}
                    />
                  ))}
                  {/* The package's own link, sent before anyone was added, still
                      says who opened it. */}
                  {packageOpens.length > 0 && (
                    <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
                      <p className="font-semibold">The link you sent first</p>
                      <p className="mt-0.5 text-stone-600">
                        <OpenedBy opens={packageOpens} />
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <SendLink
                  url={`${appUrl()}/s/${share.token}`}
                  clientName={share.client_name}
                  count={active.length}
                  address={oneHome}
                  status={<OpenedBy opens={opens} />}
                />
              )}
            </div>
            <p className="mt-3 text-sm text-stone-600">
              Everyone gets their own link, so you can see what each person likes, and where they agree.
            </p>
            <div className="mt-2">
              <AddPersonForm shareId={share.id} />
            </div>
          </section>

          <WhatTheyWant clientName={clientName} comparison={comparison} homeCount={listings.length} thread={thread} />
          <Suggestions
            shareId={share.id}
            suggestions={suggestions}
            together={together}
            people={comparison.summaries.filter((s) => s.likes.length > 0).map((s) => s.person.name)}
          />
        </div>

        <div>
          <div className="mt-8 flex items-center justify-between gap-3 lg:mt-4">
            <h2 id="homes-title" className="font-display text-2xl">
              On their link
            </h2>
            <Link
              href={`/dashboard/new?share=${share.id}`}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold hover:bg-stone-50"
            >
              <Plus aria-hidden size={16} /> Add homes
            </Link>
          </div>
          {active.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-white p-6 text-center text-stone-700 ring-1 ring-stone-200">
              No homes on this link right now. Add some, or restore one below.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-5">
              {active.map((listing) => (
                <HomePanel key={listing.ListingKey} shareId={share.id} listing={listing} thread={thread} />
              ))}
            </div>
          )}

          {removed.length > 0 && (
            <section aria-labelledby="removed-title" className="mt-10">
              <h2 id="removed-title" className="font-display text-2xl">
                Removed from their link
              </h2>
              <p className="text-sm text-stone-700">
                {clientName} can&apos;t see these anymore. What they said about them still counts.
              </p>
              <div className="mt-3 flex flex-col gap-5">
                {removed.map((listing) => (
                  <HomePanel key={listing.ListingKey} shareId={share.id} listing={listing} thread={thread} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// Who has opened a link, and when they last did: "Owen opened it Tuesday,
// 2:14 pm". On someone's own link, it's them (`name`); on a package's link,
// whoever has said their name on it, then anyone who hasn't yet.
function OpenedBy({ opens, name }: { opens: ShareOpen[]; name?: string }) {
  if (opens.length === 0) return <>{name ? `${name} hasn't opened it yet` : "Not opened yet"}</>;
  const lines = opens.filter((open) => open.participantId).map((open) => ({ at: open.lastAt, name: name ?? open.name }));
  const unnamed = opens.find((open) => !open.participantId);
  if (unnamed) lines.push({ at: unnamed.lastAt, name: lines.length ? "Someone else" : name ?? null });
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="block">
          <Opened at={line.at} name={line.name} />
        </span>
      ))}
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

// "♥ Kitchen · Marble counters", "👎 Price", "Not yet". Passing, or only not
// liking things, leads with the thumbs down, as the dashboard's verdicts count it.
function Take({ take }: { take: TakeOf }) {
  const { reaction, likes, passes } = take;
  const passed = reaction === "dislike" || (!reaction && likes.length === 0 && passes.length > 0);
  const liked = !passed && (reaction === "like" || likes.length > 0);
  if (!passed && !liked) return <span className="text-stone-500">Not yet</span>;
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
}: {
  clientName: string;
  comparison: ReturnType<typeof comparePeople>;
  homeCount: number;
  thread: Thread;
}) {
  const { summaries, both, only, homes } = comparison;
  const heard = summaries.filter((s) => s.liked + s.passed + s.likes.length > 0);
  const several = summaries.length >= 2;
  // The table's cells, plus what each person didn't like in a home's photos
  // and facts, so a pass says why, and the spots they tapped that aren't on
  // anything named ("A spot in photo 2").
  const takeOf = (home: (typeof homes)[number], personId: string): TakeOf => {
    const cell = home.cells[personId];
    const theirs = <T extends { participantId: string; listingKey: string }>(rows: T[]) =>
      rows.filter((r) => r.participantId === personId && r.listingKey === home.listing.ListingKey);
    const spots = (rows: { tag: string; mediaKey: string }[]) => {
      const where = spotsWhere(home.listing, rows.filter((r) => r.tag.startsWith("@")));
      return where ? [where[0].toUpperCase() + where.slice(1)] : [];
    };
    const disliked = theirs(thread.photoDislikes);
    return {
      reaction: cell.reaction,
      likes: [...cell.likes, ...spots(theirs(thread.photoLikes))],
      passes: uniq([...cell.passes, ...disliked.filter((d) => !d.tag.startsWith("@")).map((d) => d.tag), ...spots(disliked)]),
    };
  };
  return (
    <section aria-labelledby="profile-title" className="@container mt-6 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 id="profile-title" className="font-display text-2xl">
        {several ? "What they each want" : `What ${summaries[0]?.person.name ?? clientName} wants`}
      </h2>
      {heard.length === 0 ? (
        <p className="mt-1 text-stone-700">
          Once they react, you&apos;ll see what {several ? "each person likes" : "they like"} and passes on here,
          across every home you send.
        </p>
      ) : (
        <>
          {heard.length >= 2 && (
            <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
              <p>
                <span className="font-semibold">{heard.length === 2 ? "Both like" : "Everyone likes"}:</span>{" "}
                {both.length > 0 ? both.join("\u00a0· ") : <span className="text-stone-600">nothing in common yet</span>}
              </p>
              {heard.map((s) =>
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
                <p className="text-[15px]">
                  <span className="font-semibold">{s.person.name}</span>{" "}
                  {s.liked + s.passed + s.likes.length === 0 ? (
                    <span className="text-stone-600">hasn&apos;t reacted yet</span>
                  ) : (
                    <>
                      liked <span className="tabular-nums">{s.liked}</span> of{" "}
                      <span className="tabular-nums">{homeCount}</span> {homeCount === 1 ? "home" : "homes"} · passed{" "}
                      <span className="tabular-nums">{s.passed}</span>
                    </>
                  )}
                </p>
                <Things label="Likes" tone="like" things={s.likes} />
                <Things label="Passes on" tone="pass" things={s.passes} />
              </li>
            ))}
          </ul>
          {several && (
            <>
              <h3 className="mt-6 font-semibold">Home by home</h3>
              {/* Phones: a card per home, a line per person, nothing cut off. */}
              <ul className="mt-2 flex flex-col gap-2.5 @md:hidden">
                {homes.map((home) => (
                  <li key={home.listing.ListingKey} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                    <p className="flex items-center gap-2.5">
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                        {home.listing.Media[0] && (
                          <Image src={home.listing.Media[0].MediaURL} alt="" fill sizes="40px" className="object-cover" />
                        )}
                      </span>
                      <span className="min-w-0 font-semibold leading-snug">{home.listing.UnparsedAddress}</span>
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                      {summaries.map((s) => (
                        <li key={s.person.id} className="flex gap-2">
                          <span className="w-16 shrink-0 truncate font-semibold">{s.person.name}</span>{" "}
                          <Take take={takeOf(home, s.person.id)} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {/* With room: the table, its homes column kept in view as it scrolls. */}
              <div className="mt-2 hidden overflow-x-auto @md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Each home, by person</caption>
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-600">
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
                    {homes.map((home) => (
                      <tr key={home.listing.ListingKey} className="border-b border-stone-100 align-top">
                        <th scope="row" className="sticky left-0 z-10 w-36 bg-white py-2 pr-3 font-medium">
                          {home.listing.UnparsedAddress}
                        </th>
                        {summaries.map((s) => (
                          <td key={s.person.id} className="py-2 pr-3">
                            <Take take={takeOf(home, s.person.id)} />
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

function Things({ label, tone, things }: { label: string; tone: "like" | "pass"; things: string[] }) {
  if (things.length === 0) return null;
  const Icon = tone === "like" ? Heart : ThumbsDown;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
      <span className={cn("flex items-center gap-1 font-semibold", tone === "like" ? "text-rose-800" : "text-amber-900")}>
        <Icon aria-hidden size={14} />
        {label}
      </span>
      {things.map((thing) => (
        <span
          key={thing}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
            tone === "like" ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200",
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
// price once for everyone it suits ("Priced like homes they both liked").
function reasonsLine(reasons: Suggestion["reasons"]) {
  const people = Object.entries(reasons).filter(([, why]) => why.length > 0);
  const priced = people.filter(([, why]) => why.includes(PRICE_RANGE));
  const all = priced.length > 0 && priced.length === people.length;
  const parts = people.flatMap(([name, why]) => {
    const own = why.filter((w) => w !== PRICE_RANGE);
    // Only some of them: the price goes with their own reasons.
    if (!all && why.includes(PRICE_RANGE)) own.push("priced like homes they liked");
    return own.length ? [`${name}: ${own.join(", ")}`] : [];
  });
  if (all) {
    const who = people.length === 1 ? people[0][0] : people.length === 2 ? "they both" : "they all";
    parts.push(`Priced like homes ${who} liked`);
  }
  // The dot stays with the reason before it when the line wraps.
  return parts.join("\u00a0· ");
}

// Homes not on the package yet that fit what they've liked so far.
function Suggestions({
  shareId,
  suggestions,
  together,
  people,
}: {
  shareId: string;
  suggestions: Suggestion[];
  together: boolean;
  people: string[];
}) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="suggest-title" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 id="suggest-title" className="font-display text-2xl">
        {together ? `Homes ${people.length === 2 ? "they might both" : "they might all"} like` : `Homes ${people[0] ?? "they"} might like`}
      </h2>
      <p className="text-sm text-stone-600">From what they&apos;ve liked so far.</p>
      <ul className="mt-3 flex flex-col gap-4">
        {suggestions.map(({ listing, reasons }) => (
          // On a narrow phone, Add sits under the words rather than squeezing them.
          <li
            key={listing.ListingKey}
            className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
          >
            <span className="relative size-16 shrink-0 self-start overflow-hidden rounded-xl bg-stone-200 sm:self-center">
              {listing.Media[0] && (
                <Image src={listing.Media[0].MediaURL} alt="" fill sizes="64px" className="object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{listing.UnparsedAddress}</p>
              <p className="text-stone-700">
                <span className="font-display text-base text-ink">{formatPrice(listing.ListPrice)}</span> ·{" "}
                {listing.City}
              </p>
              <p className="text-stone-600">{reasonsLine(reasons)}</p>
            </div>
            <form action={addSuggestedHome.bind(null, shareId, listing.ListingKey)} className="col-start-2 sm:col-start-3">
              <button
                type="submit"
                className="flex min-h-11 items-center gap-1.5 rounded-full border border-stone-300 px-4 text-sm font-semibold hover:bg-stone-50"
              >
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
      <span className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-[13px] font-semibold text-stone-700">
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
    />
  );
}

function HomePanel({ shareId, listing, thread }: { shareId: string; listing: Listing; thread: Thread }) {
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
  return (
    <section
      id={`home-${listing.ListingKey}`}
      aria-label={listing.UnparsedAddress}
      className="scroll-mt-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 transition-[box-shadow] duration-1000 data-target:ring-2 data-target:ring-amber-300"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "relative size-18 shrink-0 overflow-hidden rounded-xl bg-stone-200",
            isRemoved && "opacity-60 grayscale",
          )}
        >
          {listing.Media[0] && <Image src={listing.Media[0].MediaURL} alt="" fill sizes="72px" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{listing.UnparsedAddress}</h3>
          <p className="text-sm text-stone-700">
            <span className="font-display text-lg text-ink">{formatPrice(listing.ListPrice)}</span> · {listing.City}
          </p>
        </div>
        {/* C2: the Scorecard button goes here, before Remove. */}
        <form action={setHomeRemoved.bind(null, shareId, listing.ListingKey, !isRemoved)} className="-mr-1 shrink-0">
          <button
            type="submit"
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            {isRemoved ? <RotateCcw aria-hidden size={15} /> : <X aria-hidden size={15} />}
            {isRemoved ? "Restore" : "Remove"}
            <span className="sr-only"> {listing.UnparsedAddress}</span>
          </button>
        </form>
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
                  <span className="font-semibold">{r.name}</span> {describeTake(listing, r.state, r.likes, r.dislikes)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-600">No reactions yet.</p>
      )}

      {comments.length > 0 && (
        <ul aria-label="Comments" className="mt-4 flex flex-col gap-4 border-t border-stone-100 pt-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              id={`comment-${comment.id}`}
              className="-mx-2 -my-1 flex scroll-mt-4 gap-3 rounded-xl px-2 py-1 transition-[background-color,box-shadow] duration-1000 data-target:bg-amber-50 data-target:ring-2 data-target:ring-amber-200"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                  comment.isAgent ? "bg-ink" : "bg-brand",
                )}
              >
                {comment.name[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-snug text-stone-600">
                  <span className="text-sm font-semibold text-ink">{comment.name}</span>
                  {comment.isAgent && (
                    <span className="rounded-full bg-ink px-2 py-px text-[10px] font-bold uppercase tracking-wide text-white">
                      Agent
                    </span>
                  )}
                  <span>· {timeAgo(comment.createdAt)}</span>
                  {comment.sharedPublicly && (
                    <span className="inline-flex items-center gap-1">
                      · <Globe aria-hidden size={11} /> Shared publicly
                    </span>
                  )}
                </p>
                {comment.spot && <CommentSpot listing={listing} spot={comment.spot} />}
                <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug">{comment.body}</p>
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
