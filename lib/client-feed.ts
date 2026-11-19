import { sql } from "./db";
import type { Listing } from "./listings/types";
import { photoUrl } from "./person-photo";
import { buildCards, dayOf, type CommentRow, type ProfileCard, type ReactionRow, type SpotRow } from "./profile";
import type { Sentiment } from "./reactions";
import { getHomeViews, homeViewKey } from "./shares";
import { ANONYMOUS_BUYER } from "./timeline";

// An agent's clients, on the links they sent, as each client's own page on
// the Dashboard shows them (and a stream of all of them would, were one shown):
// the same cards as someone's own page (one per home per day, the photo large,
// the spots they picked out, what they said), from what they did on the
// agent's links. For the agent only: passes and time spent are things a client
// tells their agent, never anyone else. Whatever is waiting on the agent comes
// first, however old and however many; the rest follows, newest first.

export type ClientCard = ProfileCard & {
  who: { participantId: string; shareId: string; name: string; photo: string | null; profileId: string | null };
  // Something they said on it that the agent hasn't answered yet.
  waiting: boolean;
  // What the agent has said in that home's conversation since, oldest first.
  replies: { body: string; at: string }[];
  // Time spent on the home, on that link, every visit together (a minute or more).
  seconds: number | null;
};

// How far back the cards go, and how many there are at most (not counting
// the ones waiting for an answer, which always show).
const DAYS = 14;
const CARDS = 30;
// However busy the clients are, each kind of thing is read at most this many times.
const READ_MOST = 600;

type Who = { participant_id: string; share_id: string };

// `participantIds`: one client (everyone they are on the agent's links), for
// their own page: everything they did, however long ago. `most`: how many
// cards at most, besides the ones waiting.
export async function getClientCards(
  agentId: string,
  opts: { participantIds?: string[]; most?: number } = {},
): Promise<ClientCard[]> {
  const ids = opts.participantIds;
  if (ids?.length === 0) return [];
  const since = `${DAYS} days`;
  const [reactions, likes, dislikes, comments, agentSaid] = await Promise.all([
    sql<(ReactionRow & Who)[]>`
      select r.participant_id, r.share_id, r.listing_key, r.reaction,
        coalesce(r.liked, '{}') as liked, coalesce(r.disliked, '{}') as disliked, r.updated_at as at
      from reactions r join shares s on s.id = r.share_id
      where s.agent_id = ${agentId}
        and ${ids ? sql`r.participant_id in ${sql(ids)}` : sql`r.updated_at > now() - ${since}::interval`}
      order by r.updated_at desc limit ${READ_MOST}`,
    sql<(SpotRow & Who)[]>`
      select pl.participant_id, pl.share_id, pl.listing_key, pl.media_key, pl.tag, pl.aspect, pl.created_at as at
      from photo_likes pl join shares s on s.id = pl.share_id
      where s.agent_id = ${agentId}
        and ${ids ? sql`pl.participant_id in ${sql(ids)}` : sql`pl.created_at > now() - ${since}::interval`}
      order by pl.created_at desc limit ${READ_MOST}`,
    sql<(SpotRow & Who)[]>`
      select pd.participant_id, pd.share_id, pd.listing_key, pd.media_key, pd.tag, pd.created_at as at
      from photo_dislikes pd join shares s on s.id = pd.share_id
      where s.agent_id = ${agentId}
        and ${ids ? sql`pd.participant_id in ${sql(ids)}` : sql`pd.created_at > now() - ${since}::interval`}
      order by pd.created_at desc limit ${READ_MOST}`,
    // Each with whether the agent has said anything in that home's thread since.
    sql<(CommentRow & Who & { answered: boolean })[]>`
      select c.participant_id, c.share_id, c.id, c.listing_key, c.body, c.created_at as at,
        coalesce(c.media_key, p.media_key) as media_key, coalesce(c.spot, p.spot) as spot,
        null::uuid as reply_to_id, null::text as reply_to_name, 0 as likes,
        (select count(*)::int from comments r where r.parent_id = c.id) as replies,
        exists (select 1 from comments x
          where x.share_id = c.share_id and x.listing_key = c.listing_key
            and x.agent_id is not null and x.created_at > c.created_at) as answered
      from comments c
      join shares s on s.id = c.share_id
      left join comments p on p.id = c.parent_id
      where s.agent_id = ${agentId} and c.participant_id is not null
        and ${ids ? sql`c.participant_id in ${sql(ids)}` : sql`c.created_at > now() - ${since}::interval`}
      order by c.created_at desc limit ${READ_MOST}`,
    // The agent's own words in their links' conversations, for under each card
    // (for one client: on the links they're on).
    sql<{ share_id: string; listing_key: string; body: string; at: Date; to: string | null }[]>`
      select c.share_id, c.listing_key, c.body, c.created_at as at, c.reply_to_participant as to
      from comments c join shares s on s.id = c.share_id
      where s.agent_id = ${agentId} and c.agent_id is not null
        and ${
          ids
            ? sql`c.share_id in (select p.share_id from participants p where p.id in ${sql(ids)})`
            : sql`c.created_at > now() - ${since}::interval`
        }
      order by c.created_at
      limit ${READ_MOST}`,
  ]);

  const all = [...reactions, ...likes, ...dislikes, ...comments];
  if (all.length === 0) return [];
  const people = [...new Set(all.map((row) => row.participant_id))];
  const keys = [...new Set(all.map((row) => row.listing_key))];
  const [participants, homes, standing, views] = await Promise.all([
    sql<{ id: string; share_id: string; first_name: string; profile: string | null; photo_v: string | null; agent: boolean }[]>`
      select p.id, p.share_id, p.first_name, v.id as profile, left(md5(acc.photo_data_url), 10) as photo_v,
        coalesce(p.account_id = s.agent_id, false) as agent
      from participants p
      join shares s on s.id = p.share_id
      left join visitors v on v.account_id = p.account_id
      left join accounts acc on acc.id = p.account_id
      where p.id in ${sql(people)}`,
    sql<{ listing_key: string; standard_status: string; data: Listing }[]>`
      select listing_key, standard_status, data from listings where listing_key in ${sql(keys)}`,
    // Their like or pass on each home as it stands now, whenever it was made.
    sql<{ participant_id: string; listing_key: string; reaction: Sentiment | null }[]>`
      select participant_id, listing_key, reaction from reactions
      where participant_id in ${sql(people)} and listing_key in ${sql(keys)}`,
    getHomeViews([...new Set(all.map((row) => row.share_id))]),
  ]);
  const listings = new Map(
    homes.map((row) => [
      row.listing_key,
      { ...row.data, StandardStatus: row.standard_status, Media: [...row.data.Media].sort((a, b) => a.Order - b.Order) },
    ]),
  );
  const answered = new Map(comments.map((c) => [c.id, c.answered]));

  const cards: ClientCard[] = [];
  for (const person of participants) {
    // (The agent on their own link isn't a client.)
    if (person.agent) continue;
    const theirs = <T extends Who>(rows: T[]) => rows.filter((row) => row.participant_id === person.id);
    const said = theirs(comments);
    // When each of their cards (a home, a day) started: the agent's words since are its replies.
    const startOf = new Map<string, Date>();
    for (const row of [...theirs(reactions), ...theirs(likes), ...theirs(dislikes), ...said]) {
      const key = `${row.listing_key}|${dayOf(row.at)}`;
      const was = startOf.get(key);
      if (!was || row.at < was) startOf.set(key, row.at);
    }
    const built = buildCards({
      reactions: theirs(reactions),
      likes: theirs(likes),
      dislikes: theirs(dislikes),
      comments: said,
      commentLikes: [],
      listings,
      standing: new Map(
        standing.flatMap((row) =>
          row.participant_id === person.id && row.reaction ? [[row.listing_key, row.reaction] as const] : [],
        ),
      ),
      floor: null,
      later: new Set(),
    });
    const who = {
      participantId: person.id,
      shareId: person.share_id,
      name: person.first_name.trim() || ANONYMOUS_BUYER,
      photo: person.profile ? photoUrl(person.profile, person.photo_v) : null,
      profileId: person.profile,
    };
    for (const card of built) {
      const seconds = views.get(homeViewKey(person.share_id, card.home.key))?.seconds ?? 0;
      const start = startOf.get(`${card.home.key}|${card.day}`) ?? new Date(card.at);
      // On their link, about this home, since this card began: to them, or to nobody in particular.
      const replies = agentSaid
        .filter(
          (c) =>
            c.share_id === person.share_id &&
            c.listing_key === card.home.key &&
            c.at >= start &&
            (c.to === null || c.to === person.id),
        )
        .slice(-3)
        .map((c) => ({ body: c.body, at: c.at.toISOString() }));
      cards.push({
        ...card,
        id: `${person.id}|${card.id}`,
        who,
        waiting: card.comments.some((comment) => answered.get(comment.id) === false),
        replies,
        seconds: seconds >= 60 ? seconds : null,
      });
    }
  }
  const newestFirst = (list: ClientCard[]) => list.sort((a, b) => b.at.localeCompare(a.at));
  return [
    ...newestFirst(cards.filter((card) => card.waiting)),
    ...newestFirst(cards.filter((card) => !card.waiting)).slice(0, opts.most ?? CARDS),
  ];
}
