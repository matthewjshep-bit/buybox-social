import { DoorOpen, Eye, Heart, MessageCircle, Plus, Send, Sparkles, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar, Badge, EmptyState, HomeThumb } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { CLIENT_FILTERS, getClients, type AgentClient, type ClientFilterKey } from "@/lib/clients";
import { cn, timeAgo } from "@/lib/format";
import { duration, photosSeenLine } from "@/lib/shares";
import { button, card } from "@/lib/ui";
import { Opened } from "../opened";

// The agent's dashboard is their clients: who they've sent homes to, what each
// of them was sent, whether they've opened it, what they liked and passed on,
// and the last thing they did, with a request to see a home first of all. One
// card per client, newest news first; the counts at the top are also the way
// to see just some of them.

type Home = AgentClient["homes"][number];

// How many homes a card shows before "+3".
const THUMBS = 6;

// What each count says when it has nobody in it.
const NOBODY: Record<ClientFilterKey, string> = {
  all: "No clients yet.",
  new: "Nothing new since you last looked.",
  asks: "Nobody is waiting on a showing.",
  unopened: "Everyone has opened what you sent.",
  liked: "No one has liked a home yet.",
  commented: "No one has said anything yet.",
};

// "5h ago", "just now", "Nov 3".
const ago = (date: Date) => {
  const text = timeAgo(date.toISOString());
  return /^\d+[mhd]$/.test(text) ? `${text} ago` : text;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // (An agent with no name yet was sent to add it: see layout.tsx.)
  const agent = await requireAgent();
  const { show } = await searchParams;
  const clients = await getClients(agent.id);
  const filter = CLIENT_FILTERS.find((f) => f.key === show) ?? CLIENT_FILTERS[0];
  const shown = clients.filter(filter.test);

  return (
    <>
      <LiveRefresh />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="font-display text-3xl">Your clients</h1>
        <Link href="/dashboard/new" className={cn(button({ kind: "primary", size: "lg" }), "shrink-0 whitespace-nowrap")}>
          <Plus aria-hidden size={18} /> Send homes
        </Link>
      </div>

      {clients.length === 0 ? (
        <EmptyState icon={Send} title="Send your first home" className="mt-6">
          Pick up to three homes, add a note, and text the link to your client. You&apos;ll see here when they open it
          and what they like.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Show clients" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CLIENT_FILTERS.map((f) => {
              const here = f === filter;
              const count = clients.filter(f.test).length;
              return (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/dashboard" : `/dashboard?show=${f.key}`}
                  aria-current={here ? "page" : undefined}
                  className={cn(
                    card,
                    "flex flex-col gap-0.5 p-3 transition-shadow hover:ring-stone-400",
                    here && "ring-2 ring-stone-900 hover:ring-stone-900",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-display text-3xl leading-none">
                    {count}
                    <FilterMark kind={f.key} count={count} />
                  </span>
                  <span className="text-sm text-stone-700">{f.label}</span>
                </Link>
              );
            })}
          </nav>

          <section aria-label="Clients" className="mt-5">
            {shown.length === 0 ? (
              <p className={cn(card, "p-6 text-center text-stone-700")}>
                {NOBODY[filter.key]}{" "}
                <Link href="/dashboard" className="font-medium text-brand underline-offset-2 hover:underline">
                  See all clients
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {shown.map((client) => (
                  <li key={client.key}>
                    <ClientCard client={client} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

// A touch of what each count is about, in the colours used for it everywhere.
function FilterMark({ kind, count }: { kind: ClientFilterKey; count: number }) {
  if (count === 0) return null;
  if (kind === "new") return <span aria-hidden className="size-2.5 rounded-full bg-brand" />;
  if (kind === "asks") return <DoorOpen aria-hidden size={18} className="text-amber-700" />;
  if (kind === "unopened") return <span aria-hidden className="size-2.5 rounded-full bg-amber-500" />;
  if (kind === "liked") return <Heart aria-hidden size={18} className="fill-rose-600 text-rose-600" />;
  if (kind === "commented") return <MessageCircle aria-hidden size={18} className="text-stone-600" />;
  return null;
}

// The people a client is: their own photo, or two of them, one over the other.
function Faces({ client }: { client: AgentClient }) {
  const [first, second] = client.people;
  if (!first) return <Avatar name={null} tone="anonymous" size={10} />;
  if (!second) return <Avatar name={first.name} photo={first.photo} size={10} />;
  return (
    <span aria-hidden className="relative size-10 shrink-0">
      <Avatar name={first.name} photo={first.photo} size={8} className="absolute left-0 top-0" />
      <Avatar name={second.name} photo={second.photo} size={8} className="absolute bottom-[-2px] right-[-2px] ring-2 ring-white" />
    </span>
  );
}

// The last thing they did, as one sentence: "Owen commented: “Love the
// porch.” · 1204 Quillan St SE · 5m ago", or, for an ask, "Jenny asked to see
// 1204 Quillan St SE · 5h ago".
const latestText = (latest: NonNullable<AgentClient["latest"]>) =>
  [latest.kind === "ask" ? null : latest.address, ago(latest.at)].filter(Boolean).join(" · ");

// A client, as a card: the whole of it opens their page; above that, the last
// thing they did opens it at that comment, and each home's photo at that home.
// Their page's link says all of it for a screen reader, so the shortcuts
// above it are for a pointer or a finger only.
function ClientCard({ client }: { client: AgentClient }) {
  const reacted = client.homes.some((home) => home.liked + home.passed > 0);
  const liked = client.likedHomes;
  const passed = client.homes.filter((home) => home.passed > 0 && home.liked === 0).length;
  const seen = photosSeenLine(client.photosSeen, client.photoCount);
  const { latest } = client;
  const LatestIcon =
    latest?.kind === "ask" ? DoorOpen : latest?.kind === "comment" ? MessageCircle : latest?.kind === "pass" ? ThumbsDown : Heart;
  // Where they spent the most time, once it's worth saying.
  const longest = [...client.homes].sort((a, b) => b.seconds - a.seconds)[0];
  const tally = [
    client.homes.length === 0 ? "No homes on their link" : `${plural(client.homes.length, "home")} sent`,
    reacted && liked > 0 && `${liked} liked`,
    reacted && passed > 0 && `${passed} passed`,
    client.comments > 0 && plural(client.comments, "comment"),
    longest && longest.seconds >= 60 && client.homes.length > 1 && `most time on ${longest.address.split(",")[0]}`,
  ].filter((part): part is string => Boolean(part));
  // Each opens the link it came from: a client's homes and news can be spread
  // over several links, and the anchor is only on that one.
  const homesAt = (shareId: string) => `/dashboard/shares/${shareId}?tab=homes`;
  const latestHref =
    latest &&
    `${homesAt(latest.shareId)}#${latest.commentId ? `comment-${latest.commentId}` : `home-${encodeURIComponent(latest.listingKey)}`}`;

  return (
    <div
      className={cn(
        card,
        "relative flex items-start gap-3 p-4 transition-shadow has-[[data-cover]:hover]:ring-stone-400 sm:gap-4",
      )}
    >
      <Faces client={client} />
      <div className="min-w-0 flex-1">
        <Link
          data-cover
          href={client.href}
          // The whole card is this link (its edge drawn round the card when
          // it has the keyboard); the shortcuts below sit above it.
          className="block outline-none! before:absolute before:inset-0 before:z-10 before:rounded-2xl focus-visible:before:outline-2 focus-visible:before:outline-offset-2 focus-visible:before:outline-brand"
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-lg font-semibold leading-tight">
              {client.name}
              {client.unread && <span className="sr-only">, new since you last looked</span>}
            </span>
            {client.asks > 0 && (
              <Badge tone="attention" className="shrink-0">
                <DoorOpen aria-hidden size={12} /> Wants a showing
              </Badge>
            )}
            {client.unread && (
              <span
                aria-hidden
                data-unread
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand"
              >
                <Sparkles size={12} /> New
              </span>
            )}
            {client.activeNow && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800">
                <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
                <span className="sr-only">,</span> Active now
              </span>
            )}
          </p>

          {/* Did they open it? The one thing to know first. */}
          <p className="mt-1 flex items-start gap-1.5 text-sm">
            {client.openedAt ? (
              <>
                <Eye aria-hidden size={15} className="mt-0.5 shrink-0 text-emerald-700" />
                <span className="text-stone-800">
                  <Opened at={client.openedAt.toISOString()} />
                  {seen && (
                    <>
                      {" · "}
                      <span className="whitespace-nowrap">{seen}</span>
                    </>
                  )}
                  {client.seconds > 0 && (
                    <>
                      {" · "}
                      <span className="whitespace-nowrap">spent {duration(client.seconds)}</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" />
                <span className="font-medium text-amber-900">
                  Not opened yet <span className="font-normal text-stone-700">· sent {ago(client.sentAt)}</span>
                </span>
              </>
            )}
          </p>

          {/* The rest, said here for a screen reader; shown below. */}
          <div className="sr-only">
            {latest && (
              <p>
                {latest.name} {latest.what} · {latestText(latest)}.
              </p>
            )}
            {client.homes.length > 0 && (
              <ul aria-label={`Homes sent to ${client.name}`}>
                {client.homes.map((home) => (
                  <li key={home.key}>
                    {home.address}: {verdictText(home)}
                    {home.seconds > 0 && `, spent ${duration(home.seconds)}`}
                  </li>
                ))}
              </ul>
            )}
            <p>
              {tally.join(" · ")}
              {client.lastActivity && ` · Last activity ${ago(client.lastActivity)}`}.
            </p>
          </div>
        </Link>

        {/* The last thing they did, which opens their page right there. */}
        {latest && latestHref && (
          <Link
            href={latestHref}
            tabIndex={-1}
            aria-hidden
            className="relative z-20 mt-1 flex items-start gap-1.5 rounded-lg text-sm hover:underline hover:underline-offset-2"
          >
            <LatestIcon
              size={15}
              className={cn(
                "mt-0.5 shrink-0",
                latest.kind === "ask"
                  ? "text-amber-700"
                  : latest.kind === "comment"
                    ? "text-stone-600"
                    : latest.kind === "pass"
                      ? "text-amber-800"
                      : "text-rose-600",
              )}
            />
            <span className="line-clamp-2 min-w-0 break-words text-stone-800">
              <span className="font-semibold">{latest.name}</span> {latest.what}
              <span className="text-muted"> · {latestText(latest)}</span>
            </span>
          </Link>
        )}
        {!latest && client.openedAt && client.homes.length > 0 && (
          <p aria-hidden className="mt-1 text-sm text-muted">
            No reactions yet
          </p>
        )}

        {/* What they were sent, and how each went: each opens at that home. */}
        {client.homes.length > 0 && (
          <ul aria-hidden className="mt-3 flex flex-wrap gap-2">
            {client.homes.slice(0, THUMBS).map((home) => (
              <li key={home.key} title={home.address} className="relative z-20">
                <Link
                  href={`${homesAt(home.shareId)}#home-${encodeURIComponent(home.key)}`}
                  tabIndex={-1}
                  className="block rounded-xl transition-opacity hover:opacity-90"
                >
                  <HomeThumb src={home.photo} sizes="56px" className="size-14">
                    <VerdictBadge home={home} />
                  </HomeThumb>
                </Link>
              </li>
            ))}
            {client.homes.length > THUMBS && (
              <li className="flex size-14 items-center justify-center rounded-xl bg-stone-100 text-sm font-semibold text-stone-700">
                +{client.homes.length - THUMBS}
              </li>
            )}
          </ul>
        )}

        {/* Each part stays whole when the line wraps. */}
        <p aria-hidden className="mt-3 text-meta text-muted [&>span]:whitespace-nowrap">
          {tally.map((part, i) => (
            <span key={part}>
              {i > 0 && " · "}
              {part}
            </span>
          ))}
          {/* When it was busy last, unless the line above says so already. */}
          {client.lastActivity && !latest && <span> · Last activity {ago(client.lastActivity)}</span>}
        </p>
      </div>
    </div>
  );
}

// "1 liked", "2 liked · 1 passed", "no reactions yet".
function verdictText(home: Home) {
  if (home.liked + home.passed === 0) return "no reactions yet";
  return [home.liked > 0 && `${home.liked} liked`, home.passed > 0 && `${home.passed} passed`].filter(Boolean).join(" · ");
}

// On a home's photo, how it went: a heart when anyone liked it, a thumbs down
// when it was only passed on.
function VerdictBadge({ home }: { home: Home }) {
  if (home.liked + home.passed === 0) return null;
  const liked = home.liked > 0;
  const Icon = liked ? Heart : ThumbsDown;
  return (
    <span
      aria-hidden
      className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200"
    >
      <Icon size={13} className={liked ? "fill-rose-600 text-rose-600" : "text-amber-800"} />
    </span>
  );
}
