import { sql } from "./db";
import type { Listing } from "./listings/types";
import { photoUrl } from "./person-photo";
import { FACTS, mediaKeyOf, thingOf } from "./photos";
import { dayOf } from "./profile";
import { getHomeViews, homeViewKey } from "./shares";

// An agent's clients, on the links they sent, as the agent's home shows them:
// one card per person per day, with every home they reacted to that day in a
// strip (the ones they liked first), the newest thing they said, and how long
// they spent. For the agent only: passes and time spent are things a client
// tells their agent, never anyone else.

export type ClientDayHome = {
  key: string;
  address: string;
  // The photo it's about: the newest spot they liked in it, else the first.
  photo: string | null;
  index: number;
  verdict: "like" | "pass" | null;
  // The thing they liked in it, in small words ("porch"), when it has a name.
  spotTag: string | null;
};

export type ClientDay = {
  id: string;
  day: string;
  at: string;
  participantId: string;
  shareId: string;
  name: string;
  photo: string | null;
  homes: ClientDayHome[];
  liked: number;
  passed: number;
  comments: number;
  // The newest thing they said that day, and whether the agent has answered it since.
  quote: { body: string; listingKey: string; address: string; commentId: string; answered: boolean } | null;
  // Time spent on that day's homes, on that link (every visit together).
  seconds: number | null;
};

// How far back the cards go, and how many there are at most.
export const CLIENT_DAYS = 14;
export const CLIENT_CARDS = 30;
// The most things read.
const READ_MOST = 600;

type Event = {
  kind: "reaction" | "like" | "dislike" | "comment";
  share_id: string;
  participant_id: string;
  listing_key: string;
  at: Date;
  media_key: string | null;
  tag: string | null;
  comment_id: string | null;
  body: string | null;
  answered: boolean;
};

// The photo a home is shown by: the one with `mediaKey` in it, else the first.
function photoAt(listing: Listing, mediaKey: string | null) {
  const media = [...(listing.Media ?? [])].sort((a, b) => a.Order - b.Order);
  let index = mediaKey ? media.findIndex((m) => mediaKeyOf(m) === mediaKey) : 0;
  if (index < 0) index = 0;
  return { photo: media[index]?.MediaURL ?? null, index, media: media[index] };
}

// Each of this agent's clients' days, newest first.
export async function getClientDays(agentId: string): Promise<ClientDay[]> {
  const events = await sql<Event[]>`
    with mine as (select id from shares where agent_id = ${agentId})
    select * from (
      select 'reaction' as kind, r.share_id, r.participant_id, r.listing_key, r.updated_at as at,
        null::text as media_key, null::text as tag, null::uuid as comment_id, null::text as body, false as answered
      from reactions r where r.share_id in (select id from mine)
      union all
      select 'like', pl.share_id, pl.participant_id, pl.listing_key, pl.created_at, pl.media_key, pl.tag, null, null, false
      from photo_likes pl where pl.share_id in (select id from mine)
      union all
      select 'dislike', pd.share_id, pd.participant_id, pd.listing_key, pd.created_at, pd.media_key, pd.tag, null, null, false
      from photo_dislikes pd where pd.share_id in (select id from mine)
      union all
      select 'comment', c.share_id, c.participant_id, c.listing_key, c.created_at, c.media_key, null, c.id, c.body,
        exists (select 1 from comments x
          where x.share_id = c.share_id and x.listing_key = c.listing_key
            and x.agent_id is not null and x.created_at > c.created_at)
      from comments c where c.share_id in (select id from mine) and c.participant_id is not null
    ) e
    where e.at > now() - ${`${CLIENT_DAYS} days`}::interval
    order by e.at desc
    limit ${READ_MOST}`;
  if (events.length === 0) return [];

  const people = [...new Set(events.map((e) => e.participant_id))];
  const keys = [...new Set(events.map((e) => e.listing_key))];
  const [participants, listings, reactions, views] = await Promise.all([
    sql<{ id: string; first_name: string; profile: string | null; photo_v: string | null }[]>`
      select p.id, p.first_name, pv.id as profile, left(md5(acc.photo_data_url), 10) as photo_v
      from participants p
      left join visitors pv on pv.account_id = p.account_id
      left join accounts acc on acc.id = p.account_id
      where p.id in ${sql(people)}`,
    sql<{ data: Listing }[]>`select data from listings where listing_key in ${sql(keys)}`,
    // Their like or pass on each home as it stands now, whenever it was made.
    sql<{ participant_id: string; listing_key: string; reaction: "like" | "dislike" | null }[]>`
      select participant_id, listing_key, reaction from reactions
      where participant_id in ${sql(people)} and listing_key in ${sql(keys)}`,
    getHomeViews([...new Set(events.map((e) => e.share_id))]),
  ]);
  const personOf = new Map(participants.map((p) => [p.id, p]));
  const listingOf = new Map(listings.map((row) => [row.data.ListingKey, row.data]));
  const standing = new Map(reactions.map((r) => [`${r.participant_id}|${r.listing_key}`, r.reaction]));

  type Home = { key: string; spotLike: { media: string; tag: string } | null; spotPass: boolean };
  type Day = {
    id: string;
    day: string;
    at: Date;
    participantId: string;
    shareId: string;
    homes: Map<string, Home>;
    comments: Event[];
  };
  const days = new Map<string, Day>();
  // Newest first, so the first of anything seen is its newest.
  for (const e of events) {
    if (!personOf.has(e.participant_id) || !listingOf.has(e.listing_key)) continue;
    const day = dayOf(e.at);
    const id = `${e.participant_id}|${day}`;
    const entry = days.get(id) ?? {
      id,
      day,
      at: e.at,
      participantId: e.participant_id,
      shareId: e.share_id,
      homes: new Map<string, Home>(),
      comments: [],
    };
    days.set(id, entry);
    const home = entry.homes.get(e.listing_key) ?? { key: e.listing_key, spotLike: null, spotPass: false };
    entry.homes.set(e.listing_key, home);
    if (e.kind === "like" && !home.spotLike && e.media_key && e.tag) home.spotLike = { media: e.media_key, tag: e.tag };
    if (e.kind === "dislike") home.spotPass = true;
    if (e.kind === "comment") entry.comments.push(e);
  }

  const RANK = { like: 0, null: 1, pass: 2 } as const;
  return [...days.values()]
    .sort((a, b) => +b.at - +a.at)
    .slice(0, CLIENT_CARDS)
    .map((d): ClientDay => {
      const person = personOf.get(d.participantId)!;
      // (Already newest first: a stable sort keeps that within each verdict.)
      const homes = [...d.homes.values()]
        .map((home): ClientDayHome => {
          const listing = listingOf.get(home.key)!;
          const reaction = standing.get(`${d.participantId}|${home.key}`) ?? null;
          const verdict =
            reaction === "like" ? "like" : reaction === "dislike" ? "pass" : home.spotLike ? "like" : home.spotPass ? "pass" : null;
          const spot = home.spotLike && home.spotLike.media !== FACTS ? home.spotLike : null;
          const shown = photoAt(listing, spot?.media ?? null);
          const thing = spot && shown.media ? thingOf(shown.media, spot.tag) : null;
          return {
            key: home.key,
            address: listing.UnparsedAddress,
            photo: shown.photo,
            index: shown.index,
            verdict,
            spotTag: verdict === "like" && thing ? thing.toLowerCase() : null,
          };
        })
        .sort((a, b) => RANK[a.verdict ?? "null"] - RANK[b.verdict ?? "null"]);
      const said = d.comments[0];
      const seconds = homes.reduce((sum, home) => sum + (views.get(homeViewKey(d.shareId, home.key))?.seconds ?? 0), 0);
      return {
        id: d.id,
        day: d.day,
        at: d.at.toISOString(),
        participantId: d.participantId,
        shareId: d.shareId,
        name: person.first_name.trim() || "Your client",
        photo: person.profile ? photoUrl(person.profile, person.photo_v) : null,
        homes,
        liked: homes.filter((home) => home.verdict === "like").length,
        passed: homes.filter((home) => home.verdict === "pass").length,
        comments: d.comments.length,
        quote:
          said && said.comment_id && said.body
            ? {
                body: said.body,
                listingKey: said.listing_key,
                address: listingOf.get(said.listing_key)!.UnparsedAddress,
                commentId: said.comment_id,
                answered: said.answered,
              }
            : null,
        seconds: seconds >= 60 ? seconds : null,
      };
    });
}
