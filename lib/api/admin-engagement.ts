import { z } from "zod";
import { firstName } from "../auth";
import { sql } from "../db";
import { checkAnchor, commentSchema, reactionSchema } from "../engagement";
import { findSpot } from "../public";
import { ApiError, isUuid } from "./http";

// What the owner's admin API (app/api/admin/v1) brings in from somewhere
// else: what people said about a home there, as the same public likes,
// passes, photo likes and comments a person leaves on its page here. Each
// person brought in is a visitor of their own, with a first name and no
// account (nobody signs in as them, nobody is emailed), told apart by
// device_token 'import:' + a reference the owner's tool chooses, so bringing
// the same person in twice finds them again. Deleting one takes everything
// they said with them, and nothing else.
//
// Only people brought in this way, and the owner themselves, can be written
// for here: never anyone who joined on their own.

export const IMPORTED = "import:";
const OWNER = "owner";

const REF_MOST = 80;
const NAME_MOST = 40;

const wrong = (field: string, message: string) => new ApiError(400, "invalid_request", message, field);
const NO_HOME = () => new ApiError(404, "not_found", "No home with that key.");
const NO_VISITOR = () =>
  new ApiError(404, "not_found", "No imported person with that id. Make them with POST /visitors first.");

export const importedVisitorSchema = z.strictObject({
  first_name: z
    .string()
    .transform((name) => name.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Give their first name.").max(NAME_MOST, `A name is up to ${NAME_MOST} characters.`)),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9._:-]+$/, "A ref is letters, digits, dots, dashes, underscores or colons.")
    .min(1)
    .max(REF_MOST),
});

export type ImportedVisitor = { id: string; first_name: string; ref: string; created_at: string };

const shaped = (row: { id: string; first_name: string; device_token: string; created_at: Date }): ImportedVisitor => ({
  id: row.id,
  first_name: row.first_name,
  ref: row.device_token.slice(IMPORTED.length),
  created_at: row.created_at.toISOString(),
});

// Made, or found again by its ref (taking the name it's given now).
export async function ensureImportedVisitor(input: z.infer<typeof importedVisitorSchema>) {
  const [row] = await sql<{ id: string; first_name: string; device_token: string; created_at: Date; made: boolean }[]>`
    insert into visitors (device_token, first_name)
    values (${IMPORTED + input.ref}, ${input.first_name})
    on conflict (device_token) do update set first_name = excluded.first_name
    returning id, first_name, device_token, created_at, (xmax = 0) as made`;
  return { visitor: shaped(row), made: row.made };
}

export async function listImportedVisitors(limit: number, offset: number) {
  const rows = await sql<{ id: string; first_name: string; device_token: string; created_at: Date }[]>`
    select id, first_name, device_token, created_at from visitors
    where device_token like ${IMPORTED + "%"}
    order by created_at, id
    limit ${limit} offset ${offset}`;
  const [{ total }] = await sql<{ total: number }[]>`
    select count(*)::int as total from visitors where device_token like ${IMPORTED + "%"}`;
  return { visitors: rows.map(shaped), total };
}

// Gone, with every like, pass and comment they were given (and replies to
// those): the database's cascades from visitors.
export async function deleteImportedVisitor(id: string) {
  if (!isUuid(id)) throw NO_VISITOR();
  const [gone] = await sql`
    delete from visitors where id = ${id} and device_token like ${IMPORTED + "%"} returning 1`;
  if (!gone) throw NO_VISITOR();
}

// Who a write is for: an imported person by id, or "owner" for the site
// owner's own public self (made the first time, as signing in would).
async function writer(who: string, owner: { id: string; full_name: string }): Promise<string> {
  if (who === OWNER) {
    await sql`
      insert into visitors (device_token, first_name, account_id)
      values (${`account:${owner.id}`}, ${firstName(owner)}, ${owner.id})
      on conflict (account_id) do nothing`;
    const [row] = await sql<{ id: string }[]>`select id from visitors where account_id = ${owner.id}`;
    return row.id;
  }
  if (!isUuid(who)) throw wrong("visitor", `Send an imported person's id, or "${OWNER}".`);
  const [row] = await sql<{ id: string }[]>`
    select id from visitors where id = ${who} and device_token like ${IMPORTED + "%"}`;
  if (!row) throw NO_VISITOR();
  return row.id;
}

// A home's key from the path, as it was given (encoded or not).
export function homeKeyOf(raw: string | undefined) {
  let key = raw ?? "";
  try {
    key = decodeURIComponent(key);
  } catch {
    // Already plain.
  }
  return key.trim();
}

async function home(key: string) {
  if (!key || key.length > 100) throw NO_HOME();
  const [row] = await sql`select 1 from listings where listing_key = ${key}`;
  if (!row) throw NO_HOME();
}

const visitorField = z.string().min(1).max(64);

// --- Whole-home like or pass ----------------------------------------------

export const importedReactionSchema = z.strictObject({
  visitor: visitorField,
  reaction: z.enum(["like", "dislike"]).nullable(),
  liked: z.array(z.string()).default([]),
  disliked: z.array(z.string()).default([]),
});

export async function setImportedReaction(
  key: string,
  body: z.infer<typeof importedReactionSchema>,
  owner: { id: string; full_name: string },
) {
  const state = reactionSchema.safeParse({ reaction: body.reaction, liked: body.liked, disliked: body.disliked });
  if (!state.success) {
    throw wrong(
      "liked",
      "Liked and disliked are from aesthetic, exterior, vibe, kitchen, bathrooms, layout, light, yard, location, price, never both at once, and only with a reaction.",
    );
  }
  await home(key);
  const visitor = await writer(body.visitor, owner);
  if (state.data.reaction === null) {
    await sql`delete from public_reactions where listing_key = ${key} and visitor_id = ${visitor}`;
  } else {
    await sql`
      insert into public_reactions (listing_key, visitor_id, reaction, liked, disliked)
      values (${key}, ${visitor}, ${state.data.reaction}, ${state.data.liked}::text[], ${state.data.disliked}::text[])
      on conflict (listing_key, visitor_id)
      do update set reaction = excluded.reaction, liked = excluded.liked,
        disliked = excluded.disliked, updated_at = now()`;
  }
  return { visitor, ...state.data };
}

// --- Like or dislike on a thing in a photo (or a fact) -------------------

export const importedPhotoReactionSchema = z.strictObject({
  visitor: visitorField,
  media_key: z.string().min(1).max(500),
  tag: z.string().min(1).max(60),
  reaction: z.enum(["like", "dislike"]).nullable(),
});

export async function setImportedPhotoReaction(
  key: string,
  body: z.infer<typeof importedPhotoReactionSchema>,
  owner: { id: string; full_name: string },
) {
  await home(key);
  const spot = await findSpot(key, body.media_key, body.tag);
  if (!spot) throw wrong("tag", "That isn't a photo of this home with that spot in it (or one of its facts).");
  const visitor = await writer(body.visitor, owner);
  const where = sql`listing_key = ${key} and visitor_id = ${visitor} and media_key = ${body.media_key} and tag = ${body.tag}`;
  await sql.begin(async (tx) => {
    if (body.reaction !== "like") await tx`delete from public_photo_likes where ${where}`;
    if (body.reaction !== "dislike") await tx`delete from public_photo_dislikes where ${where}`;
    if (body.reaction === "like") {
      await tx`
        insert into public_photo_likes (listing_key, visitor_id, media_key, tag, aspect)
        values (${key}, ${visitor}, ${body.media_key}, ${body.tag}, ${spot.aspect})
        on conflict do nothing`;
    } else if (body.reaction === "dislike") {
      await tx`
        insert into public_photo_dislikes (listing_key, visitor_id, media_key, tag)
        values (${key}, ${visitor}, ${body.media_key}, ${body.tag})
        on conflict do nothing`;
    }
  });
  return { visitor, media_key: body.media_key, tag: body.tag, reaction: body.reaction, aspect: spot.aspect };
}

// --- A comment, on the home, a spot in a photo, or under another ----------

const EARLIEST = Date.parse("2000-01-01T00:00:00Z");

export const importedCommentSchema = z.strictObject({
  visitor: visitorField,
  body: z.string(),
  media_key: z.string().min(1).max(500).optional(),
  spot: z.string().min(1).max(60).optional(),
  // A top-level comment's id, or "like:" and a person's visitor id to answer
  // their likes (or pass) on the home.
  parent: z.string().min(1).max(80).optional(),
  // When it was really said. Never later than now.
  at: z.iso.datetime({ offset: true }).optional(),
});

export async function addImportedComment(
  key: string,
  input: z.infer<typeof importedCommentSchema>,
  owner: { id: string; full_name: string },
) {
  const body = commentSchema.safeParse(input.body);
  if (!body.success) throw wrong("body", "A comment is 1 to 1,000 characters.");
  if ((input.media_key === undefined) !== (input.spot === undefined)) {
    throw wrong("spot", "A comment about a photo sends both media_key and spot.");
  }
  if (input.parent !== undefined && input.media_key !== undefined) {
    throw wrong("spot", "A reply is about what it answers: leave media_key and spot off.");
  }
  let at: Date | null = null;
  if (input.at !== undefined) {
    at = new Date(input.at);
    if (at.getTime() < EARLIEST || at.getTime() > Date.now() + 60_000) throw wrong("at", "That isn't a time it could have been said.");
  }
  await home(key);
  const anchor =
    input.media_key === undefined ? null : await checkAnchor(key, { mediaKey: input.media_key, tag: input.spot });
  if (anchor === false) throw wrong("spot", "That isn't a photo of this home with that spot in it (or one of its facts).");

  let parent: string | null = null;
  let replyTo: string | null = null;
  if (input.parent !== undefined) {
    if (input.parent.startsWith("like:")) {
      const who = input.parent.slice(5);
      const [liked] = isUuid(who)
        ? await sql`
            select 1 from public_reactions where listing_key = ${key} and visitor_id = ${who}::uuid
            union all
            select 1 from public_photo_likes where listing_key = ${key} and visitor_id = ${who}::uuid
            union all
            select 1 from public_photo_dislikes where listing_key = ${key} and visitor_id = ${who}::uuid
            limit 1`
        : [];
      if (!liked) throw wrong("parent", "That person hasn't liked or passed on this home.");
      replyTo = who;
    } else {
      const [found] = isUuid(input.parent)
        ? await sql`
            select 1 from public_comments
            where id = ${input.parent}::uuid and listing_key = ${key} and parent_id is null and reply_to_visitor is null`
        : [];
      if (!found) throw wrong("parent", "No comment on this home with that id to answer.");
      parent = input.parent;
    }
  }

  const visitor = await writer(input.visitor, owner);
  const [row] = await sql<{ id: string; created_at: Date }[]>`
    insert into public_comments (listing_key, visitor_id, body, parent_id, reply_to_visitor, media_key, spot, created_at)
    values (${key}, ${visitor}, ${body.data}, ${parent}::uuid, ${replyTo}::uuid,
      ${anchor ? anchor.mediaKey : null}, ${anchor ? anchor.tag : null}, coalesce(${at}::timestamptz, now()))
    returning id, created_at`;
  return {
    id: row.id,
    visitor,
    body: body.data,
    media_key: anchor ? anchor.mediaKey : null,
    spot: anchor ? anchor.tag : null,
    parent: input.parent ?? null,
    created_at: row.created_at.toISOString(),
  };
}

// --- The demo's sample data, gone ------------------------------------------

// What scripts/seed-demo.ts puts in (its clearDemo, but for its accounts:
// those go one by one through DELETE /accounts/{id}, which keeps what's on
// other people's links), and the sample homes the listing source fills in
// (lib/listings/sample.ts), each once nothing points at it any more: one on
// a link stays, and is counted. Only these fixed patterns, never anything
// else. scripts/db-setup.ts syncs the sample homes again when it's run.
export const DEMO_DOMAIN = "@demo.buyboxsocial.test";
const DEMO_DEVICE = "demo:";
const SAMPLE_PREFIX = "SAMPLE-";

export async function clearSampleData() {
  return sql.begin(async (tx) => {
    const [{ accounts }] = await tx<{ accounts: number }[]>`
      select count(*)::int as accounts from accounts where email like ${"%" + DEMO_DOMAIN}`;
    const visitors = await tx`delete from visitors where device_token like ${DEMO_DEVICE + "%"} returning 1`;
    const views = await tx`delete from listing_views where device_token like ${DEMO_DEVICE + "%"} returning 1`;
    const signups = await tx`delete from signups where email like ${"%" + DEMO_DOMAIN} returning 1`;
    const intents = await tx`delete from account_intents where email like ${"%" + DEMO_DOMAIN} returning 1`;
    const homes = await tx`
      delete from listings l
      where l.listing_key like ${SAMPLE_PREFIX + "%"} and l.owner_account_id is null
        and not exists (select 1 from share_listings sl where sl.listing_key = l.listing_key)
      returning 1`;
    const [{ kept }] = await tx<{ kept: number }[]>`
      select count(*)::int as kept from listings where listing_key like ${SAMPLE_PREFIX + "%"} and owner_account_id is null`;
    return {
      cleared: {
        visitors: visitors.length,
        views: views.length,
        signups: signups.length,
        intents: intents.length,
        sample_homes: homes.length,
      },
      left: { demo_accounts: accounts, sample_homes_on_links: kept },
    };
  });
}

// --- A link, gone --------------------------------------------------------

// Any agent's link (shares), with everyone on it and what they did there
// (the database's cascades from shares). `agent` must be who sent it.
export async function deleteAnyLink(id: string, agent: string | null): Promise<string> {
  const none = () => new ApiError(404, "not_found", "No link with that id sent by that agent.");
  if (!isUuid(agent)) throw wrong("agent", "Send the id of the agent who sent it as ?agent=.");
  if (!isUuid(id)) throw none();
  const [gone] = await sql<{ agent_id: string }[]>`
    delete from shares where id = ${id} and agent_id = ${agent} returning agent_id`;
  if (!gone) throw none();
  return gone.agent_id;
}
