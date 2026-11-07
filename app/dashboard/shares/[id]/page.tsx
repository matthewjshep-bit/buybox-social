import { ArrowLeft, Globe, Heart, Plus, RotateCcw, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl, cn, formatPrice, timeAgo } from "@/lib/format";
import { describeReaction, NO_REACTION, type ReactionState } from "@/lib/reactions";
import { comparePeople, suggestHomes, type Suggestion } from "@/lib/compare";
import { clientActivity, getShareListings, getShareOpens, getThread, type Share, type ShareOpen } from "@/lib/shares";
import { addSuggestedHome, removeComment, setHomeRemoved } from "../../actions";
import { Opened } from "../../opened";
import { AddPersonForm, ClientNameEditor, MarkSeen, ReplyForm, SendLink, ShowTarget } from "./client";

type Listings = Awaited<ReturnType<typeof getShareListings>>;
type Thread = Awaited<ReturnType<typeof getThread>>;

// Everything one client has told this agent, on one page.
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

  return (
    <>
      <LiveRefresh />
      <MarkSeen shareId={share.id} latest={latest} />
      <ShowTarget />
      <Link href="/dashboard" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft aria-hidden size={16} /> All shares
      </Link>
      <ClientNameEditor shareId={share.id} name={share.client_name} />

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

      <WhatTheyWant clientName={clientName} comparison={comparison} homeCount={listings.length} />
      <Suggestions
        shareId={share.id}
        suggestions={suggestions}
        together={together}
        people={comparison.summaries.filter((s) => s.likes.length > 0).map((s) => s.person.name)}
      />

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl">On their link</h2>
        <Link
          href={`/dashboard/new?share=${share.id}`}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold"
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
            {clientName} can&apos;t see these anymore. What they said about them still counts above.
          </p>
          <div className="mt-3 flex flex-col gap-5">
            {removed.map((listing) => (
              <HomePanel key={listing.ListingKey} shareId={share.id} listing={listing} thread={thread} />
            ))}
          </div>
        </section>
      )}
    </>
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

// What each person likes and passes on, across every home ever sent, including
// ones since removed; and with two or more people, where they agree and differ.
function WhatTheyWant({
  clientName,
  comparison,
  homeCount,
}: {
  clientName: string;
  comparison: ReturnType<typeof comparePeople>;
  homeCount: number;
}) {
  const { summaries, both, only, homes } = comparison;
  const heard = summaries.filter((s) => s.liked + s.passed + s.likes.length > 0);
  const several = summaries.length >= 2;
  return (
    <section aria-labelledby="profile-title" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
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
                {both.length > 0 ? both.join(" · ") : <span className="text-stone-600">nothing in common yet</span>}
              </p>
              {heard.map((s) =>
                only[s.person.id]?.length ? (
                  <p key={s.person.id}>
                    <span className="font-semibold">Only {s.person.name}:</span> {only[s.person.id].join(" · ")}
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
          {several && heard.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">Each home, by person</caption>
                <thead>
                  <tr className="border-b border-stone-200 text-stone-600">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Home
                    </th>
                    {summaries.map((s) => (
                      <th key={s.person.id} scope="col" className="py-2 pr-3 font-medium">
                        {s.person.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {homes.map((home) => (
                    <tr key={home.listing.ListingKey} className="border-b border-stone-100 align-top">
                      <th scope="row" className="py-2 pr-3 font-medium">
                        {home.listing.UnparsedAddress}
                      </th>
                      {summaries.map((s) => {
                        const cell = home.cells[s.person.id];
                        const Icon = cell.reaction === "dislike" ? ThumbsDown : cell.reaction === "like" ? ThumbsUp : Heart;
                        const said = cell.reaction || cell.likes.length > 0;
                        return (
                          <td key={s.person.id} className="py-2 pr-3">
                            {said ? (
                              <span className="flex items-start gap-1.5">
                                <Icon
                                  aria-hidden
                                  size={14}
                                  className={cn(
                                    "mt-0.5 shrink-0",
                                    cell.reaction === "dislike"
                                      ? "text-amber-800"
                                      : cell.reaction === "like"
                                        ? "text-emerald-700"
                                        : "text-rose-600",
                                  )}
                                />
                                <span>
                                  {cell.reaction === "dislike" ? "Passed" : cell.reaction === "like" ? "Liked" : "Liked"}
                                  {cell.reaction === "dislike" && cell.passes.length > 0
                                    ? `: ${cell.passes.join(", ").toLowerCase()}`
                                    : cell.likes.length > 0
                                      ? `: ${cell.likes.join(", ").toLowerCase()}`
                                      : ""}
                                </span>
                              </span>
                            ) : (
                              <span className="text-stone-500">Not yet</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
      <ul className="mt-3 flex flex-col gap-3">
        {suggestions.map(({ listing, reasons }) => (
          <li key={listing.ListingKey} className="flex items-center gap-3">
            <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-stone-200">
              {listing.Media[0] && (
                <Image src={listing.Media[0].MediaURL} alt="" fill sizes="64px" className="object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{listing.UnparsedAddress}</p>
              <p className="text-stone-700">
                {formatPrice(listing.ListPrice)} · {listing.City}
              </p>
              <p className="text-stone-600">
                {Object.entries(reasons)
                  .filter(([, why]) => why.length > 0)
                  .map(([name, why]) => `${name}: ${why.join(", ")}`)
                  .join(" · ")}
              </p>
            </div>
            <form action={addSuggestedHome.bind(null, shareId, listing.ListingKey)}>
              <button
                type="submit"
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-300 px-3 text-sm font-semibold hover:bg-stone-50"
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

function HomePanel({
  shareId,
  listing,
  thread,
}: {
  shareId: string;
  listing: Listings[number];
  thread: Thread;
}) {
  // One line per person: their reaction plus what they liked, and didn't, in
  // the photos and the facts.
  const lines = new Map<string, { name: string; state: ReactionState; tags: string[]; notTags: string[] }>();
  const lineOf = (participantId: string, name: string) => {
    const line = lines.get(participantId) ?? { name, state: NO_REACTION, tags: [], notTags: [] };
    lines.set(participantId, line);
    return line;
  };
  for (const r of thread.reactions.filter((r) => r.listingKey === listing.ListingKey)) {
    lineOf(r.participantId, r.name).state = r.state;
  }
  for (const like of thread.photoLikes.filter((l) => l.listingKey === listing.ListingKey)) {
    lineOf(like.participantId, like.name).tags.push(like.tag);
  }
  for (const dislike of thread.photoDislikes.filter((l) => l.listingKey === listing.ListingKey)) {
    lineOf(dislike.participantId, dislike.name).notTags.push(dislike.tag);
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
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "relative size-16 shrink-0 overflow-hidden rounded-xl bg-stone-200",
            isRemoved && "opacity-60 grayscale",
          )}
        >
          <Image src={listing.Media[0]?.MediaURL} alt="" fill sizes="64px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{listing.UnparsedAddress}</h3>
          <p className="text-sm text-stone-700">
            {formatPrice(listing.ListPrice)} · {listing.City}
          </p>
        </div>
        <form action={setHomeRemoved.bind(null, shareId, listing.ListingKey, !isRemoved)}>
          <button
            type="submit"
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
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
            const passed = r.state.reaction === "dislike" || (!r.state.reaction && !r.tags.length && r.notTags.length > 0);
            const Icon = passed ? ThumbsDown : r.state.reaction ? ThumbsUp : Heart;
            return (
              <li key={r.participantId} className="flex items-start gap-2">
                <Icon
                  aria-hidden
                  size={15}
                  className={cn(
                    "mt-0.5 shrink-0",
                    passed ? "text-amber-800" : r.state.reaction ? "text-emerald-700" : "text-rose-600",
                  )}
                />
                <span>
                  <span className="font-semibold">{r.name}</span> {describeReaction(r.state, r.tags, r.notTags)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-600">No reactions yet.</p>
      )}

      {comments.length > 0 && (
        <ul aria-label="Comments" className="mt-4 flex flex-col gap-3">
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
                <p className="break-words text-[15px] leading-snug">
                  <span className="font-semibold">{comment.name}</span>
                  {comment.isAgent && (
                    <span className="ml-1.5 rounded bg-ink px-1.5 py-px align-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
                      Agent
                    </span>
                  )}{" "}
                  <span className="whitespace-pre-line">{comment.body}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-stone-600">
                  <span>{timeAgo(comment.createdAt)}</span>
                  {comment.sharedPublicly && (
                    <span className="inline-flex items-center gap-1">
                      <Globe aria-hidden size={11} /> Shared publicly
                    </span>
                  )}
                </p>
              </div>
              <form action={removeComment.bind(null, comment.id)}>
                <button
                  type="submit"
                  aria-label={`Remove comment from ${comment.name}`}
                  className="-mt-1.5 flex size-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {!isRemoved && <ReplyForm shareId={shareId} listingKey={listing.ListingKey} />}
    </section>
  );
}
