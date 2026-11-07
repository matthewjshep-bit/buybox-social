import { Heart, MessageCircle, Plus, ThumbsDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { tagNameIn } from "@/lib/photos";
import type { ReactionState } from "@/lib/reactions";
import { clientActivity, describeTake, photosSeenLine } from "@/lib/shares";
import { Opened } from "./opened";

// Each home on a link, and how its people came down on it.
type Home = { key: string; address: string; liked: number; passed: number };

type Row = {
  id: string;
  client_name: string;
  created_at: Date;
  homes: Home[];
  photo: string | null;
  comment_count: number;
  opened_at: Date | null;
  // The most photos anyone has looked at on it, of all it has.
  photos_seen: number;
  photo_count: number;
  last_activity: Date | null;
  unread: boolean;
};

// Something a client did, for "What's new".
type News = {
  id: string;
  href: string;
  kind: "comment" | "like" | "pass";
  name: string;
  what: string;
  address: string;
  at: Date;
};

const NEWS_COUNT = 5;

// "5h ago", "just now", "Nov 3".
const ago = (date: Date) => {
  const text = timeAgo(date.toISOString());
  return /^\d+[mhd]$/.test(text) ? `${text} ago` : text;
};

// "1 home · 96 Fernhollow Ln", "3 homes": how many are on the link, and where
// when it's one (several each get a line of their own).
const homesLine = (homes: Home[]) =>
  homes.length === 0
    ? "No homes on it right now"
    : homes.length === 1
      ? `1 home · ${homes[0].address}`
      : `${homes.length} homes`;

type Mark = { media: string; tag: string };

// The newest things clients did, across every link: a person's take on a home
// (their verdict and what they liked or not in it) as one, each comment on its own.
async function whatsNew(agentId: string): Promise<News[]> {
  const [comments, takes] = await Promise.all([
    sql<{ id: string; share_id: string; first_name: string; body: string; address: string; at: Date }[]>`
      select c.id, c.share_id, p.first_name, c.body, l.data->>'UnparsedAddress' as address, c.created_at as at
      from comments c
      join shares s on s.id = c.share_id
      join participants p on p.id = c.participant_id
      join listings l on l.listing_key = c.listing_key
      where s.agent_id = ${agentId}
      order by c.created_at desc
      limit ${NEWS_COUNT}`,
    sql<
      ({
        share_id: string;
        listing_key: string;
        first_name: string;
        data: Listing;
        at: Date;
        photo_likes: Mark[];
        photo_dislikes: Mark[];
      } & ReactionState)[]
    >`
      select t.share_id, t.listing_key, p.first_name, l.data, t.at,
        r.reaction, coalesce(r.liked, '{}') as liked, coalesce(r.disliked, '{}') as disliked,
        (select coalesce(json_agg(json_build_object('media', pl.media_key, 'tag', pl.tag) order by pl.created_at), '[]')
           from photo_likes pl
           where pl.participant_id = t.participant_id and pl.listing_key = t.listing_key) as photo_likes,
        (select coalesce(json_agg(json_build_object('media', pd.media_key, 'tag', pd.tag) order by pd.created_at), '[]')
           from photo_dislikes pd
           where pd.participant_id = t.participant_id and pd.listing_key = t.listing_key) as photo_dislikes
      from (
        select a.share_id, a.listing_key, a.participant_id, max(a.at) as at
        from (
          select share_id, listing_key, participant_id, updated_at as at from reactions
          union all
          select share_id, listing_key, participant_id, created_at from photo_likes
          union all
          select share_id, listing_key, participant_id, created_at from photo_dislikes
        ) a
        join shares s on s.id = a.share_id
        where s.agent_id = ${agentId}
        group by a.share_id, a.listing_key, a.participant_id
        order by at desc
        limit ${NEWS_COUNT}
      ) t
      join participants p on p.id = t.participant_id
      join listings l on l.listing_key = t.listing_key
      left join reactions r
        on r.share_id = t.share_id and r.listing_key = t.listing_key and r.participant_id = t.participant_id`,
  ]);

  const news: News[] = [
    ...comments.map(
      (c): News => ({
        id: `comment:${c.id}`,
        href: `/dashboard/shares/${c.share_id}#comment-${c.id}`,
        kind: "comment",
        name: c.first_name,
        what: `commented: “${c.body.length > 120 ? `${c.body.slice(0, 117).trimEnd()}…` : c.body}”`,
        address: c.address,
        at: c.at,
      }),
    ),
    ...takes.map((t): News => {
      const named = (marks: Mark[]) => marks.map((m) => tagNameIn(t.data, m.media, m.tag));
      const likes = named(t.photo_likes);
      const dislikes = named(t.photo_dislikes);
      // Read the way the client's page reads each person's line on a home.
      const passed = t.reaction === "dislike" || (!t.reaction && likes.length === 0 && dislikes.length > 0);
      return {
        id: `take:${t.share_id}:${t.listing_key}:${t.first_name}:${t.at.getTime()}`,
        href: `/dashboard/shares/${t.share_id}#home-${encodeURIComponent(t.listing_key)}`,
        kind: passed ? "pass" : "like",
        name: t.first_name,
        // Across every link, a bare "liked this" needs to say what "this" is.
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
  return news.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, NEWS_COUNT);
}

export default async function DashboardPage() {
  const agent = await requireAgent();
  if (!agent.full_name) redirect("/dashboard/profile");

  const [shares, news] = await Promise.all([
    // Per home, each person on the link once: liked (the home, or something
    // in it) or passed (Not for me, or only dislikes), as on the client's page.
    sql<Row[]>`
      select s.id, s.client_name, s.created_at,
        (select coalesce(json_agg(json_build_object(
              'key', sl.listing_key, 'address', l.data->>'UnparsedAddress', 'liked', v.liked, 'passed', v.passed
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
        (select l.data->'Media'->0->>'MediaURL'
           from share_listings sl join listings l on l.listing_key = sl.listing_key
           where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as photo,
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
    whatsNew(agent.id),
  ]);

  return (
    <>
      <LiveRefresh />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Your shares</h1>
        <Link
          href="/dashboard/new"
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 font-semibold text-white"
        >
          <Plus aria-hidden size={18} /> New share
        </Link>
      </div>

      {shares.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          <h2 className="font-display text-xl">Send your first home</h2>
          <p className="mt-1 text-stone-700">
            Pick up to three homes, add a note, and text the link to your client.
          </p>
        </div>
      ) : (
        <>
          <WhatsNew news={news} />
          <section aria-labelledby="links-title" className="mt-8">
            <h2 id="links-title" className="font-display text-2xl">
              Links you&apos;ve sent
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {shares.map((share) => (
                <li key={share.id}>
                  <ShareRow share={share} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

// The latest from clients, newest first, each opening the home it's about.
function WhatsNew({ news }: { news: News[] }) {
  return (
    <section aria-labelledby="news-title" className="mt-6 rounded-2xl bg-white p-2 ring-1 ring-stone-200">
      <h2 id="news-title" className="px-3 pb-1 pt-2 font-display text-2xl">
        What&apos;s new
      </h2>
      {news.length === 0 ? (
        <p className="px-3 pb-3 text-stone-700">
          Nothing yet. When a client likes, passes on or comments on a home, it shows up here.
        </p>
      ) : (
        <ul>
          {news.map((item) => {
            const Icon = item.kind === "comment" ? MessageCircle : item.kind === "pass" ? ThumbsDown : Heart;
            return (
              <li key={item.id}>
                <Link href={item.href} className="flex items-start gap-3 rounded-xl p-3 hover:bg-stone-50">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      item.kind === "comment"
                        ? "bg-stone-100 text-stone-700"
                        : item.kind === "pass"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-rose-50 text-rose-600",
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words text-[15px] leading-snug">
                      <span className="font-semibold">{item.name}</span> {item.what}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-stone-600">
                      {item.address} · <time dateTime={item.at.toISOString()}>{ago(item.at)}</time>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ShareRow({ share }: { share: Row }) {
  const reacted = share.homes.some((home) => home.liked + home.passed > 0);
  return (
    <Link
      href={`/dashboard/shares/${share.id}`}
      className="flex items-start gap-4 rounded-2xl bg-white p-3 ring-1 ring-stone-200 hover:ring-stone-400"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-stone-200">
        {share.photo && <Image src={share.photo} alt="" fill sizes="80px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-semibold">
            {share.client_name || "Unnamed client"}
            {share.unread && <span className="sr-only">, new since you last looked</span>}
          </span>
          {share.unread && <span aria-hidden data-unread className="size-2.5 shrink-0 rounded-full bg-brand" />}
        </p>
        <p className="truncate text-sm text-stone-700">{homesLine(share.homes)}</p>
        {share.homes.length > 1 &&
          (reacted ? (
            // Phones: each address with its verdict under it. Wider: the
            // verdicts in a column just after the longest address.
            <ul className="mt-1 flex flex-col gap-2 text-sm sm:grid sm:w-fit sm:max-w-full sm:grid-cols-[minmax(0,auto)_auto] sm:gap-x-6 sm:gap-y-0.5">
              {share.homes.map((home) => (
                <li key={home.key} className="flex min-w-0 flex-col sm:col-span-2 sm:grid sm:grid-cols-subgrid">
                  <span className="truncate text-stone-700">{home.address}</span>
                  <Verdict home={home} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-stone-700">
              {share.homes.map((home) => (
                <li key={home.key} className="truncate">
                  {home.address}
                </li>
              ))}
            </ul>
          ))}
        {share.homes.length === 1 ? (
          <p className="mt-1 text-sm">
            <Verdict home={share.homes[0]} />
          </p>
        ) : (
          // Said once for the link, not under every home.
          share.homes.length > 1 && !reacted && <p className="mt-1 text-sm text-stone-600">No reactions yet</p>
        )}
        <p className="mt-2 text-sm text-stone-700">
          {share.opened_at ? <Opened at={share.opened_at.toISOString()} /> : "Not opened yet"}
          {share.opened_at && photosSeenLine(share.photos_seen, share.photo_count) && (
            <>{` · ${photosSeenLine(share.photos_seen, share.photo_count)}`}</>
          )}
        </p>
        {/* Each part stays whole when the line wraps. */}
        <p className="mt-0.5 text-[13px] text-stone-600 [&>span]:whitespace-nowrap">
          {share.comment_count > 0 && (
            <>
              <span>{`${share.comment_count} ${share.comment_count === 1 ? "comment" : "comments"}`}</span>
              {" · "}
            </>
          )}
          <span>
            {share.last_activity ? `Last activity ${ago(share.last_activity)}` : `Sent ${ago(share.created_at)}`}
          </span>
        </p>
      </div>
    </Link>
  );
}

// "2 liked · 1 passed", in the colours used everywhere for liking and passing.
function Verdict({ home }: { home: Home }) {
  if (home.liked + home.passed === 0) return <span className="whitespace-nowrap text-stone-600">No reactions yet</span>;
  return (
    <span className="whitespace-nowrap text-stone-800">
      {home.liked > 0 && (
        <>
          <Heart aria-hidden size={13} className="mr-1 inline-block fill-rose-600 align-[-1px] text-rose-600" />
          {home.liked} liked
        </>
      )}
      {home.liked > 0 && home.passed > 0 && " · "}
      {home.passed > 0 && (
        <>
          <ThumbsDown aria-hidden size={13} className="mr-1 inline-block align-[-1px] text-amber-800" />
          {home.passed} passed
        </>
      )}
    </span>
  );
}
