import { ArrowLeft, ChevronRight, Globe, Heart, Plus, RotateCcw, Tag, ThumbsDown, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl, cn, formatPrice, timeAgo } from "@/lib/format";
import { aspectOfTag, FACTS, mediaKeyOf, photoTags, tagPosition, thingOf } from "@/lib/photos";
import { aspectLabel, NO_REACTION, type Aspect, type ReactionState } from "@/lib/reactions";
import { comparePeople, suggestHomes, type Suggestion } from "@/lib/compare";
import {
  clientActivity,
  describeTake,
  getShareListings,
  spotsWhere,
  getShareOpens,
  getThread,
  photosSeenLine,
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
  const oneHome = active.length === 1 ? { address: active[0].UnparsedAddress, price: active[0].ListPrice } : undefined;
  // Every photo on their link, for "saw 3 of 4 photos".
  const photos = active.reduce((sum, listing) => sum + listing.Media.length, 0);

  return (
    <div data-wide>
      <LiveRefresh />
      <MarkSeen shareId={share.id} latest={latest} />
      <ShowTarget />
      <Link href="/dashboard" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft aria-hidden size={16} /> All links
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
                      home={oneHome}
                      label={`${person.first_name}'s link`}
                      status={
                        <OpenedBy
                          opens={opens.filter((o) => o.participantId === person.id)}
                          name={person.first_name}
                          photos={photos}
                        />
                      }
                    />
                  ))}
                  {/* The package's own link, sent before anyone was added, still
                      says who opened it. */}
                  {packageOpens.length > 0 && (
                    <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
                      <p className="font-semibold">The link you sent first</p>
                      <p className="mt-0.5 text-stone-600">
                        <OpenedBy opens={packageOpens} photos={photos} />
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <SendLink
                  url={`${appUrl()}/s/${share.token}`}
                  clientName={share.client_name}
                  count={active.length}
                  home={oneHome}
                  status={<OpenedBy opens={opens} photos={photos} />}
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
            everyone={everyone}
            thread={thread}
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
}: {
  clientName: string;
  comparison: ReturnType<typeof comparePeople>;
  homeCount: number;
  thread: Thread;
}) {
  const { summaries, both, only, homes } = comparison;
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
  const likers = summaries.filter((s) => s.likes.length > 0);
  const names = likers.map((s) => s.person.name);
  const inCommon =
    likers.length === summaries.length
      ? likers.length === 2
        ? "Both like"
        : "Everyone likes"
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} ${likers.length === 2 ? "both" : "all"} like`;
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
          {likers.length >= 2 && (
            <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
              <p>
                <span className="font-semibold">{inCommon}:</span>{" "}
                {both.length > 0 ? both.join("\u00a0· ") : <span className="text-stone-600">nothing in common yet</span>}
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
                <p className="text-[15px]">
                  <span className="font-semibold">{s.person.name}</span>{" "}
                  {tally[s.person.id].liked + tally[s.person.id].passed === 0 ? (
                    <span className="text-stone-600">hasn&apos;t reacted yet</span>
                  ) : (
                    <>
                      liked <span className="tabular-nums">{tally[s.person.id].liked}</span> of{" "}
                      <span className="tabular-nums">{homeCount}</span> {homeCount === 1 ? "home" : "homes"} · passed{" "}
                      <span className="tabular-nums">{tally[s.person.id].passed}</span>
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
              {/* Phones: a card per home, a line per person, nothing cut off.
                  Folded away to start with, since each home further down says
                  the same beside its comments. */}
              <details className="group mt-5 @md:hidden">
                <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2 font-semibold hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-stone-500 transition-transform group-open:rotate-90" />
                  Home by home{" "}
                  <span className="font-normal text-stone-600">
                    · {homes.length} {homes.length === 1 ? "home" : "homes"}
                  </span>
                </summary>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {homes.map((home, i) => (
                    <li key={home.listing.ListingKey} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                      <p className="flex items-center gap-2.5">
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                          {home.listing.Media[0] && (
                            <Image src={home.listing.Media[0].MediaURL} alt="" fill sizes="40px" className="object-cover" />
                          )}
                        </span>
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
              <p className="text-stone-600">{why({ listing, reasons })}</p>
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
      description={photo.ShortDescription}
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
      {/* On a phone, Remove sits under the words so they keep the width: the
          address on one line, the price and city on the next. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div
          className={cn(
            "relative row-span-2 size-16 shrink-0 overflow-hidden rounded-xl bg-stone-200 sm:row-span-1 sm:size-18",
            isRemoved && "opacity-60 grayscale",
          )}
        >
          {listing.Media[0] && <Image src={listing.Media[0].MediaURL} alt="" fill sizes="72px" className="object-cover" />}
        </div>
        <div className="min-w-0">
          {/* Focus lands here when the last comment on a removed home goes. */}
          <h3 tabIndex={-1} className="font-semibold leading-snug outline-none">
            {listing.UnparsedAddress}
          </h3>
          <p className="text-sm text-stone-700">
            <span className="font-display text-lg text-ink">{formatPrice(listing.ListPrice)}</span>{" "}
            <span className="whitespace-nowrap">· {listing.City}</span>
          </p>
        </div>
        {/* C2: the Scorecard button goes here, before Remove. */}
        <form
          action={setHomeRemoved.bind(null, shareId, listing.ListingKey, !isRemoved)}
          className="-ml-3 justify-self-start sm:-mr-1 sm:ml-0"
        >
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
