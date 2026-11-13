import { sql } from "./db";
import { photoUrl } from "./person-photo";

// "Needs you", at the top of an agent's home: the few things a client is
// waiting on them for, most pressing first. Someone asked to see a home and
// hasn't heard back; someone said something and the agent hasn't answered;
// a link that's sat unopened for two days. Each clears itself once the agent
// answers in that home's conversation (or the link is opened), so the list is
// always what's left to do. Only ever from this agent's own links, and only
// first names.

export type NeedsKind = "showing" | "question" | "unopened";

export type NeedsItem = {
  // Stable for this one thing: a new question in the same conversation is a
  // new item, so "Done" on the old one doesn't hide it.
  id: string;
  kind: NeedsKind;
  at: string;
  shareId: string;
  // Who: "Jenny", "Ben & Nina", or the link's name when nobody's named on it.
  name: string;
  people: number;
  // Their own photo, where they've added one.
  photo: string | null;
  participantId: string | null;
  // The home it's about (a link not opened: its first home).
  home: { key: string; address: string; photo: string | null } | null;
  // What they said, as they wrote it.
  quote: string | null;
  commentId: string | null;
  // A link not opened: how many homes are on it, and the path to send them again.
  homes: number;
  nudgePath: string | null;
  // Where a tap on the row goes.
  href: string;
};

// How many rows the list shows; and how far back a question still waits.
export const NEEDS_SHOWN = 5;
const QUESTION_DAYS = 14;
// A link counts as not opened after two days, and stops nagging after a month.
const UNOPENED_AFTER = "48 hours";
const UNOPENED_UNTIL = "30 days";
// The most of each kind read.
const READ_MOST = 20;

const RANK: Record<NeedsKind, number> = { showing: 0, question: 1, unopened: 2 };

// "Ben & Nina"; "Ben, Nina & Lee".
export const namesOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;

const clientReel = (participantId: string, key: string, commentId?: string | null) =>
  `/reel?${new URLSearchParams({ from: `client:${participantId}`, home: key, ...(commentId && { comment: commentId }) })}`;

type PersonCols = { participant_id: string; first_name: string; profile: string | null; photo_v: string | null };
type HomeCols = { listing_key: string; address: string; home_photo: string | null };

// Everything waiting on this agent, most pressing first, then the newest of
// each kind: `most` of them, and how many more there are.
export async function getNeedsYou(agentId: string, most = NEEDS_SHOWN): Promise<{ items: NeedsItem[]; more: number }> {
  const [showings, questions, unopened] = await Promise.all([
    // Asked to see a home, and no word from the agent on that home since.
    // (Asking posts its own comment at the same moment; anything else they
    // said that day is the quote.)
    sql<(PersonCols & HomeCols & { share_id: string; asked_at: Date; said: { id: string; body: string } | null })[]>`
      select a.share_id, a.participant_id, a.listing_key, a.asked_at, p.first_name,
        pv.id as profile, left(md5(acc.photo_data_url), 10) as photo_v,
        l.data->>'UnparsedAddress' as address, l.data->'Media'->0->>'MediaURL' as home_photo,
        (select json_build_object('id', c.id, 'body', c.body) from comments c
          where c.share_id = a.share_id and c.listing_key = a.listing_key and c.participant_id = a.participant_id
            and c.created_at <> a.asked_at and c.created_at > a.asked_at - interval '1 day'
          order by c.created_at desc limit 1) as said
      from share_asks a
      join shares s on s.id = a.share_id
      join share_listings sl on sl.share_id = a.share_id and sl.listing_key = a.listing_key and sl.removed_at is null
      join participants p on p.id = a.participant_id
      left join visitors pv on pv.account_id = p.account_id
      left join accounts acc on acc.id = p.account_id
      join listings l on l.listing_key = a.listing_key
      where s.agent_id = ${agentId}
        and not exists (
          select 1 from comments x
          where x.share_id = a.share_id and x.listing_key = a.listing_key
            and x.agent_id is not null and x.created_at > a.asked_at)
      order by a.asked_at desc
      limit ${READ_MOST}`,
    // The newest thing a client said in each home's conversation lately,
    // where the agent hasn't said anything after it.
    sql<(PersonCols & HomeCols & { id: string; share_id: string; body: string; at: Date })[]>`
      select q.* from (
        select distinct on (c.share_id, c.listing_key)
          c.id, c.share_id, c.listing_key, c.participant_id, c.body, c.created_at as at, p.first_name,
          pv.id as profile, left(md5(acc.photo_data_url), 10) as photo_v,
          l.data->>'UnparsedAddress' as address, l.data->'Media'->0->>'MediaURL' as home_photo
        from comments c
        join shares s on s.id = c.share_id
        join share_listings sl on sl.share_id = c.share_id and sl.listing_key = c.listing_key and sl.removed_at is null
        join participants p on p.id = c.participant_id
        left join visitors pv on pv.account_id = p.account_id
        left join accounts acc on acc.id = p.account_id
        join listings l on l.listing_key = c.listing_key
        where s.agent_id = ${agentId} and c.participant_id is not null
          and c.created_at > now() - ${`${QUESTION_DAYS} days`}::interval
        order by c.share_id, c.listing_key, c.created_at desc
      ) q
      where not exists (
        select 1 from comments x
        where x.share_id = q.share_id and x.listing_key = q.listing_key
          and x.agent_id is not null and x.created_at > q.at)
      order by q.at desc
      limit ${READ_MOST}`,
    // Links sent a while ago that nobody has opened, or done anything on.
    sql<
      {
        id: string;
        token: string;
        client_name: string;
        created_at: Date;
        homes: number;
        first: { key: string; address: string; photo: string | null } | null;
        people: { id: string; name: string; token: string | null; profile: string | null; photo_v: string | null }[];
      }[]
    >`
      select s.id, s.token, s.client_name, s.created_at,
        (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
        (select json_build_object('key', l.listing_key, 'address', l.data->>'UnparsedAddress',
            'photo', l.data->'Media'->0->>'MediaURL')
          from share_listings sl join listings l on l.listing_key = sl.listing_key
          where sl.share_id = s.id and sl.removed_at is null
          order by sl.position limit 1) as first,
        (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.first_name, 'token', p.token,
            'profile', pv.id, 'photo_v', left(md5(acc.photo_data_url), 10)) order by p.created_at), '[]')
          from participants p
          left join visitors pv on pv.account_id = p.account_id
          left join accounts acc on acc.id = p.account_id
          where p.share_id = s.id) as people
      from shares s
      where s.agent_id = ${agentId}
        and s.created_at < now() - ${UNOPENED_AFTER}::interval
        and s.created_at > now() - ${UNOPENED_UNTIL}::interval
        and not exists (select 1 from share_opens o where o.share_id = s.id)
        and not exists (select 1 from reactions r where r.share_id = s.id)
        and not exists (select 1 from comments c where c.share_id = s.id and c.participant_id is not null)
        and exists (select 1 from share_listings sl where sl.share_id = s.id and sl.removed_at is null)
      order by s.created_at desc
      limit ${READ_MOST}`,
  ]);

  const face = (row: { profile: string | null; photo_v: string | null }) =>
    row.profile ? photoUrl(row.profile, row.photo_v) : null;
  const home = (row: HomeCols) => ({ key: row.listing_key, address: row.address, photo: row.home_photo });

  const items: NeedsItem[] = [
    ...showings.map(
      (row): NeedsItem => ({
        id: `showing:${row.participant_id}:${row.listing_key}:${row.asked_at.toISOString()}`,
        kind: "showing",
        at: row.asked_at.toISOString(),
        shareId: row.share_id,
        name: row.first_name,
        people: 1,
        photo: face(row),
        participantId: row.participant_id,
        home: home(row),
        quote: row.said?.body ?? null,
        commentId: row.said?.id ?? null,
        homes: 0,
        nudgePath: null,
        href: clientReel(row.participant_id, row.listing_key),
      }),
    ),
    // A conversation with a showing waiting is that row, not a second one.
    ...questions
      .filter((row) => !showings.some((ask) => ask.share_id === row.share_id && ask.listing_key === row.listing_key))
      .map(
        (row): NeedsItem => ({
          id: `question:${row.id}`,
          kind: "question",
          at: row.at.toISOString(),
          shareId: row.share_id,
          name: row.first_name,
          people: 1,
          photo: face(row),
          participantId: row.participant_id,
          home: home(row),
          quote: row.body,
          commentId: row.id,
          homes: 0,
          nudgePath: null,
          href: clientReel(row.participant_id, row.listing_key, row.id),
        }),
      ),
    ...unopened.map((row): NeedsItem => {
      const named = row.people.filter((person) => person.name.trim());
      const one = named.length === 1 ? named[0] : null;
      return {
        id: `unopened:${row.id}`,
        kind: "unopened",
        at: row.created_at.toISOString(),
        shareId: row.id,
        name:
          namesOf(named.map((person) => person.name.trim())) ||
          row.client_name.trim() ||
          (row.first ? `Link for ${row.first.address}` : "Your link"),
        people: named.length,
        photo: one ? face(one) : null,
        participantId: one?.id ?? null,
        home: row.first,
        quote: null,
        commentId: null,
        homes: row.homes,
        // Their own link when it's for one person, so it opens as them.
        nudgePath: `/s/${one?.token ?? row.token}`,
        href: `/dashboard/shares/${row.id}`,
      };
    }),
  ].sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.at.localeCompare(a.at));

  return { items: items.slice(0, most), more: Math.max(0, items.length - most) };
}
