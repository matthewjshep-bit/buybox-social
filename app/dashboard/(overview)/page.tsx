import { Eye, Heart, MessageCircle, Plus, Send, Sparkles, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar, EmptyState, HomeThumb } from "@/components/ui";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import type { ReactionState } from "@/lib/reactions";
import { clientActivity, describeTake, duration, getHomeViews, homeViewKey, photosSeenLine } from "@/lib/shares";
import { button, card } from "@/lib/ui";
import { Opened } from "../opened";

// The agent's dashboard is their clients: who they've sent homes to, what each
// of them was sent, whether they've opened it, what they liked and passed on,
// and the last thing they did. One card per client, newest news first; the
// counts at the top are also the way to see just some of them.

// Each home on a link, and how its people came down on it.
type Home = { key: string; address: string; photo: string | null; photos: number; liked: number; passed: number };

type Row = {
  id: string;
  client_name: string;
  created_at: Date;
  homes: Home[];
  comment_count: number;
  opened_at: Date | null;
  // The most photos anyone has looked at on it, of all it has.
  photos_seen: number;
  photo_count: number;
  last_activity: Date | null;
  unread: boolean;
};

// The newest thing a client did on a link.
type News = { shareId: string; kind: "comment" | "like" | "pass"; name: string; what: string; address: string; at: Date };

type ClientHome = Home & { seconds: number };

// Everyone the agent has sent homes to: links with the same name are one client.
type Client = {
  key: string;
  name: string;
  // Their page: the link with the latest from them.
  href: string;
  homes: ClientHome[];
  sentAt: Date;
  openedAt: Date | null;
  lastActivity: Date | null;
  unread: boolean;
  comments: number;
  photosSeen: number;
  photoCount: number;
  seconds: number;
  latest: News | null;
};

const FILTERS = [
  { key: "all", label: "All clients", test: () => true },
  { key: "new", label: "New activity", test: (c: Client) => c.unread },
  { key: "unopened", label: "Not opened yet", test: (c: Client) => !c.openedAt },
  { key: "liked", label: "Liked a home", test: (c: Client) => c.homes.some((home) => home.liked > 0) },
] as const;

// How many homes a card shows before "+3".
const THUMBS = 6;

// "5h ago", "just now", "Nov 3".
const ago = (date: Date) => {
  const text = timeAgo(date.toISOString());
  return /^\d+[mhd]$/.test(text) ? `${text} ago` : text;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Mark = { media: string; tag: string };

// The newest things clients did, across every link: a person's take on a home
// (their verdict and what they liked or not in it) as one, each comment on its own.
async function latestNews(agentId: string): Promise<News[]> {
  const [comments, takes] = await Promise.all([
    sql<{ share_id: string; first_name: string; body: string; address: string; at: Date }[]>`
      select distinct on (c.share_id) c.share_id, p.first_name, c.body, l.data->>'UnparsedAddress' as address,
        c.created_at as at
      from comments c
      join shares s on s.id = c.share_id
      join participants p on p.id = c.participant_id
      join listings l on l.listing_key = c.listing_key
      where s.agent_id = ${agentId}
      order by c.share_id, c.created_at desc`,
    sql<
      ({ share_id: string; first_name: string; data: Listing; at: Date; photo_likes: Mark[]; photo_dislikes: Mark[] } &
        ReactionState)[]
    >`
      select t.share_id, p.first_name, l.data, t.at,
        r.reaction, coalesce(r.liked, '{}') as liked, coalesce(r.disliked, '{}') as disliked,
        (select coalesce(json_agg(json_build_object('media', pl.media_key, 'tag', pl.tag) order by pl.created_at), '[]')
           from photo_likes pl
           where pl.participant_id = t.participant_id and pl.listing_key = t.listing_key) as photo_likes,
        (select coalesce(json_agg(json_build_object('media', pd.media_key, 'tag', pd.tag) order by pd.created_at), '[]')
           from photo_dislikes pd
           where pd.participant_id = t.participant_id and pd.listing_key = t.listing_key) as photo_dislikes
      from (
        select distinct on (a.share_id) a.share_id, a.listing_key, a.participant_id, a.at
        from (
          select share_id, listing_key, participant_id, updated_at as at from reactions
          union all
          select share_id, listing_key, participant_id, created_at from photo_likes
          union all
          select share_id, listing_key, participant_id, created_at from photo_dislikes
        ) a
        join shares s on s.id = a.share_id
        where s.agent_id = ${agentId}
        order by a.share_id, a.at desc
      ) t
      join participants p on p.id = t.participant_id
      join listings l on l.listing_key = t.listing_key
      left join reactions r
        on r.share_id = t.share_id and r.listing_key = t.listing_key and r.participant_id = t.participant_id`,
  ]);
  return [
    ...comments.map(
      (c): News => ({
        shareId: c.share_id,
        kind: "comment",
        name: c.first_name,
        what: `commented: “${c.body.length > 90 ? `${c.body.slice(0, 87).trimEnd()}…` : c.body}”`,
        address: c.address,
        at: c.at,
      }),
    ),
    ...takes.map((t): News => {
      const passed = t.reaction === "dislike" || (!t.reaction && t.photo_likes.length === 0 && t.photo_dislikes.length > 0);
      return {
        shareId: t.share_id,
        kind: passed ? "pass" : "like",
        name: t.first_name,
        what: describeTake(
          t.data,
          { reaction: t.reaction, liked: t.liked, disliked: t.disliked },
          t.photo_likes.map((m) => ({ mediaKey: m.media, tag: m.tag })),
          t.photo_dislikes.map((m) => ({ mediaKey: m.media, tag: m.tag })),
        )
          .replace(/^liked this(?=,|$)/, "liked this home")
          .replace(/^passed on this$/, "passed on this home"),
        address: t.data.UnparsedAddress,
        at: t.at,
      };
    }),
  ];
}

// Links with the same name (any case) are one client; a link with no name yet
// is a client of its own. Newest news first.
function clientsFrom(shares: Row[], news: News[], seconds: Map<string, number>): Client[] {
  const groups = new Map<string, Row[]>();
  for (const share of shares) {
    const key = share.client_name.trim().toLowerCase() || `link:${share.id}`;
    groups.set(key, [...(groups.get(key) ?? []), share]);
  }
  const latestOf = (date: Date | null, other: Date | null) =>
    !date ? other : !other ? date : date > other ? date : other;
  return [...groups]
    .map(([key, links]): Client => {
      const busiest = [...links].sort(
        (a, b) => (b.last_activity ?? b.created_at).getTime() - (a.last_activity ?? a.created_at).getTime(),
      );
      const homes: ClientHome[] = [];
      for (const link of links) {
        for (const home of link.homes) {
          if (homes.some((h) => h.key === home.key)) continue;
          homes.push({ ...home, seconds: seconds.get(homeViewKey(link.id, home.key)) ?? 0 });
        }
      }
      const said = news.filter((item) => links.some((link) => link.id === item.shareId));
      return {
        key,
        name: links[0].client_name.trim(),
        href: `/dashboard/shares/${(busiest.find((link) => link.unread) ?? busiest[0]).id}`,
        homes,
        sentAt: links.reduce((at, link) => (link.created_at > at ? link.created_at : at), links[0].created_at),
        openedAt: links.reduce<Date | null>((at, link) => latestOf(at, link.opened_at), null),
        lastActivity: links.reduce<Date | null>((at, link) => latestOf(at, link.last_activity), null),
        unread: links.some((link) => link.unread),
        comments: links.reduce((sum, link) => sum + link.comment_count, 0),
        photosSeen: links.reduce((sum, link) => sum + Math.min(link.photos_seen, link.photo_count), 0),
        photoCount: links.reduce((sum, link) => sum + link.photo_count, 0),
        seconds: homes.reduce((sum, home) => sum + home.seconds, 0),
        latest: said.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null,
      };
    })
    // Anyone with something new first, then whoever was on theirs most recently.
    .sort(
      (a, b) =>
        Number(b.unread) - Number(a.unread) ||
        (latestOf(b.lastActivity, b.openedAt) ?? b.sentAt).getTime() - (latestOf(a.lastActivity, a.openedAt) ?? a.sentAt).getTime(),
    );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // (An agent with no name yet was sent to add it: see layout.tsx.)
  const agent = await requireAgent();
  const { show } = await searchParams;

  const [shares, news] = await Promise.all([
    // Per home, each person on the link once: liked (the home, or something
    // in it) or passed (Not for me, or only dislikes), as on the client's page.
    sql<Row[]>`
      select s.id, s.client_name, s.created_at,
        (select coalesce(json_agg(json_build_object(
              'key', sl.listing_key, 'address', l.data->>'UnparsedAddress',
              'photo', l.data->'Media'->0->>'MediaURL', 'photos', coalesce(jsonb_array_length(l.data->'Media'), 0),
              'liked', v.liked, 'passed', v.passed
            ) order by sl.position), '[]')
           from share_listings sl
           join listings l on l.listing_key = sl.listing_key
           cross join lateral (
             select count(*) filter (where verdict = 'like')::int as liked,
                    count(*) filter (where verdict = 'pass')::int as passed
             from (
               select case
                 when r.reaction = 'like' then 'like'
                 when r.reaction = 'dislike' then 'pass'
                 when exists (select 1 from photo_likes pl
                              where pl.participant_id = p.id and pl.listing_key = sl.listing_key) then 'like'
                 when exists (select 1 from photo_dislikes pd
                              where pd.participant_id = p.id and pd.listing_key = sl.listing_key) then 'pass'
               end as verdict
               from participants p
               left join reactions r
                 on r.participant_id = p.id and r.share_id = sl.share_id and r.listing_key = sl.listing_key
               where p.share_id = sl.share_id
             ) person
           ) v
           where sl.share_id = s.id and sl.removed_at is null) as homes,
        (select count(*)::int from comments c where c.share_id = s.id and c.agent_id is null) as comment_count,
        -- Doing anything on a link means it was open then, so links sent before
        -- opens were counted don't read "Not opened yet" under their comments.
        greatest((select max(o.last_at) from share_opens o where o.share_id = s.id), activity.at) as opened_at,
        (select coalesce(max(o.photos_seen), 0)::int from share_opens o where o.share_id = s.id) as photos_seen,
        (select coalesce(sum(jsonb_array_length(l.data->'Media')), 0)::int
           from share_listings sl join listings l on l.listing_key = sl.listing_key
           where sl.share_id = s.id and sl.removed_at is null) as photo_count,
        activity.at as last_activity,
        coalesce(activity.at > s.agent_seen_at, activity.at is not null) as unread
      from shares s
      cross join lateral (
        select max(a.at) as at from (${clientActivity()}) a where a.share_id = s.id
      ) activity
      where s.agent_id = ${agent.id}
      order by s.created_at desc`,
    latestNews(agent.id),
  ]);
  const views = await getHomeViews(shares.map((share) => share.id));
  const seconds = new Map([...views].map(([key, view]) => [key, view.seconds]));
  const clients = clientsFrom(shares, news, seconds);
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];
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
          <nav aria-label="Show clients" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FILTERS.map((f) => {
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
                {filter.key === "new"
                  ? "Nothing new since you last looked."
                  : filter.key === "unopened"
                    ? "Everyone has opened what you sent."
                    : "No one has liked a home yet."}{" "}
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
function FilterMark({ kind, count }: { kind: (typeof FILTERS)[number]["key"]; count: number }) {
  if (count === 0) return null;
  if (kind === "new") return <span aria-hidden className="size-2.5 rounded-full bg-brand" />;
  if (kind === "unopened") return <span aria-hidden className="size-2.5 rounded-full bg-amber-500" />;
  if (kind === "liked") return <Heart aria-hidden size={18} className="fill-rose-600 text-rose-600" />;
  return null;
}

function ClientCard({ client }: { client: Client }) {
  const reacted = client.homes.some((home) => home.liked + home.passed > 0);
  const liked = client.homes.filter((home) => home.liked > 0).length;
  const passed = client.homes.filter((home) => home.passed > 0 && home.liked === 0).length;
  const seen = photosSeenLine(client.photosSeen, client.photoCount);
  const name = client.name || "Unnamed client";
  const LatestIcon = client.latest?.kind === "comment" ? MessageCircle : client.latest?.kind === "pass" ? ThumbsDown : Heart;
  // Where they spent the most time, once it's worth saying.
  const longest = [...client.homes].sort((a, b) => b.seconds - a.seconds)[0];
  return (
    <Link href={client.href} className={cn(card, "flex items-start gap-3 p-4 hover:ring-stone-400 sm:gap-4")}>
      <Avatar name={name} size={10} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-lg font-semibold leading-tight">
            {name}
            {client.unread && <span className="sr-only">, new since you last looked</span>}
          </span>
          {client.unread && (
            <span
              aria-hidden
              data-unread
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand"
            >
              <Sparkles size={12} /> New
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

        {/* The last thing they did. */}
        {client.latest ? (
          <p className="mt-1 flex items-start gap-1.5 text-sm">
            <LatestIcon
              aria-hidden
              size={15}
              className={cn(
                "mt-0.5 shrink-0",
                client.latest.kind === "comment"
                  ? "text-stone-600"
                  : client.latest.kind === "pass"
                    ? "text-amber-800"
                    : "text-rose-600",
              )}
            />
            <span className="line-clamp-2 min-w-0 break-words text-stone-800">
              <span className="font-semibold">{client.latest.name}</span> {client.latest.what}
              <span className="text-muted">
                {" "}
                · {client.latest.address} · <time dateTime={client.latest.at.toISOString()}>{ago(client.latest.at)}</time>
              </span>
            </span>
          </p>
        ) : (
          client.openedAt && client.homes.length > 0 && <p className="mt-1 text-sm text-muted">No reactions yet</p>
        )}

        {/* What they were sent, and how each went. */}
        {client.homes.length > 0 && (
          <ul aria-label={`Homes sent to ${name}`} className="mt-3 flex flex-wrap gap-2">
            {client.homes.slice(0, THUMBS).map((home) => (
              <li key={home.key} title={home.address}>
                <HomeThumb src={home.photo} sizes="56px" className="size-14">
                  <VerdictBadge home={home} />
                </HomeThumb>
                <span className="sr-only">
                  {home.address}: {verdictText(home)}
                  {home.seconds > 0 && `, spent ${duration(home.seconds)}`}
                </span>
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
        <p className="mt-3 text-meta text-muted [&>span]:whitespace-nowrap">
          <span>{client.homes.length === 0 ? "No homes on their link" : `${plural(client.homes.length, "home")} sent`}</span>
          {reacted && (
            <>
              {liked > 0 && (
                <>
                  {" · "}
                  <span>{liked} liked</span>
                </>
              )}
              {passed > 0 && (
                <>
                  {" · "}
                  <span>{passed} passed</span>
                </>
              )}
            </>
          )}
          {client.comments > 0 && (
            <>
              {" · "}
              <span>{plural(client.comments, "comment")}</span>
            </>
          )}
          {longest && longest.seconds >= 60 && client.homes.length > 1 && (
            <>
              {" · "}
              <span>most time on {longest.address.split(",")[0]}</span>
            </>
          )}
          {" · "}
          <span>{client.lastActivity ? `Last activity ${ago(client.lastActivity)}` : `Sent ${ago(client.sentAt)}`}</span>
        </p>
      </div>
    </Link>
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
