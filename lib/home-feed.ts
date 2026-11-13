import { cache } from "react";
import { describeActivity, getActivityRows, quoteOf } from "./activity";
import type { Account } from "./auth";
import { sql } from "./db";
import { getFollowedIds } from "./follows";
import { photosFor, photoUrl } from "./person-photo";
import type { Listing } from "./listings/types";
import { dayOf, getProfileFeed, getProfilePerson, type ProfileCard } from "./profile";
import type { ReactionState } from "./reactions";
import { describeTake } from "./shares";

// The home page, signed in: a feed, newest first, Facebook-style. What people
// you follow did in public (each as their own page shows it), what's happened
// around what you posted (replies, likes on your comments), and for an agent
// what their clients did on links they sent (theirs alone to see). Any home in
// it opens the homes full screen, in the feed's order (`feedKeys`).

// `photo`: their own, where they've added one, in place of their initial.
export type FeedWho = { name: string; face: string; profileId: string | null; agent: boolean; photo: string | null };

export type HomeFeedEntry =
  | {
      kind: "card";
      id: string;
      at: string;
      day: string;
      who: FeedWho;
      card: ProfileCard;
    }
  | {
      kind: "note";
      id: string;
      at: string;
      day: string;
      // Who did it: one person, or (for replies and likes on what you said) several.
      who: FeedWho[];
      // "your client": an agent's own client, on a link they sent.
      client: boolean;
      // What happened, after who: "liked this home, the porch".
      sentence: string;
      quote: string | null;
      home: { key: string; address: string; photo: string | null; photoIndex: number | null };
      // Where to see all of it: an agent's page about that client.
      more?: { href: string; label: string };
    };

// How far back each part reads, and how much the page shows.
const FOLLOWED_MOST = 100;
const FEED_MOST = 60;

const nameOr = (name: string, agent: boolean) => name.trim() || (agent ? "An agent" : "A buyer");

// What people you follow did in public: their own pages' newest cards.
async function followedCards(visitorId: string): Promise<HomeFeedEntry[]> {
  const ids = [...(await getFollowedIds(visitorId))].slice(0, FOLLOWED_MOST);
  const pages = await Promise.all(
    ids.map(async (id) => {
      const person = await getProfilePerson(id);
      if (!person) return [];
      const { cards } = await getProfileFeed(id, { passes: !person.hidePasses });
      const who: FeedWho = {
        name: nameOr(person.name, person.isAgent),
        face: person.name,
        profileId: person.id,
        agent: person.isAgent,
        photo: person.photo,
      };
      // (A day when all they did was like someone's comment says little here.)
      return cards
        .filter((card) => !card.quiet)
        .map((card): HomeFeedEntry => ({ kind: "card", id: `p:${id}:${card.id}`, at: card.at, day: card.day, who, card }));
    }),
  );
  return pages.flat();
}

// What's happened around what you posted: as the bell's Activity page says it.
async function aroundYou(visitorId: string): Promise<HomeFeedEntry[]> {
  const rows = await getActivityRows(visitorId);
  const photos = await photosFor(rows.flatMap((row) => row.people.map((person) => person.id)));
  return rows.map(
    (row): HomeFeedEntry => ({
      kind: "note",
      id: `a:${row.id}`,
      at: row.at,
      day: dayOf(row.at),
      who: row.people.map((person) => ({
        name: person.name,
        face: person.name,
        profileId: person.id,
        agent: false,
        photo: photos.get(person.id) ?? null,
      })),
      client: false,
      sentence: describeActivity(row),
      quote: quoteOf(row),
      home: { key: row.listingKey, address: row.address, photo: row.photo?.url ?? null, photoIndex: row.photo?.index ?? null },
    }),
  );
}

type Mark = { media: string; tag: string };

// An agent's clients, on the links they sent: each person's take on a home (as
// one), and each thing they said. For the agent only.
async function fromClients(agentId: string): Promise<HomeFeedEntry[]> {
  const [takes, comments] = await Promise.all([
    sql<
      ({
        share_id: string;
        first_name: string;
        profile: string | null;
        photo_v: string | null;
        data: Listing;
        at: Date;
        photo_likes: Mark[];
        photo_dislikes: Mark[];
      } & ReactionState)[]
    >`
      select t.share_id, p.first_name, v.id as profile, left(md5(acc.photo_data_url), 10) as photo_v, l.data, t.at,
        r.reaction, coalesce(r.liked, '{}') as liked, coalesce(r.disliked, '{}') as disliked,
        (select coalesce(json_agg(json_build_object('media', pl.media_key, 'tag', pl.tag) order by pl.created_at), '[]')
           from photo_likes pl where pl.participant_id = t.participant_id and pl.listing_key = t.listing_key) as photo_likes,
        (select coalesce(json_agg(json_build_object('media', pd.media_key, 'tag', pd.tag) order by pd.created_at), '[]')
           from photo_dislikes pd where pd.participant_id = t.participant_id and pd.listing_key = t.listing_key) as photo_dislikes
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
        limit ${FEED_MOST}
      ) t
      join participants p on p.id = t.participant_id
      left join visitors v on v.account_id = p.account_id
      left join accounts acc on acc.id = p.account_id
      join listings l on l.listing_key = t.listing_key
      left join reactions r
        on r.share_id = t.share_id and r.listing_key = t.listing_key and r.participant_id = t.participant_id`,
    sql<
      { id: string; share_id: string; first_name: string; profile: string | null; photo_v: string | null; body: string; data: Listing; at: Date }[]
    >`
      select c.id, c.share_id, p.first_name, v.id as profile, left(md5(acc.photo_data_url), 10) as photo_v, c.body, l.data,
        c.created_at as at
      from comments c
      join shares s on s.id = c.share_id
      join participants p on p.id = c.participant_id
      left join visitors v on v.account_id = p.account_id
      left join accounts acc on acc.id = p.account_id
      join listings l on l.listing_key = c.listing_key
      where s.agent_id = ${agentId}
      order by c.created_at desc
      limit ${FEED_MOST}`,
  ]);
  const client = (name: string, profile: string | null, photo: string | null): FeedWho => ({
    name,
    face: name,
    profileId: profile,
    agent: false,
    photo: profile ? photoUrl(profile, photo) : null,
  });
  const home = (data: Listing) => ({
    key: data.ListingKey,
    address: data.UnparsedAddress,
    photo: data.Media?.[0]?.MediaURL ?? null,
    photoIndex: data.Media?.length ? 0 : null,
  });
  const more = (shareId: string, name: string) => ({ href: `/dashboard/shares/${shareId}?tab=homes`, label: `Everything from ${name}` });
  return [
    ...takes.map((t): HomeFeedEntry => {
      const likes = t.photo_likes.map((m) => ({ mediaKey: m.media, tag: m.tag }));
      const dislikes = t.photo_dislikes.map((m) => ({ mediaKey: m.media, tag: m.tag }));
      return {
        kind: "note",
        id: `t:${t.share_id}:${t.data.ListingKey}:${t.first_name}`,
        at: t.at.toISOString(),
        day: dayOf(t.at),
        who: [client(t.first_name, t.profile, t.photo_v)],
        client: true,
        sentence: describeTake(t.data, { reaction: t.reaction, liked: t.liked, disliked: t.disliked }, likes, dislikes)
          .replace(/^liked this(?=,|$)/, "liked this home")
          .replace(/^passed on this$/, "passed on this home"),
        quote: null,
        home: home(t.data),
        more: more(t.share_id, t.first_name),
      };
    }),
    ...comments.map(
      (c): HomeFeedEntry => ({
        kind: "note",
        id: `c:${c.id}`,
        at: c.at.toISOString(),
        day: dayOf(c.at),
        who: [client(c.first_name, c.profile, c.photo_v)],
        client: true,
        sentence: "commented",
        quote: `“${c.body}”`,
        home: home(c.data),
        more: more(c.share_id, c.first_name),
      }),
    ),
  ];
}

// Someone's home feed, newest first.
export const getHomeFeed = cache(async (account: Account, visitorId: string | null): Promise<HomeFeedEntry[]> => {
  const parts = await Promise.all([
    visitorId ? followedCards(visitorId) : [],
    visitorId ? aroundYou(visitorId) : [],
    account.role === "agent" ? fromClients(account.id) : [],
  ]);
  return parts
    .flat()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, FEED_MOST);
});

// The homes in a feed, in its order, each once: what opens full screen.
export const feedKeys = (entries: HomeFeedEntry[]) => [
  ...new Set(entries.map((entry) => (entry.kind === "card" ? entry.card.home.key : entry.home.key))),
];

// Who's worth following: people busy in public lately, most first, never
// yourself or anyone you follow already, and only people with a name.
export async function suggestPeople(visitorId: string | null, most = 5): Promise<(FeedWho & { profileId: string })[]> {
  const followed = await getFollowedIds(visitorId);
  const rows = await sql<{ id: string; name: string; is_agent: boolean; photo_v: string | null }[]>`
    select v.id, v.first_name as name, coalesce(a.role = 'agent', false) as is_agent,
      left(md5(a.photo_data_url), 10) as photo_v
    from visitors v
    left join accounts a on a.id = v.account_id
    join (
      select visitor_id, updated_at as at from public_reactions
      union all select visitor_id, created_at from public_comments
      union all select visitor_id, created_at from public_photo_likes
    ) x on x.visitor_id = v.id
    where x.at > now() - interval '60 days'
      and btrim(v.first_name) <> '' and (a.id is null or btrim(a.full_name) <> '')
      and v.id::text <> ${visitorId ?? ""}
    group by v.id, v.first_name, a.role, a.photo_data_url
    order by count(*) desc, max(x.at) desc
    limit 40`;
  return rows
    .filter((row) => !followed.has(row.id))
    .slice(0, most)
    .map((row) => ({ name: row.name, face: row.name, profileId: row.id, agent: row.is_agent, photo: photoUrl(row.id, row.photo_v) }));
}
