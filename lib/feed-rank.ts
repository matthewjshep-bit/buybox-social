import { sql } from "./db";

// How a feed is put in order, the way the big feeds do it, in plain
// arithmetic: every candidate gets a score (where it came from, how much
// people are doing on it, how the viewer gets on with its author, how old
// it is, whether the viewer has already seen it), near-equal scores are
// shuffled a little differently each session, nothing comes twice in a row
// from the same person or for the same reason, and a few slots are kept
// for homes the viewer has never seen. What the people they follow did
// since the last visit leads, unseen first. (Research and the numbers:
// ~/BuyBoxSocial-runs/feed-research.md.)

export type Source = "post" | "following" | "new" | "popular" | "near" | "picked";

// What the ranking needs to know about a candidate, whatever it is.
export type Candidate = {
  id: string;
  at: string;
  // The homes it's about (a post's, or the one).
  keys: string[];
  // Whose it is (a page id), when it's someone's.
  author: string | null;
  source: Source;
};

export type Engagement = { likes: number; comments: number; lastAt: string | null };

export type RankContext = {
  now: number;
  // Different each session, the same within one.
  seed: string;
  // Likes and comments in the last week, by home.
  engagement: Map<string, Engagement>;
  // How much the viewer has done with each author lately, by page id.
  affinity: Map<string, number>;
  // When the viewer last had each item in front of them, by item id.
  seen: Map<string, string>;
  // When they last looked at their feed (null: never).
  seenAt: string | null;
};

// Where it came from: what the people you follow said and did first.
const SOURCE_WEIGHT: Record<Source, number> = { post: 1, following: 0.7, new: 0.8, popular: 0.7, near: 0.5, picked: 0.5 };
// How fast each kind fades: the time for its score to halve, in hours.
const HALF_LIFE: Record<Source, number> = { post: 36, following: 36, new: 168, popular: 168, near: 720, picked: 720 };
// Something seen already, with nothing new on it since: well back; seen a
// while ago, half back; seen, but with new likes or words since: a little back.
const SEEN_LATELY = 0.15;
const SEEN_A_WHILE_AGO = 0.5;
const SEEN_BUT_NEW = 0.6;
const LATELY_DAYS = 14;
// Near-equal scores move about this much between sessions.
const JITTER = 0.15;
// Never more than this many in a row... (one), and this many per twenty from one person.
const PER_AUTHOR_PER_PAGE = 3;
// Slots kept for homes never seen, from beyond the people you follow.
const DISCOVERY_SLOTS = new Set([4, 9, 14, 19]);

// A small, stable hash of a string, in [0, 1).
export function unit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1024) / 1024;
}

const hours = (from: string, to: number) => Math.max(0, (to - new Date(from).getTime()) / 3_600_000);

// One candidate's score.
export function scoreOf(c: Candidate, ctx: RankContext): number {
  const engagement = c.keys.map((key) => ctx.engagement.get(key)).filter(Boolean) as Engagement[];
  const likes = engagement.reduce((sum, e) => sum + e.likes, 0);
  const comments = engagement.reduce((sum, e) => sum + e.comments, 0);
  const eng = 0.3 * Math.log1p(likes) + 0.5 * Math.log1p(comments);
  const affinity = 1 + Math.min(1, 0.2 * (c.author ? (ctx.affinity.get(c.author) ?? 0) : 0));
  // The clock runs from the newest thing on it (new words bump it back up).
  const newest = engagement.map((e) => e.lastAt).filter(Boolean) as string[];
  const last = newest.reduce((latest, at) => (at > latest ? at : latest), c.at);
  const decay = Math.exp((-Math.LN2 * hours(last, ctx.now)) / HALF_LIFE[c.source]);
  const seenAt = ctx.seen.get(c.id);
  let seen = 1;
  if (seenAt) {
    if (last > seenAt) seen = SEEN_BUT_NEW;
    else seen = hours(seenAt, ctx.now) < LATELY_DAYS * 24 ? SEEN_LATELY : SEEN_A_WHILE_AGO;
  }
  const jitter = 1 + JITTER * (unit(`${ctx.seed}|${c.id}`) - 0.5);
  return SOURCE_WEIGHT[c.source] * (1 + eng) * affinity * decay * seen * jitter;
}

// Whether it's from the people they follow, and new to them since they last looked.
const isFresh = (c: Candidate, ctx: RankContext) =>
  (c.source === "post" || c.source === "following") && !ctx.seen.has(c.id) && (!ctx.seenAt || c.at > ctx.seenAt);

// The feed in order: what's new from the people you follow (best first),
// then everything else by score, with no two in a row from one person or
// for one reason, at most three per page from anyone, and a few slots
// held for homes never seen before from beyond the people you follow.
export function rankFeed<T>(items: T[], describe: (item: T) => Candidate, ctx: RankContext, most: number): T[] {
  const scored = items.map((item) => {
    const c = describe(item);
    return { item, c, score: scoreOf(c, ctx), fresh: isFresh(c, ctx) };
  });
  scored.sort((a, b) => b.score - a.score);
  const fresh = scored.filter((s) => s.fresh);
  const rest = scored.filter((s) => !s.fresh);
  // Never seen, and not from the people you follow: what the held slots are for.
  const isDiscovery = (s: (typeof scored)[number]) =>
    !ctx.seen.has(s.c.id) && s.c.source !== "post" && s.c.source !== "following";

  const out: (typeof scored)[number][] = [];
  const pool = [...fresh, ...rest];
  const perAuthor = new Map<string, number>();
  // (A held slot takes a never-seen home even for the same reason as the
  // card before it: never seen beats never two of a kind in a row.)
  const fits = (s: (typeof scored)[number], last: (typeof scored)[number] | undefined, discovery = false) => {
    if (last && s.c.author && last.c.author === s.c.author) return false;
    if (!discovery && last && !s.c.author && last.c.source === s.c.source && s.c.source !== "following" && s.c.source !== "post") return false;
    if (s.c.author && (perAuthor.get(s.c.author) ?? 0) >= PER_AUTHOR_PER_PAGE * Math.ceil((out.length + 1) / 20)) return false;
    return true;
  };
  while (out.length < most && pool.length > 0) {
    const last = out.at(-1);
    let pickAt = -1;
    if (DISCOVERY_SLOTS.has(out.length)) pickAt = pool.findIndex((s) => isDiscovery(s) && fits(s, last, true));
    if (pickAt < 0) pickAt = pool.findIndex((s) => fits(s, last));
    if (pickAt < 0) pickAt = 0;
    const [next] = pool.splice(pickAt, 1);
    out.push(next);
    if (next.c.author) perAuthor.set(next.c.author, (perAuthor.get(next.c.author) ?? 0) + 1);
  }
  return out.map((s) => s.item);
}

// Likes and comments on these homes in the last week, and when the newest was.
export async function getEngagement(keys: string[]): Promise<Map<string, Engagement>> {
  if (keys.length === 0) return new Map();
  const rows = await sql<{ listing_key: string; likes: number; comments: number; last_at: Date }[]>`
    select x.listing_key, sum(x.likes)::int as likes, sum(x.comments)::int as comments, max(x.at) as last_at
    from (
      select listing_key, 1 as likes, 0 as comments, updated_at as at from public_reactions
      where reaction = 'like' and updated_at > now() - interval '7 days' and listing_key in ${sql(keys)}
      union all
      select listing_key, 1, 0, updated_at from reactions
      where reaction = 'like' and updated_at > now() - interval '7 days' and listing_key in ${sql(keys)}
      union all
      select listing_key, 0, 1, created_at from public_comments
      where created_at > now() - interval '7 days' and listing_key in ${sql(keys)}
      union all
      select listing_key, 0, 1, created_at from comments
      where participant_id is not null and listing_key is not null and created_at > now() - interval '7 days'
        and listing_key in ${sql(keys)}
    ) x
    group by x.listing_key`;
  return new Map(rows.map((row) => [row.listing_key, { likes: row.likes, comments: row.comments, lastAt: row.last_at.toISOString() }]));
}

// How much the viewer has done with each author in the last three months:
// their comments liked, their comments answered. By the author's page id.
export async function getAffinity(visitorId: string | null): Promise<Map<string, number>> {
  if (!visitorId) return new Map();
  const rows = await sql<{ author: string; n: number }[]>`
    select author, count(*)::int as n from (
      select c.visitor_id as author from public_comment_likes cl join public_comments c on c.id = cl.comment_id
      where cl.visitor_id = ${visitorId} and cl.created_at > now() - interval '90 days'
      union all
      select p.visitor_id from public_comments r join public_comments p on p.id = r.parent_id
      where r.visitor_id = ${visitorId} and r.created_at > now() - interval '90 days'
    ) x
    where author <> ${visitorId}
    group by author`;
  return new Map(rows.map((row) => [row.author, row.n]));
}

// When the viewer last had each of these items in front of them.
export async function getImpressions(visitorId: string | null, ids: string[]): Promise<Map<string, string>> {
  if (!visitorId || ids.length === 0) return new Map();
  const rows = await sql<{ item: string; last_seen_at: Date }[]>`
    select item, last_seen_at from feed_impressions where visitor_id = ${visitorId} and item in ${sql(ids)}`;
  return new Map(rows.map((row) => [row.item, row.last_seen_at.toISOString()]));
}

// Items that were in front of them just now.
export async function noteImpressions(visitorId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    insert into feed_impressions (visitor_id, item)
    select ${visitorId}, item from unnest(${ids}::text[]) as item
    on conflict (visitor_id, item) do update set last_seen_at = now(), seen_count = feed_impressions.seen_count + 1`;
}
