import { getAgentListings } from "./agent-listings";
import { sql } from "./db";
import { escapeLike } from "./format";
import { photoUrl } from "./person-photo";

// Finding people, and people worth following. One rule for who can be found,
// written once here and used by Search's People side, by its suggestions and
// by the people picker's "On Porchcard" group, so the three can't drift:
//
// - Only someone with an account, a name on it, and a public page with a
//   first name. Never a browser nobody signed in on.
// - An agent, by the start of any word of their whole name or their company
//   (both are on their public page). Anyone else, by the start of their first
//   name and nothing more: a surname is never matched and never comes back.
// - Never by email, and no email or phone ever comes back.
// - Someone who is on a link another person sent them and has done nothing
//   in public (no like, comment, photo like or post) isn't found by
//   strangers: being an agent's client is not a public thing. The people they
//   already know (whoever they follow, whoever follows them, whoever sent
//   them the link) find them as before.

// Who's asking: their page (none yet for someone with no name) and account.
export type PeopleViewer = { visitorId: string | null; accountId: string; agent: boolean };

export type FoundPerson = {
  profileId: string;
  // What a list calls them: an agent by their whole name, anyone else by
  // their first name.
  name: string;
  // Their first name: the initial on their face, and "Follow Reed".
  face: string;
  agent: boolean;
  // An agent's company, where they've said one.
  brokerage: string | null;
  photo: string | null;
  // One line on why they're here, when there's a real reason: "Follows you",
  // "Liked 3 homes you liked". To an agent, their own client: "Your client".
  reason: string | null;
  iFollow: boolean;
  followsMe: boolean;
};

// How short and how long a name to look for may be, and how many come back:
// never the whole directory, and no second page.
const SHORTEST = 2;
export const NAME_LONGEST = 40;
export const FOUND_MOST = 20;

// Someone with a page of their own and a name on it. (`v` is their visitors
// row and `a` their accounts row, in the query this goes into.)
const named = () => sql`a.role is not null and btrim(a.full_name) <> '' and btrim(v.first_name) <> ''`;

// Whether they've been anywhere but a link someone sent them: every agent
// (their page is their shop window), anyone on nobody's link, and anyone who
// has liked or said something in public. (`v` and `a`, as above.)
const inPublic = () => sql`(
  a.role = 'agent'
  or not exists (
    select 1 from participants p join shares s on s.id = p.share_id
    where p.account_id = a.id and s.agent_id <> a.id)
  or exists (select 1 from public_reactions r where r.visitor_id = v.id and r.reaction = 'like')
  or exists (select 1 from public_comments c where c.visitor_id = v.id)
  or exists (select 1 from public_photo_likes pl where pl.visitor_id = v.id))`;

// Who a stranger can find: the two together. (The people picker's "On
// Porchcard" group asks with this, so it and Search agree.)
export const findable = () => sql`${named()} and ${inPublic()}`;

// Someone the viewer knows already: either follows the other, or the viewer
// sent them a link. (`v` and `a`, as above.)
const known = (viewer: PeopleViewer) => sql`(
  exists (
    select 1 from follows f
    where (f.follower_id = ${viewer.visitorId}::uuid and f.followed_id = v.id)
       or (f.followed_id = ${viewer.visitorId}::uuid and f.follower_id = v.id))
  or ${onMyLink(viewer)})`;

// On a link the viewer sent: their client, if the viewer is an agent.
const onMyLink = (viewer: PeopleViewer) => sql`exists (
  select 1 from participants p join shares s on s.id = p.share_id
  where p.account_id = a.id and s.agent_id = ${viewer.accountId})`;

// How many homes both of them like, in public.
const sharedLikes = (viewer: PeopleViewer) => sql`(
  select count(*)::int from public_reactions mine
  join public_reactions theirs on theirs.listing_key = mine.listing_key
  where mine.visitor_id = ${viewer.visitorId}::uuid and mine.reaction = 'like'
    and theirs.visitor_id = v.id and theirs.reaction = 'like')`;

// A name's words, plainly: lower case, anything that isn't a letter or a
// number a space ("O'Brien-Lee" is "o brien lee").
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// What was typed, if it's a name to look for: two to forty characters with a
// letter in them, and not an email (so typing one can't tell whether they're
// here). Otherwise null, and nobody is looked for.
function nameQuery(typed: string): string | null {
  const query = typed.trim().replace(/\s+/g, " ");
  if (query.length < SHORTEST || query.length > NAME_LONGEST || query.includes("@")) return null;
  return /\p{L}/u.test(query) ? query : null;
}

type Row = {
  id: string;
  name: string;
  face: string;
  is_agent: boolean;
  brokerage: string | null;
  photo_v: string | null;
};

const person = (row: Row) => ({
  profileId: row.id,
  name: row.name,
  face: row.face,
  agent: row.is_agent,
  brokerage: row.brokerage,
  photo: photoUrl(row.id, row.photo_v),
});

// What every list of people shows of someone. (`v` and `a`, as above.)
const shown = () => sql`
  v.id,
  case when a.role = 'agent' then btrim(a.full_name) else btrim(v.first_name) end as name,
  btrim(v.first_name) as face,
  a.role = 'agent' as is_agent,
  case when a.role = 'agent' then nullif(btrim(a.brokerage), '') end as brokerage,
  left(md5(a.photo_data_url), 10) as photo_v`;

const likedToo = (n: number) => (n >= 2 ? `Liked ${n} homes you liked` : null);

// People by name, for Search: the ones the viewer knows first (their client,
// who follows them, whom they follow, who likes the homes they like), then
// whoever's been busiest in public lately, so the twenty shown are the likely
// ones. Never the viewer. Twenty at most, with no way to ask for more.
export async function findPeople(viewer: PeopleViewer, typed: string): Promise<FoundPerson[]> {
  const query = nameQuery(typed);
  if (!query) return [];
  const words = plain(query);
  if (!words) return [];
  // A first name, from its start (so the index on it is used).
  const prefix = `${escapeLike(query.toLowerCase())}%`;
  // Any word of an agent's name or company, from its start.
  const word = `% ${escapeLike(words)}%`;
  const rows = await sql<(Row & { i_follow: boolean; follows_me: boolean; my_client: boolean; shared: number })[]>`
    select ${shown()},
      exists (
        select 1 from follows f where f.follower_id = ${viewer.visitorId}::uuid and f.followed_id = v.id) as i_follow,
      exists (
        select 1 from follows f where f.followed_id = ${viewer.visitorId}::uuid and f.follower_id = v.id) as follows_me,
      ${onMyLink(viewer)} as my_client,
      ${sharedLikes(viewer)} as shared,
      greatest(
        (select max(r.updated_at) from public_reactions r where r.visitor_id = v.id and r.reaction = 'like'),
        (select max(pl.created_at) from public_photo_likes pl where pl.visitor_id = v.id),
        (select max(c.created_at) from public_comments c where c.visitor_id = v.id)
      ) as last_at
    from visitors v
    join accounts a on a.id = v.account_id
    where ${named()} and a.id <> ${viewer.accountId}
      and (
        (a.role <> 'agent' and lower(v.first_name) like ${prefix})
        or (a.role = 'agent' and (
          ' ' || lower(regexp_replace(a.full_name, '[^[:alnum:]]+', ' ', 'g')) like ${word}
          or ' ' || lower(regexp_replace(a.brokerage, '[^[:alnum:]]+', ' ', 'g')) like ${word})))
      and (${inPublic()} or ${known(viewer)})
    order by my_client desc, follows_me desc, i_follow desc, shared desc, last_at desc nulls last, lower(v.first_name), v.id
    limit ${FOUND_MOST}`;
  return rows.map((row) => ({
    ...person(row),
    // (Only an agent has clients: a friend someone sent homes to isn't one.)
    reason:
      viewer.agent && row.my_client ? "Your client" : row.follows_me ? "Follows you" : likedToo(row.shared),
    iFollow: row.i_follow,
    followsMe: row.follows_me,
  }));
}

// The homes an agent has for sale, by key: what "Liked your listing" is about.
async function listingKeysOf(viewer: PeopleViewer): Promise<string[]> {
  if (!viewer.agent) return [];
  const [agent] = await sql<{ mls_agent_id: string | null; full_name: string }[]>`
    select mls_agent_id, full_name from accounts where id = ${viewer.accountId} and role = 'agent'`;
  if (!agent) return [];
  const listings = await getAgentListings(agent.mls_agent_id?.trim() || null, agent.full_name.trim(), viewer.accountId);
  return listings.map((listing) => listing.ListingKey);
}

// People worth following, the likeliest first, each with the reason where
// there's a real one: who follows them and isn't followed back ("Follows
// you"); for an agent, who liked or spoke about one of their listings; who
// likes two or more of the homes they like; then whoever's been busiest in
// public these sixty days, with no reason given. Never themselves or anyone
// they follow already. Every reason comes from what's public: nothing here
// says who is whose client (an agent and their client, who follow each other
// from the link, are never each other's "Follows you").
export async function suggestPeopleFor(viewer: PeopleViewer, most = 12): Promise<FoundPerson[]> {
  const keys = await listingKeysOf(viewer);
  // What they did, in public, on one of the agent's listings.
  const likedMine = keys.length
    ? sql`(
        (select count(*)::int from public_reactions x
          where x.visitor_id = v.id and x.reaction = 'like' and x.listing_key in ${sql(keys)})
        + (select count(*)::int from public_photo_likes x
          where x.visitor_id = v.id and x.listing_key in ${sql(keys)}))`
    : sql`0`;
  const saidMine = keys.length
    ? sql`(select count(*)::int from public_comments x where x.visitor_id = v.id and x.listing_key in ${sql(keys)})`
    : sql`0`;
  const rows = await sql<(Row & { follows_me: boolean; liked_mine: number; said_mine: number; shared: number })[]>`
    select * from (
      select ${shown()},
        (exists (
          select 1 from follows f where f.followed_id = ${viewer.visitorId}::uuid and f.follower_id = v.id)
          and not exists (
            select 1 from participants p join shares s on s.id = p.share_id
            where (p.account_id = a.id and s.agent_id = ${viewer.accountId})
               or (p.account_id = ${viewer.accountId} and s.agent_id = a.id))) as follows_me,
        ${likedMine} as liked_mine,
        ${saidMine} as said_mine,
        ${sharedLikes(viewer)} as shared,
        act.n as busy, act.last_at
      from visitors v
      join accounts a on a.id = v.account_id
      cross join lateral (
        select count(*)::int as n, max(x.at) as last_at from (
          select updated_at as at from public_reactions where visitor_id = v.id and reaction = 'like'
          union all select created_at from public_comments where visitor_id = v.id
          union all select created_at from public_photo_likes where visitor_id = v.id
        ) x
        where x.at > now() - interval '60 days') act
      where ${named()} and a.id <> ${viewer.accountId}
        and (${inPublic()} or ${known(viewer)})
        and not exists (
          select 1 from follows f where f.follower_id = ${viewer.visitorId}::uuid and f.followed_id = v.id)
    ) c
    where c.follows_me or c.liked_mine > 0 or c.said_mine > 0 or c.shared >= 2 or c.busy > 0
    order by
      case when c.follows_me then 0 when c.liked_mine > 0 or c.said_mine > 0 then 1 when c.shared >= 2 then 2 else 3 end,
      c.shared desc, c.busy desc, c.last_at desc nulls last, c.id
    limit ${most}`;
  return rows.map((row) => ({
    ...person(row),
    reason: row.follows_me
      ? "Follows you"
      : row.liked_mine > 0
        ? "Liked your listing"
        : row.said_mine > 0
          ? "Commented on your listing"
          : likedToo(row.shared),
    iFollow: false,
    followsMe: row.follows_me,
  }));
}
