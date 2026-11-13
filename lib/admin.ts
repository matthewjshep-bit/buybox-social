import { SUPER_ADMIN_EMAIL } from "./auth";
import { sql } from "./db";
import type { Listing } from "./listings/types";
import { ORDER_BY, toTotals, totalsForListing, type TotalsRow } from "./public";
import type { Aspect } from "./reactions";

// What the admin pages show: everyone who's signed up or started to, every
// home and what people make of it, and every public comment. Private chats
// between buyers and agents show as counts, never their words.

export const PAGE_SIZE = 50;

// "Lead": left their details on the home page but hasn't opened their sign-in link.
export type PersonStatus = "lead" | "buyer" | "agent";
export const STATUSES: PersonStatus[] = ["lead", "buyer", "agent"];

const pageOf = (page: number) => Math.max(0, Math.floor(page) - 1) * PAGE_SIZE;

// A search as typed, safe to put in `ilike`; and its digits, to find a phone
// number however it was written.
function searchTerms(q: string | undefined) {
  const text = q?.trim() ?? "";
  if (!text) return { like: null, digits: "" };
  const digits = text.replace(/\D/g, "");
  return { like: `%${text.replace(/[\\%_]/g, "\\$&")}%`, digits: digits.length >= 3 ? digits : "" };
}

// --- Overview ---------------------------------------------------------------

export async function getOverview() {
  const [counts] = await sql<
    {
      buyers: number;
      agents: number;
      joined_week: number;
      open_leads: number;
      leads_week: number;
      active_homes: number;
      homes: number;
      likes_week: number;
      comments_week: number;
      links_week: number;
      views_week: number;
    }[]
  >`
    select
      (select count(*)::int from accounts where role = 'buyer') as buyers,
      (select count(*)::int from accounts where role = 'agent') as agents,
      (select count(*)::int from accounts
        where role is not null and created_at > now() - interval '7 days') as joined_week,
      (select count(*)::int from signups s
        where not exists (select 1 from accounts a where a.email = s.email)) as open_leads,
      (select count(*)::int from signups where created_at > now() - interval '7 days') as leads_week,
      (select count(*)::int from listings where standard_status = 'Active') as active_homes,
      (select count(*)::int from listings) as homes,
      (select count(*)::int from public_reactions
        where reaction = 'like' and updated_at > now() - interval '7 days')
      + (select count(*)::int from reactions
        where reaction = 'like' and updated_at > now() - interval '7 days') as likes_week,
      (select count(*)::int from public_comments where created_at > now() - interval '7 days')
      + (select count(*)::int from comments
        where participant_id is not null and created_at > now() - interval '7 days') as comments_week,
      (select count(*)::int from shares where created_at > now() - interval '7 days') as links_week,
      (select count(*)::int from listing_views where first_seen > now() - interval '7 days') as views_week`;

  const [followUps, comments, hot] = await Promise.all([
    // Everyone who signed up on the home page lately, newest first, to call
    // while they're warm.
    sql<{ id: string; name: string; email: string; phone: string; at: Date; signed_in: boolean }[]>`
      select coalesce(a.id, s.id) as id, s.full_name as name, s.email, s.phone, s.created_at as at,
        a.id is not null as signed_in
      from signups s left join accounts a on a.email = s.email
      where s.created_at > now() - interval '30 days'
      order by s.created_at desc
      limit 8`,
    listComments({ page: 1, limit: 5 }),
    // The homes people liked and talked about most this week.
    sql<{ listing_key: string; data: Listing; n: number }[]>`
      select l.listing_key, l.data, x.n
      from listings l
      cross join lateral (
        select
          (select count(*) from public_reactions
            where listing_key = l.listing_key and reaction = 'like' and updated_at > now() - interval '7 days')
          + (select count(*) from reactions
            where listing_key = l.listing_key and reaction = 'like' and updated_at > now() - interval '7 days')
          + (select count(*) from public_comments
            where listing_key = l.listing_key and created_at > now() - interval '7 days')
          + (select count(*) from comments
            where listing_key = l.listing_key and participant_id is not null
              and created_at > now() - interval '7 days')
          as n) x
      where x.n > 0
      order by x.n desc, l.listing_key
      limit 5`,
  ]);

  return { counts, followUps, comments: comments.rows, hot };
}

// --- People -----------------------------------------------------------------

export type PersonRow = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: PersonStatus;
  since: Date;
  likes: number;
  comments: number;
  links: number;
  last_active: Date | null;
};

// Everyone: accounts (with the details they left on the home page, if any),
// and leads who left details but never opened their sign-in link. Admins who
// just signed in (no sign-up, not agents) are staff, not people to follow up with.
const people = () => sql`
  select a.id, a.email,
    coalesce(nullif(a.full_name, ''), s.full_name, '') as name,
    coalesce(nullif(a.phone, ''), s.phone, '') as phone,
    coalesce(a.role, 'lead') as status,
    least(a.created_at, s.created_at) as since,
    v.id as visitor_id
  from accounts a
  left join signups s on s.email = a.email
  left join visitors v on v.account_id = a.id
  where not (coalesce(a.role, 'buyer') = 'buyer' and s.email is null
    and (a.email = ${SUPER_ADMIN_EMAIL} or exists (select 1 from admins ad where ad.email = a.email)))
  union all
  select s.id, s.email, s.full_name, s.phone, 'lead', s.created_at, null::uuid
  from signups s
  where not exists (select 1 from accounts a where a.email = s.email)`;

const activity = () => sql`
  (select count(*)::int from public_reactions r where r.visitor_id = p.visitor_id and r.reaction = 'like') as likes,
  (select count(*)::int from public_comments c where c.visitor_id = p.visitor_id) as comments,
  (select count(*)::int from shares sh where sh.agent_id = p.id) as links,
  greatest(
    (select max(updated_at) from public_reactions r where r.visitor_id = p.visitor_id),
    (select max(created_at) from public_comments c where c.visitor_id = p.visitor_id),
    (select max(created_at) from public_photo_likes pl where pl.visitor_id = p.visitor_id),
    (select max(created_at) from shares sh where sh.agent_id = p.id)) as last_active`;

export async function listPeople({
  q,
  status,
  page = 1,
  limit = PAGE_SIZE,
}: {
  q?: string;
  status?: PersonStatus;
  page?: number;
  limit?: number | null;
}) {
  const { like, digits } = searchTerms(q);
  const rows = await sql<(PersonRow & { total: number })[]>`
    select p.id, p.email, p.name, p.phone, p.status, p.since, ${activity()},
      (count(*) over ())::int as total
    from (${people()}) p
    where (${status ?? null}::text is null or p.status = ${status ?? null})
      and (${like}::text is null
        or p.name ilike ${like} or p.email ilike ${like}
        or (${digits} <> '' and regexp_replace(p.phone, '\\D', '', 'g') like '%' || ${digits} || '%'))
    order by p.since desc, p.email
    ${limit === null ? sql`` : sql`limit ${limit} offset ${pageOf(page)}`}`;
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function countPeople() {
  const rows = await sql<{ status: PersonStatus; n: number }[]>`
    select p.status, count(*)::int as n from (${people()}) p group by p.status`;
  const counts = { lead: 0, buyer: 0, agent: 0, all: 0 };
  for (const row of rows) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }
  return counts;
}

export type PersonHome = { listing_key: string; data: Listing; reaction: "like" | "dislike" | null; at: Date };
export type PersonComment = { id: string; listing_key: string; address: string; body: string; at: Date };
export type PersonLink = {
  id: string;
  client_name: string;
  created_at: Date;
  addresses: string[];
  people: string[];
  reactions: number;
  comments: number;
};

export type Person = {
  id: string;
  // Null for a lead who never opened their sign-in link.
  accountId: string | null;
  email: string;
  name: string;
  phone: string;
  status: PersonStatus;
  brokerage: string;
  leadAt: Date | null;
  joinedAt: Date | null;
  homes: PersonHome[];
  comments: PersonComment[];
  links: PersonLink[];
};

export async function getPerson(id: string): Promise<Person | null> {
  const [account] = await sql<
    {
      id: string;
      email: string;
      full_name: string;
      phone: string;
      role: "buyer" | "agent" | null;
      brokerage: string;
      created_at: Date;
      lead_name: string | null;
      lead_phone: string | null;
      lead_at: Date | null;
      visitor_id: string | null;
    }[]
  >`
    select a.id, a.email, a.full_name, a.phone, a.role, a.brokerage, a.created_at,
      s.full_name as lead_name, s.phone as lead_phone, s.created_at as lead_at, v.id as visitor_id
    from accounts a
    left join signups s on s.email = a.email
    left join visitors v on v.account_id = a.id
    where a.id::text = ${id}`;

  if (!account) {
    const [lead] = await sql<{ id: string; email: string; full_name: string; phone: string; created_at: Date }[]>`
      select id, email, full_name, phone, created_at from signups where id::text = ${id}`;
    if (!lead) return null;
    return {
      id: lead.id,
      accountId: null,
      email: lead.email,
      name: lead.full_name,
      phone: lead.phone,
      status: "lead",
      brokerage: "",
      leadAt: lead.created_at,
      joinedAt: null,
      homes: [],
      comments: [],
      links: [],
    };
  }

  const visitor = account.visitor_id;
  const [homes, comments, links] = await Promise.all([
    visitor
      ? sql<PersonHome[]>`
          select r.listing_key, l.data, r.reaction, r.updated_at as at
          from public_reactions r join listings l on l.listing_key = r.listing_key
          where r.visitor_id = ${visitor} and r.reaction is not null
          order by r.updated_at desc
          limit 100`
      : Promise.resolve([] as PersonHome[]),
    visitor
      ? sql<PersonComment[]>`
          select c.id, c.listing_key, l.data->>'UnparsedAddress' as address, c.body, c.created_at as at
          from public_comments c join listings l on l.listing_key = c.listing_key
          where c.visitor_id = ${visitor}
          order by c.created_at desc
          limit 100`
      : Promise.resolve([] as PersonComment[]),
    account.role === "agent"
      ? sql<PersonLink[]>`
          select s.id, s.client_name, s.created_at,
            (select coalesce(array_agg(l.data->>'UnparsedAddress' order by sl.position), '{}')
               from share_listings sl join listings l on l.listing_key = sl.listing_key
               where sl.share_id = s.id and sl.removed_at is null) as addresses,
            (select coalesce(array_agg(p.first_name order by p.invited_at nulls last, p.position nulls last, p.created_at), '{}')
               from participants p where p.share_id = s.id) as people,
            (select count(*)::int from reactions r where r.share_id = s.id) as reactions,
            (select count(*)::int from comments c where c.share_id = s.id and c.participant_id is not null) as comments
          from shares s
          where s.agent_id = ${account.id}
          order by s.created_at desc
          limit 100`
      : Promise.resolve([] as PersonLink[]),
  ]);

  return {
    id: account.id,
    accountId: account.id,
    email: account.email,
    name: account.full_name || account.lead_name || "",
    phone: account.phone || account.lead_phone || "",
    status: account.role ?? "lead",
    brokerage: account.brokerage,
    leadAt: account.lead_at,
    joinedAt: account.created_at,
    homes,
    comments,
    links,
  };
}

// --- Homes ------------------------------------------------------------------

export const HOME_SORTS = {
  liked: { label: "Most liked", order: () => ORDER_BY.liked() },
  talked: { label: "Most talked about", order: () => ORDER_BY.talked() },
  viewed: { label: "Most viewed", order: () => ORDER_BY.viewed() },
  sent: { label: "Most sent by agents", order: () => sql`t.sends desc` },
  newest: { label: "Newest", order: () => sql`l.data->>'OnMarketDate' desc nulls last` },
  price: { label: "Highest price", order: () => sql`(l.data->>'ListPrice')::numeric desc` },
} as const;
export type HomeSort = keyof typeof HOME_SORTS;

export type HomeRow = { listing: Listing; status: string; total: number } & ReturnType<typeof toTotals>;

export async function listHomes({
  q,
  status,
  sort = "liked",
  page = 1,
}: {
  q?: string;
  status?: string;
  sort?: HomeSort;
  page?: number;
}) {
  const { like } = searchTerms(q);
  const rows = await sql<({ data: Listing; standard_status: string; total: number } & TotalsRow)[]>`
    select l.data, l.standard_status, t.*, (count(*) over ())::int as total
    from listings l
    cross join lateral (${totalsForListing()}) t
    where (${status ?? null}::text is null or l.standard_status = ${status ?? null})
      and (${like}::text is null
        or l.data->>'UnparsedAddress' ilike ${like} or l.data->>'City' ilike ${like}
        or l.data->>'PostalCode' ilike ${like} or l.listing_key ilike ${like})
    order by ${HOME_SORTS[sort].order()}, l.listing_key
    limit ${PAGE_SIZE} offset ${pageOf(page)}`;
  return {
    rows: rows.map((row) => ({ listing: row.data, status: row.standard_status, total: row.total, ...toTotals(row) })),
    total: rows[0]?.total ?? 0,
  };
}

export async function homeStatuses() {
  return sql<{ status: string; n: number }[]>`
    select standard_status as status, count(*)::int as n from listings group by 1 order by 2 desc`;
}

export type HomePerson = {
  name: string;
  accountId: string | null;
  reaction: "like" | "dislike";
  liked: Aspect[];
  disliked: Aspect[];
  at: Date;
};

export async function getHome(listingKey: string) {
  if (listingKey.length > 100) return null;
  const [row] = await sql<({ data: Listing; standard_status: string } & TotalsRow)[]>`
    select l.data, l.standard_status, t.*
    from listings l
    cross join lateral (${totalsForListing()}) t
    where l.listing_key = ${listingKey}`;
  if (!row) return null;

  const [people, links, comments] = await Promise.all([
    // Who liked or passed on it in public; their account, if they have one.
    sql<HomePerson[]>`
      select coalesce(nullif(a.full_name, ''), v.first_name) as name, a.id as "accountId",
        r.reaction, r.liked, r.disliked, r.updated_at as at
      from public_reactions r
      join visitors v on v.id = r.visitor_id
      left join accounts a on a.id = v.account_id
      where r.listing_key = ${listingKey} and r.reaction is not null
      order by r.updated_at desc`,
    // Agents who sent it, to whom, and how it landed (counts only: those chats are private).
    sql<
      {
        id: string;
        agent_id: string;
        agent_name: string;
        client_name: string;
        // The first home on it, for a link nobody is on yet.
        first_address: string | null;
        created_at: Date;
        removed: boolean;
        likes: number;
        passes: number;
        comments: number;
      }[]
    >`
      select s.id, a.id as agent_id, coalesce(nullif(a.full_name, ''), a.email) as agent_name,
        s.client_name, s.created_at, sl.removed_at is not null as removed,
        (select l2.data->>'UnparsedAddress'
           from share_listings sl2 join listings l2 on l2.listing_key = sl2.listing_key
           where sl2.share_id = s.id and sl2.removed_at is null order by sl2.position limit 1) as first_address,
        (select count(*)::int from reactions r
          where r.share_id = s.id and r.listing_key = ${listingKey} and r.reaction = 'like') as likes,
        (select count(*)::int from reactions r
          where r.share_id = s.id and r.listing_key = ${listingKey} and r.reaction = 'dislike') as passes,
        (select count(*)::int from comments c
          where c.share_id = s.id and c.listing_key = ${listingKey} and c.participant_id is not null) as comments
      from share_listings sl
      join shares s on s.id = sl.share_id
      join accounts a on a.id = s.agent_id
      where sl.listing_key = ${listingKey}
      order by s.created_at desc`,
    listComments({ listingKey, page: 1, limit: null }),
  ]);

  return {
    listing: row.data,
    status: row.standard_status,
    ...toTotals(row),
    people,
    links,
    comments: comments.rows,
  };
}

// --- Comments ---------------------------------------------------------------

export type CommentRow = {
  // "public": said on the site. "shared": said in a private chat with an agent,
  // and shared by the buyer to show (without their name) on the home's page.
  kind: "public" | "shared";
  id: string;
  body: string;
  at: Date;
  listing_key: string;
  address: string;
  name: string;
  accountId: string | null;
  isReply: boolean;
  total: number;
};

export async function listComments({
  q,
  listingKey,
  page = 1,
  limit = PAGE_SIZE,
}: {
  q?: string;
  listingKey?: string;
  page?: number;
  limit?: number | null;
}) {
  const { like } = searchTerms(q);
  const rows = await sql<CommentRow[]>`
    select x.*, (count(*) over ())::int as total from (
      select 'public' as kind, c.id, c.body, c.created_at as at, c.listing_key,
        l.data->>'UnparsedAddress' as address,
        coalesce(nullif(a.full_name, ''), v.first_name) as name, a.id as "accountId",
        (c.parent_id is not null or c.reply_to_visitor is not null) as "isReply"
      from public_comments c
      join visitors v on v.id = c.visitor_id
      left join accounts a on a.id = v.account_id
      join listings l on l.listing_key = c.listing_key
      union all
      select 'shared', c.id, c.body, c.created_at, c.listing_key,
        l.data->>'UnparsedAddress', p.first_name, null, false
      from comments c
      join participants p on p.id = c.participant_id
      join listings l on l.listing_key = c.listing_key
      where c.shared_publicly) x
    where (${listingKey ?? null}::text is null or x.listing_key = ${listingKey ?? null})
      and (${like}::text is null or x.body ilike ${like} or x.name ilike ${like} or x.address ilike ${like})
    order by x.at desc, x.id
    ${limit === null ? sql`` : sql`limit ${limit} offset ${pageOf(page)}`}`;
  return { rows, total: rows[0]?.total ?? 0 };
}

// --- Admins -----------------------------------------------------------------

export type AdminRow = { email: string; added_by: string; created_at: Date; accountId: string | null; name: string };

// Everyone the owner has made an admin, and whether they've signed in yet.
export async function listAdmins() {
  return sql<AdminRow[]>`
    select ad.email, ad.added_by, ad.created_at, a.id as "accountId", coalesce(a.full_name, '') as name
    from admins ad left join accounts a on a.email = ad.email
    order by ad.created_at`;
}
