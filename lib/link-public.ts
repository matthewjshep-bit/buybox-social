import { sql } from "./db";
import { ensureLinkProfile } from "./shares";

// What someone likes and says on an agent's link is public by default, under
// their first name, as if they'd done it on the home's own page: so it can be
// answered, hearted and followed, and it counts toward Popular people. It's
// done with a public copy (a normal public_comments or public_reactions row);
// the link's own row stays, for the agent and the conversation there, and is
// marked as having one, so nothing anywhere counts it twice.
//
// Never public: a pass (or anything said on a home they passed on), a reply in
// the conversation on the link, a message to the agent, "ask to see it", and
// anything at all once they switch it off (Edit profile, "Share my likes and
// comments on homes I'm sent"), which also takes down what was copied.

// Their public self, for someone on a link: the profile of the account they're
// on it by. Null when they aren't on it by an account (they have no page), when
// it's the agent's own link, or when they have no first name to show.
async function publicSelf(participantId: string) {
  const [person] = await sql<{ account_id: string | null; own: boolean }[]>`
    select p.account_id, s.agent_id = p.account_id as own
    from participants p join shares s on s.id = p.share_id
    where p.id = ${participantId}`;
  if (!person?.account_id || person.own) return null;
  await ensureLinkProfile(person.account_id);
  const [visitor] = await sql<{ id: string; first_name: string; hide_links: boolean }[]>`
    select id, first_name, hide_links from visitors where account_id = ${person.account_id}`;
  if (!visitor || !visitor.first_name.trim()) return null;
  return { visitorId: visitor.id, accountId: person.account_id, hidden: visitor.hide_links };
}

// Public talk is on homes still for sale and an agent's own deals they still
// show (as on the home's own page, app/homes/actions.ts).
async function takesPublicTalk(listingKey: string) {
  const [listing] = await sql`
    select 1 from listings where listing_key = ${listingKey}
      and (standard_status = 'Active'
        or (owner_account_id is not null and standard_status = 'Closed'
            and coalesce((data->>'Hidden')::boolean, false) = false))`;
  return Boolean(listing);
}

const passedOn = async (participantId: string, listingKey: string) => {
  const [row] = await sql`
    select 1 from reactions
    where participant_id = ${participantId} and listing_key = ${listingKey} and reaction = 'dislike'`;
  return Boolean(row);
};

// Where what they say about this home goes unless they pick otherwise: public,
// unless they've switched that off or passed on the home. For the composer.
export async function publicByDefault(participantId: string, listingKey: string): Promise<boolean> {
  const self = await publicSelf(participantId);
  return Boolean(self && !self.hidden && !(await passedOn(participantId, listingKey)));
}

// Makes a comment of theirs on a link public: only their own words about the
// home (not a reply on the link), never on a home they passed on. `chosen`:
// they asked for this one ("Make public"), so it goes even with the switch off.
// True when it's public now.
export async function copyComment(commentId: string, chosen = false): Promise<boolean> {
  const [comment] = await sql<
    {
      participant_id: string | null;
      listing_key: string;
      public_comment_id: string | null;
      reply: boolean;
      ask: boolean;
    }[]
  >`
    select c.participant_id, c.listing_key, c.public_comment_id,
      (c.parent_id is not null or c.reply_to_participant is not null) as reply,
      exists (select 1 from share_asks k
        where k.participant_id = c.participant_id and k.listing_key = c.listing_key
          and k.asked_at = c.created_at) as ask
    from comments c where c.id = ${commentId}`;
  if (!comment?.participant_id || comment.reply || comment.ask) return false;
  if (comment.public_comment_id) return true;
  const self = await publicSelf(comment.participant_id);
  if (!self || (self.hidden && !chosen)) return false;
  if (await passedOn(comment.participant_id, comment.listing_key)) return false;
  if (!(await takesPublicTalk(comment.listing_key))) return false;
  await sql.begin(async (tx) => {
    const [copy] = await tx<{ id: string }[]>`
      insert into public_comments (listing_key, visitor_id, body, media_key, spot, created_at)
      select c.listing_key, ${self.visitorId}, c.body, c.media_key, c.spot, c.created_at
      from comments c where c.id = ${commentId}
      returning id`;
    // (An old anonymous share becomes this: one public copy, by name.)
    await tx`update comments set public_comment_id = ${copy.id}, shared_publicly = false where id = ${commentId}`;
  });
  return true;
}

// Takes a comment's public copy down (and any public replies under it), or
// an old anonymous share off the home's page. It stays on the link.
export async function uncopyComment(commentId: string) {
  await sql.begin(async (tx) => {
    await tx`
      delete from public_comments
      where id = (select public_comment_id from comments where id = ${commentId})`;
    await tx`update comments set shared_publicly = false, public_comment_id = null where id = ${commentId}`;
  });
}

// Their like on a link, in public too, by name, with the things they liked
// about it (never what they didn't). A like they gave on the home's own page
// is theirs to change there: it's left as it is.
export async function copyLike(participantId: string, shareId: string, listingKey: string, liked: string[]) {
  const self = await publicSelf(participantId);
  if (!self || self.hidden) return;
  if (!(await takesPublicTalk(listingKey))) return;
  const [copy] = await sql`
    insert into public_reactions (listing_key, visitor_id, reaction, liked, disliked, share_id)
    values (${listingKey}, ${self.visitorId}, 'like', ${liked}::text[], '{}', ${shareId})
    on conflict (listing_key, visitor_id)
    do update set reaction = 'like', liked = excluded.liked, disliked = '{}', updated_at = now()
    where public_reactions.share_id is not null
    returning 1`;
  if (!copy) return;
  await sql`
    update reactions set public_copy = true
    where share_id = ${shareId} and listing_key = ${listingKey} and participant_id = ${participantId}`;
}

// Their like on a link is gone (a pass, or taken back): so is its public copy,
// unless the same home is liked on another link of theirs, which keeps it.
export async function uncopyLike(participantId: string, shareId: string, listingKey: string) {
  const [person] = await sql<{ account_id: string | null }[]>`
    select account_id from participants where id = ${participantId}`;
  await sql`
    update reactions set public_copy = false
    where share_id = ${shareId} and listing_key = ${listingKey} and participant_id = ${participantId}`;
  if (!person?.account_id) return;
  const [other] = await sql<{ share_id: string; liked: string[] }[]>`
    select r.share_id, r.liked from reactions r join participants p on p.id = r.participant_id
    where p.account_id = ${person.account_id} and r.listing_key = ${listingKey}
      and r.reaction = 'like' and r.public_copy
    limit 1`;
  if (other) {
    await sql`
      update public_reactions pr set share_id = ${other.share_id}, liked = ${other.liked}::text[], updated_at = now()
      from visitors v
      where v.id = pr.visitor_id and v.account_id = ${person.account_id}
        and pr.listing_key = ${listingKey} and pr.share_id is not null`;
    return;
  }
  await sql`
    delete from public_reactions pr using visitors v
    where v.id = pr.visitor_id and v.account_id = ${person.account_id}
      and pr.listing_key = ${listingKey} and pr.share_id is not null`;
}

// They changed their like or pass on the home's own page: from then on it's
// theirs there, not a copy, and their likes on links count on their own again.
export async function ownedInPublic(visitorId: string, listingKey: string) {
  await sql`
    update public_reactions set share_id = null
    where visitor_id = ${visitorId} and listing_key = ${listingKey} and share_id is not null`;
  await sql`
    update reactions r set public_copy = false
    from participants p, visitors v
    where p.id = r.participant_id and v.account_id = p.account_id and v.id = ${visitorId}
      and r.listing_key = ${listingKey} and r.public_copy`;
}

// They switched it off: everything copied from their links comes down (the
// public replies under their comments with it). What's on the links stays.
export async function uncopyAll(accountId: string) {
  await sql.begin(async (tx) => {
    await tx`
      delete from public_comments where id in (
        select c.public_comment_id from comments c join participants p on p.id = c.participant_id
        where p.account_id = ${accountId} and c.public_comment_id is not null)`;
    await tx`
      delete from public_reactions pr using visitors v
      where v.id = pr.visitor_id and v.account_id = ${accountId} and pr.share_id is not null`;
    await tx`
      update reactions r set public_copy = false from participants p
      where p.id = r.participant_id and p.account_id = ${accountId} and r.public_copy`;
  });
}

// Who did something on a link (a row of `table` with participant_id), for
// counting people once each: their public profile, when they're on the link
// by an account that has one (so their like copied to the home's page, or
// given there, and a like in a photo on the link, count as one person), else
// their place on the link. Only ever counted, never shown.
export const linkWho = (alias: string) => sql`
  coalesce(
    'v' || (select v.id from participants p join visitors v on v.account_id = p.account_id
            where p.id = ${sql(alias)}.participant_id),
    'p' || ${sql(alias)}.participant_id)`;
