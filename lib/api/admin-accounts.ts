import type postgres from "postgres";
import { z } from "zod";
import { INVITED_PREFIX, SUPER_ADMIN_EMAIL, type Account } from "../auth";
import { getClientBook } from "../clients";
import { sql } from "../db";
import { BRAND_COLORS, appUrl, escapeLike } from "../format";
import { getFollowCounts } from "../follows";
import { STORED_VIDEO } from "../own-listing-writes";
import { bannerUrl } from "../banner";
import { photoUrl } from "../person-photo";
import { getProfileSummary } from "../profile";
import {
  aboutLink,
  AGENT_NAME_MOST,
  BANNER_IMAGE_MOST_CHARS,
  BANNER_SOURCE_MOST_CHARS,
  BIO_MOST,
  BROKERAGE_MOST,
  BUYER_NAME_MOST,
  contactEmailSchema,
  contactPhoneSchema,
  isBrandColor,
  isDuplicate,
  linkUrl,
  LINKS_MOST,
  mlsAgentIdProblem,
  PROFILE_PHOTO_MOST_CHARS,
} from "../profile-fields";
import { isProKind, KINDS, type Kind } from "../kinds";
import { parsePlace, placeLabel } from "../places";
import { ensureAccountVisitor } from "../public";
import { ApiError, isUuid } from "./http";
import { jpegWithin, photoBytes, photoPixels, photoSchema } from "./photos";

// Every account on the site, as the owner's admin API (app/api/admin/v1)
// reads, makes, changes and deletes them. Each part of a profile is checked
// the way the pages where people change their own check it
// (lib/profile-fields.ts), and photos are made the way those pages make
// them. Nothing here ever emails anyone.
//
// An account made here hasn't been signed in to: its auth_user_id is
// 'invited:' + its email, and whoever first signs in with that email (which
// proves the inbox is theirs) takes it over as it is (lib/auth.ts accountFor).
// Its email can be changed until then, and the invitation moves with it.
// Once someone has signed in, signing in stays with them (their auth_user_id)
// whatever the email here says: a changed email is where the site writes to
// them and how they're found, not how they sign in.

// ---------------------------------------------------------------------------
// Reading

type Row = {
  id: string;
  auth_user_id: string;
  email: string;
  role: "agent" | "buyer" | null;
  kind: Kind | null;
  location_city: string;
  location_state: string;
  full_name: string;
  phone: string;
  brokerage: string;
  mls_agent_id: string;
  contact_phone: string;
  contact_email: string;
  bio: string;
  profile_links: unknown;
  brand_color: string;
  created_at: Date;
  photo_v: string | null;
  banner: string;
  banner_v: string | null;
  profile_id: string | null;
};

const columns = sql`
  a.id, a.auth_user_id, a.email, a.role, a.kind, a.location_city, a.location_state, a.full_name, a.phone, a.brokerage, a.mls_agent_id,
  a.contact_phone, a.contact_email, a.bio, a.profile_links, a.brand_color, a.created_at, a.banner,
  left(md5(a.photo_data_url), 10) as photo_v, left(md5(a.banner_data_url), 10) as banner_v,
  v.id as profile_id`;

const linksOf = (value: unknown): { label: string; url: string }[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string"
          ? [{ label: String((item as { label?: unknown }).label ?? ""), url: (item as { url: string }).url }]
          : [],
      )
    : [];

const absolute = (path: string | null) => (path ? `${appUrl()}${path}` : null);

export const isOwnerEmail = (email: string) => email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;

// An account as the admin API gives it: everything that can be changed, and
// whether anyone has signed in to it yet.
function accountJson(row: Row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    // What they are: an agent, an investor, a lender, or someone shopping
    // ("buyer"). The first three have an agent's account.
    kind: row.kind ?? (row.role === "agent" ? "agent" : row.role === "buyer" ? "buyer" : null),
    // Where they are: "Seattle, WA", or null.
    location: placeLabel({ city: row.location_city, state: row.location_state }) || null,
    signed_in: !row.auth_user_id.startsWith(INVITED_PREFIX),
    owner: isOwnerEmail(row.email),
    full_name: row.full_name,
    phone: row.phone,
    brokerage: row.brokerage,
    mls_agent_id: row.mls_agent_id || null,
    contact_phone: row.contact_phone,
    contact_email: row.contact_email,
    bio: row.bio,
    profile_links: linksOf(row.profile_links),
    brand_color: row.brand_color,
    photo_url: row.profile_id ? absolute(photoUrl(row.profile_id, row.photo_v)) : null,
    banner: row.banner,
    banner_url: row.profile_id ? absolute(bannerUrl(row.profile_id, row.banner_v)) : null,
    profile_url: row.profile_id ? `${appUrl()}/people/${row.profile_id}` : null,
    created_at: row.created_at.toISOString(),
  };
}

async function rowOf(id: string): Promise<Row | null> {
  if (!isUuid(id)) return null;
  const [row] = await sql<Row[]>`
    select ${columns} from accounts a left join visitors v on v.account_id = a.id
    where a.id = ${id}`;
  return row ?? null;
}

export const NO_ACCOUNT = () => new ApiError(404, "not_found", "No account with that id.");

// How much there is on an account: its own listings, the links it has sent
// and the clients on them, and, as its profile counts them, its followers,
// the homes it has liked and what it has said.
async function countsOf(row: Row) {
  const [base] = await sql<{ own_listings: number; links_sent: number }[]>`
    select
      (select count(*)::int from listings where owner_account_id = ${row.id}) as own_listings,
      (select count(*)::int from shares where agent_id = ${row.id}) as links_sent`;
  const [book, follows, summary] = await Promise.all([
    base.links_sent > 0 ? getClientBook(row.id) : null,
    row.profile_id ? getFollowCounts(row.profile_id, row.profile_id) : null,
    row.profile_id ? getProfileSummary(row.profile_id, true) : null,
  ]);
  return {
    own_listings: base.own_listings,
    links_sent: base.links_sent,
    clients: book?.clients.length ?? 0,
    followers: follows?.followers ?? 0,
    likes: summary?.counts.liked ?? 0,
    comments: summary?.counts.comments ?? 0,
  };
}

// One account, whole, with its counts. Null when there's none by that id.
export async function getAccount(id: string) {
  const row = await rowOf(id);
  if (!row) return null;
  return { ...accountJson(row), counts: await countsOf(row) };
}

export type AccountQuery = { q: string; role: "agent" | "buyer" | null; limit: number; offset: number };

// Accounts, newest first, a page at a time: all of them, or those whose
// name, email, brokerage or MLS ID has `q` in it, or whose phone has its
// digits (three or more).
export async function listAccounts({ q, role, limit, offset }: AccountQuery) {
  const text = q.trim();
  const like = `%${escapeLike(text)}%`;
  const digits = text.replace(/\D/g, "");
  const matching = text
    ? sql`and (a.full_name ilike ${like} or a.email ilike ${like} or a.brokerage ilike ${like}
        or a.mls_agent_id ilike ${like}
        ${
          digits.length >= 3
            ? sql`or regexp_replace(a.phone, '[^0-9]', '', 'g') like ${`%${digits}%`}
                or a.contact_phone like ${`%${digits}%`}`
            : sql``
        })`
    : sql``;
  const ofRole = role ? sql`and a.role = ${role}` : sql``;
  const [rows, [{ total }]] = await Promise.all([
    sql<Row[]>`
      select ${columns} from accounts a left join visitors v on v.account_id = a.id
      where true ${ofRole} ${matching}
      order by a.created_at desc, a.id
      limit ${limit} offset ${offset}`,
    sql<{ total: number }[]>`select count(*)::int as total from accounts a where true ${ofRole} ${matching}`,
  ]);
  return { accounts: rows.map(accountJson), total };
}

// ---------------------------------------------------------------------------
// What can be sent

const FIELDS = [
  "email",
  "role",
  "kind",
  "location",
  "full_name",
  "phone",
  "brokerage",
  "mls_agent_id",
  "contact_phone",
  "contact_email",
  "bio",
  "profile_links",
  "brand_color",
  "photo",
  "banner",
] as const;

// A field we don't have is turned away rather than passed over, so a name
// spelled wrong ("name", "fullName") is found out at once.
const onlyKnown = (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
  for (const name of Object.keys(value)) {
    if (!(FIELDS as readonly string[]).includes(name)) {
      ctx.addIssue({
        code: "custom",
        path: [name],
        message: `An account has no “${name.slice(0, 40)}”. Use ${FIELDS.join(", ")}.`,
      });
    }
  }
};

// Text that may be cleared with null (kept as empty).
const clearable = (name: string) =>
  z.union([z.string(), z.null()], { error: `“${name}” is text, or null to clear it.` }).optional();

const email = z
  .string({ error: "Enter the email address they'll sign in with." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }).max(254, { error: "Enter a valid email address." }));

const role = z.enum(["agent", "buyer"], { error: "Use “agent” or “buyer”." });
const kind = z.enum(KINDS, { error: "Use “agent”, “investor”, “lender” or “buyer”." });

const image = z.union([photoSchema, z.null()], {
  error: "Send { “url”: “https://…” } or { “data”: “data:image/jpeg;base64,…” }, or null to take it off.",
});

const fields = {
  full_name: z.string({ error: "“full_name” is text." }).optional(),
  location: z.union([z.string(), z.null()], { error: "“location” is text, like “Seattle, WA”, or null." }).optional(),
  phone: clearable("phone"),
  brokerage: clearable("brokerage"),
  mls_agent_id: clearable("mls_agent_id"),
  contact_phone: clearable("contact_phone"),
  contact_email: clearable("contact_email"),
  bio: clearable("bio"),
  profile_links: z
    .union([z.array(z.unknown()), z.null()], {
      error: "“profile_links” is a list of { “label”, “url” }, or null to clear it.",
    })
    .optional(),
  brand_color: z.union([z.string(), z.null()], { error: "“brand_color” is text, like “#1F5F5B”." }).optional(),
  photo: image.optional(),
  banner: image.optional(),
};

const notAnObject = { error: "Send the account as a JSON object." };

// (A new account says what it is: its role, or its kind, or both.)
export const newAccountSchema = z
  .looseObject({ email, role: role.optional(), kind: kind.optional(), ...fields }, notAnObject)
  .superRefine(onlyKnown)
  .superRefine((value, ctx) => {
    if (!value.role && !value.kind) {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "Say what they are: “kind” (agent, investor, lender or buyer)." });
    }
  });
export const accountChangeSchema = z
  .looseObject({ email: email.optional(), role: role.optional(), kind: kind.optional(), ...fields }, notAnObject)
  .superRefine(onlyKnown);

type Change = z.infer<typeof accountChangeSchema>;

const wrong = (field: string, message: string) => new ApiError(400, "invalid_request", message, field);

// ---------------------------------------------------------------------------
// Checking what was sent, as the profile pages check it

// The account as it is, for a change to start from.
type Current = {
  id: string;
  email: string;
  auth_user_id: string;
  role: "agent" | "buyer" | null;
  kind: Kind | null;
  full_name: string;
  mls_agent_id: string;
};

// The columns to write, from what was sent: each checked, and anything only
// an agent's profile has refused for anyone else. (Photos are made apart:
// see `images`.)
async function columnsFrom(body: Change, current: Current | null) {
  const out: Record<string, unknown> = {};
  // What they are and their role go together: an agent, an investor or a
  // lender has an agent's account; someone shopping, a buyer's.
  if (body.kind !== undefined && body.role !== undefined && (isProKind(body.kind) ? "agent" : "buyer") !== body.role) {
    throw wrong("kind", "“kind” and “role” disagree: an agent, investor or lender has the role “agent”; a buyer, “buyer”.");
  }
  if (body.kind !== undefined) {
    out.kind = body.kind;
    out.role = isProKind(body.kind) ? "agent" : "buyer";
  } else if (body.role !== undefined) {
    out.role = body.role;
    // (A pro stays the pro they were; anyone else made an agent is one.)
    out.kind = body.role === "agent" ? (isProKind(current?.kind) ? current.kind : "agent") : "buyer";
  }
  if (body.location !== undefined) {
    const typed = body.location?.trim() ?? "";
    const place = typed ? parsePlace(typed) : { city: "", state: "" };
    if (!place) throw wrong("location", "Send the city and state, like “Seattle, WA”.");
    out.location_city = place.city;
    out.location_state = place.state;
  }
  const roleNow = (out.role as string | undefined) ?? current?.role ?? null;
  const isAgent = roleNow === "agent";

  if (body.full_name !== undefined) {
    if (isAgent) {
      // As Your details takes an agent's name.
      const name = body.full_name.trim();
      if (!name || name.length > AGENT_NAME_MOST) {
        throw wrong("full_name", `Please add a name (up to ${AGENT_NAME_MOST} characters).`);
      }
      out.full_name = name;
    } else {
      // As a buyer gives theirs: never an email (everyone else sees the
      // first of it, and an email would show whole).
      const name = body.full_name.replace(/\s+/g, " ").trim();
      if (name.includes("@")) throw wrong("full_name", "Type a name, not an email.");
      if (!name) throw wrong("full_name", "Please add a name.");
      if (name.length > BUYER_NAME_MOST) throw wrong("full_name", `Keep it to ${BUYER_NAME_MOST} characters.`);
      out.full_name = name;
    }
  }

  if (body.phone !== undefined) {
    // Their own phone (from signing up; never shown), as the admin pages keep it.
    const phone = (body.phone ?? "").trim();
    if (phone.length > 30) throw wrong("phone", "That phone number is too long.");
    out.phone = phone;
  }

  // What only an agent's profile shows: refused for anyone else, unless it's
  // being cleared.
  const agentOnly = (field: string, given: unknown) => {
    const empty = given === null || given === "" || (Array.isArray(given) && given.length === 0);
    if (!isAgent && !empty) throw wrong(field, "Only an agent's profile has this. Make them an agent first (“role”: “agent”).");
  };

  if (body.brokerage !== undefined) {
    agentOnly("brokerage", body.brokerage);
    const brokerage = (body.brokerage ?? "").trim();
    if (brokerage.length > BROKERAGE_MOST) throw wrong("brokerage", `Keep the brokerage to ${BROKERAGE_MOST} characters.`);
    out.brokerage = brokerage;
  }

  if (body.contact_phone !== undefined) {
    agentOnly("contact_phone", body.contact_phone);
    const phone = contactPhoneSchema.safeParse((body.contact_phone ?? "").trim());
    if (!phone.success) {
      throw wrong("contact_phone", "Please enter a phone number with the area code, or leave it empty.");
    }
    out.contact_phone = phone.data;
  }

  if (body.contact_email !== undefined) {
    agentOnly("contact_email", body.contact_email);
    const contact = contactEmailSchema.safeParse((body.contact_email ?? "").trim().toLowerCase());
    if (!contact.success) throw wrong("contact_email", "Please enter a valid email address, or leave it empty.");
    out.contact_email = contact.data;
  }

  if (body.brand_color !== undefined) {
    agentOnly("brand_color", body.brand_color);
    const color = body.brand_color === null ? BRAND_COLORS[0].value : body.brand_color.trim().toUpperCase();
    if (!isBrandColor(color)) {
      throw wrong("brand_color", `Use one of the brand colors: ${BRAND_COLORS.map((c) => c.value).join(", ")}.`);
    }
    out.brand_color = color;
  }

  // Their MLS ID, checked as Your details checks it (against their name, as
  // it will be), whenever either changes.
  if (body.mls_agent_id !== undefined) agentOnly("mls_agent_id", body.mls_agent_id);
  if (body.mls_agent_id !== undefined || (body.full_name !== undefined && isAgent)) {
    const mlsAgentId = body.mls_agent_id !== undefined ? (body.mls_agent_id ?? "").trim() : (current?.mls_agent_id ?? "");
    const name = (out.full_name as string | undefined) ?? current?.full_name ?? "";
    const problem = isAgent ? await mlsAgentIdProblem(mlsAgentId, name) : null;
    if (problem) throw wrong("mls_agent_id", problem);
    if (body.mls_agent_id !== undefined) out.mls_agent_id = mlsAgentId;
  }

  if (body.bio !== undefined) {
    const bio = (body.bio ?? "").replace(/\r\n/g, "\n").trim();
    if (bio.length > BIO_MOST) throw wrong("bio", `Keep it to ${BIO_MOST} characters.`);
    out.bio = bio;
  }

  if (body.profile_links !== undefined) {
    agentOnly("profile_links", body.profile_links);
    // As About keeps an agent's links: those with an address, each http(s),
    // a bare address taken as https.
    const given = (body.profile_links ?? []).filter(
      (link) => !(link && typeof link === "object" && typeof (link as { url?: unknown }).url === "string" && !(link as { url: string }).url.trim()),
    );
    const parsed = z.array(aboutLink).max(LINKS_MOST).safeParse(given);
    if (!parsed.success) throw wrong("profile_links", `Up to ${LINKS_MOST} links, each { “label”, “url” } with a web address.`);
    const kept: { label: string; url: string }[] = [];
    for (const link of parsed.data) {
      const url = linkUrl(link.url);
      if (!url) throw wrong("profile_links", `“${link.url.slice(0, 80)}” doesn't look like a web address.`);
      kept.push({ label: link.label, url });
    }
    out.profile_links = kept;
  }

  return out;
}

// An ApiError about part of a photo ("url"), said about where it was sent
// ("photo.url").
const under = (field: string, error: unknown) =>
  error instanceof ApiError
    ? new ApiError(error.status, error.code, error.message, error.field ? `${field}.${error.field}` : field)
    : error;

// Their photo, made as Edit profile makes it in the browser: the middle
// square, 256 px, a JPEG at quality 82.
const PHOTO_SIZE = 256;
async function profilePhoto(sent: z.infer<typeof photoSchema>): Promise<string> {
  try {
    const { input, field } = await photoBytes(sent);
    const pixels = await photoPixels(input, field, { width: PHOTO_SIZE, height: PHOTO_SIZE, fit: "cover", position: "centre" });
    return (await jpegWithin(pixels, PROFILE_PHOTO_MOST_CHARS, field)).dataUrl;
  } catch (error) {
    throw under("photo", error);
  }
}

// Their banner, made as Edit profile makes it: the image as it was added (no
// more than 1600 px along its long side, a JPEG at quality 85: what it can
// be moved and resized from later), and the band drawn from it, framed in
// the middle at its natural size (1200 × 360, a JPEG at quality 82).
const BANNER_SOURCE_SIDE = 1600;
const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 360;
const BANNER_FRAME = { x: 0.5, y: 0.5, zoom: 1 };
async function bannerImages(sent: z.infer<typeof photoSchema>) {
  try {
    const { input, field } = await photoBytes(sent);
    const pixels = await photoPixels(input, field, {
      width: BANNER_SOURCE_SIDE,
      height: BANNER_SOURCE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
    const source = await jpegWithin(pixels, BANNER_SOURCE_MOST_CHARS, field, 85);
    const band = await photoPixels(Buffer.from(source.dataUrl.slice(source.dataUrl.indexOf(",") + 1), "base64"), "data", {
      width: BANNER_WIDTH,
      height: BANNER_HEIGHT,
      fit: "cover",
      position: "centre",
    });
    const image = await jpegWithin(band, BANNER_IMAGE_MOST_CHARS, field);
    return { source: source.dataUrl, image: image.dataUrl };
  } catch (error) {
    throw under("banner", error);
  }
}

// The photo and banner columns, from what was sent: made, or taken off (null:
// the banner goes back to the scene picked for them).
async function images(body: Change) {
  const out: Record<string, unknown> = {};
  if (body.photo !== undefined) out.photo_data_url = body.photo === null ? null : await profilePhoto(body.photo);
  if (body.banner !== undefined) {
    if (body.banner === null) {
      Object.assign(out, { banner: "", banner_data_url: null, banner_source_data_url: null, banner_frame: null });
    } else {
      const made = await bannerImages(body.banner);
      Object.assign(out, {
        banner: "image",
        banner_data_url: made.image,
        banner_source_data_url: made.source,
        banner_frame: BANNER_FRAME,
      });
    }
  }
  return out;
}

// Values ready for the database: lists and objects as JSON.
const asValues = (columns: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(columns).map(([name, value]) => [
      name,
      value !== null && typeof value === "object" ? sql.json(value as Parameters<typeof sql.json>[0]) : value,
    ]),
  );

type Tx = postgres.ISql;

// One email at a time: two requests for the same address can't both find it
// free.
const holdEmail = (tx: Tx, address: string) => tx`select pg_advisory_xact_lock(hashtext(${`account-email:${address}`}))`;

const TAKEN = () => new ApiError(409, "conflict", "That email is already on an account.", "email");

async function emailTaken(tx: Tx, address: string, except: string | null) {
  const [taken] = await tx`
    select 1 from accounts where lower(email) = ${address} and (${except}::uuid is null or id <> ${except}::uuid)`;
  return Boolean(taken);
}

// A unique column that already had this value: an MLS ID on another
// profile, or an email someone signed up with a moment ago.
function duplicate(error: unknown) {
  const detail = String((error as { constraint_name?: string; constraint?: string } | null)?.constraint_name ?? "");
  if (/mls/i.test(detail)) return new ApiError(409, "conflict", "That MLS ID is on another profile.", "mls_agent_id");
  return TAKEN();
}

// ---------------------------------------------------------------------------
// Making, changing and deleting

// Their public profile, made if they have none yet, under their first name
// as it is now (as saving a name on the site does).
async function ensureProfile(id: string) {
  const [account] = await sql<Account[]>`
    select id, email, full_name, role, kind, brokerage, photo_data_url, brand_color from accounts where id = ${id}`;
  if (account) await ensureAccountVisitor(account);
}

// A new account, waiting for its person to sign in with its email. Its
// public profile is made at once (as saving a name makes it), so it can be
// seen and found. Gives back its id.
export async function createAccount(body: z.infer<typeof newAccountSchema>): Promise<string> {
  const columns = await columnsFrom(body, null);
  const pictures = await images(body);
  try {
    const id = await sql.begin(async (tx) => {
      await holdEmail(tx, body.email);
      if (await emailTaken(tx, body.email, null)) throw TAKEN();
      const values = asValues({
        ...columns,
        ...pictures,
        email: body.email,
        auth_user_id: INVITED_PREFIX + body.email,
      });
      const [made] = await tx<{ id: string }[]>`insert into accounts ${sql(values)} returning id`;
      return made.id;
    });
    await ensureProfile(id);
    return id;
  } catch (error) {
    if (isDuplicate(error)) throw duplicate(error);
    throw error;
  }
}

// Only what's sent changes. The owner's own account keeps its role and its
// email (their admin keys and their being the owner go by it). An email
// changed on an account nobody has signed in to yet moves its invitation
// with it; on one someone has, it's never an admin's (admins are known by
// their email, so it would make whoever signs in to it one).
export async function updateAccount(id: string, body: Change): Promise<void> {
  const current = await rowOf(id);
  if (!current) throw NO_ACCOUNT();
  const owner = isOwnerEmail(current.email);
  // (The owner may be any kind of pro, as long as the account stays an agent's.)
  const roleAsked = body.kind !== undefined ? (isProKind(body.kind) ? "agent" : "buyer") : body.role;
  if (owner && roleAsked !== undefined && roleAsked !== current.role) {
    throw new ApiError(409, "conflict", "The owner's account keeps its role.", body.kind !== undefined ? "kind" : "role");
  }
  const changingEmail = body.email !== undefined && body.email !== current.email.trim().toLowerCase();
  if (owner && changingEmail) {
    throw new ApiError(409, "conflict", "The owner's email stays as it is: admin keys go by it.", "email");
  }
  const invited = current.auth_user_id.startsWith(INVITED_PREFIX);
  if (changingEmail && !invited) {
    const [admin] = await sql`select 1 from admins where email = ${body.email!}`;
    if (admin || isOwnerEmail(body.email!)) {
      throw new ApiError(409, "conflict", "That's an admin's email. It can't be given to someone already signed in.", "email");
    }
  }
  const columns = await columnsFrom(body, current);
  const pictures = await images(body);
  try {
    await sql.begin(async (tx) => {
      const changes: Record<string, unknown> = { ...columns, ...pictures };
      if (changingEmail) {
        await holdEmail(tx, body.email!);
        if (await emailTaken(tx, body.email!, id)) throw TAKEN();
        changes.email = body.email;
        if (invited) changes.auth_user_id = INVITED_PREFIX + body.email;
      }
      if (Object.keys(changes).length === 0) return;
      // (Only while it's as it was read: an invitation claimed in the
      // meantime keeps the sign-in it was claimed by.)
      const [saved] = await tx`
        update accounts set ${sql(asValues(changes))}
        where id = ${id} and auth_user_id = ${current.auth_user_id}
        returning id`;
      if (!saved) {
        throw new ApiError(409, "conflict", "This account was signed in to just now. Read it again and try once more.");
      }
    });
  } catch (error) {
    if (isDuplicate(error)) throw duplicate(error);
    throw error;
  }
  // Their profile, named as they now are (as saving a name does).
  if (body.full_name !== undefined || !current.profile_id) await ensureProfile(id);
}

// An account, gone, with everything that's only theirs: what the database
// takes with it (every foreign key to accounts is ON DELETE CASCADE, except
// participants.account_id, SET NULL) — their profile and all they did on it
// (likes, comments, follows, saved homes; and with their comments, the
// replies under them), the links they sent and everything said on those,
// their own listings and photos, keys, webhooks; and on other people's
// links, their place stays (as the first name they were known by, as before
// they signed up), with what they did there.
//
// Their own listings go as deleteOwnListing would take them, except that one
// on someone else's link has no owner left to keep it hidden for: it stays
// on that link as the home it was ("Withdrawn", hidden everywhere else, with
// no owner), so that link and what was said on it keep working, without the
// photos and videos they uploaded (those were theirs). A home from the MLS is
// never touched: only listings they owned.
//
// Not in the database's hands, and so left as they are: an uploaded video's
// file in storage, a sign-up form they filled in (signups) and the admins
// list (both by email), and their sign-in itself: signing in again with that
// email makes a new account.
export async function deleteAccount(id: string, confirm: string | null): Promise<void> {
  const current = await rowOf(id);
  if (!current) throw NO_ACCOUNT();
  if (!confirm || confirm.trim().toLowerCase() !== current.email.trim().toLowerCase()) {
    throw wrong("confirm", "To delete this account, send its email as ?confirm=.");
  }
  if (isOwnerEmail(current.email)) throw new ApiError(409, "conflict", "The owner's account can't be deleted.");
  await sql.begin(async (tx) => {
    // Held, so nothing is added to it while it goes.
    const [held] = await tx`select id from accounts where id = ${id} for update`;
    if (!held) throw NO_ACCOUNT();
    // And their listings: another agent can put one of them on a link
    // without touching this account. A send already under way holds its
    // listing (for key share), so this waits for it to finish, and the
    // check below then sees that link; a send that comes later waits for
    // this to finish.
    await tx`select listing_key from listings where owner_account_id = ${id} order by listing_key for update`;
    // Their listings on someone else's link: kept for that link, as above.
    const kept = await tx<{ listing_key: string }[]>`
      select l.listing_key from listings l
      where l.owner_account_id = ${id}
        and exists (
          select 1 from share_listings sl join shares s on s.id = sl.share_id
          where sl.listing_key = l.listing_key and s.agent_id <> ${id})`;
    for (const { listing_key: key } of kept) {
      const [row] = await tx<{ media: { MediaKey?: string; MediaURL?: string }[] | null }[]>`
        select data->'Media' as media from listings where listing_key = ${key}`;
      const media = (row?.media ?? []).filter(
        (item) =>
          !(item.MediaURL ?? "").startsWith("/listing-photo/") && !STORED_VIDEO.test(item.MediaKey ?? ""),
      );
      await tx`
        update listings set owner_account_id = null, standard_status = 'Withdrawn',
          data = data || ${sql.json({ StandardStatus: "Withdrawn", Hidden: true, Media: media.map((item, i) => ({ ...item, Order: i })) } as never)},
          updated_at = now()
        where listing_key = ${key} and owner_account_id = ${id}`;
    }
    await tx`delete from accounts where id = ${id}`;
  });
}

// ---------------------------------------------------------------------------
// The query

// A whole number from the query, or the default when it isn't there. Anything
// else is a mistake worth saying, rather than quietly reading as something.
export function wholeNumber(url: URL, name: string, fallback: number, least: number, most: number) {
  const given = url.searchParams.get(name);
  if (given === null || given.trim() === "") return fallback;
  const n = /^\d+$/.test(given.trim()) ? Number(given.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < least || n > most) {
    throw wrong(
      name,
      most === Number.MAX_SAFE_INTEGER ? `${name} is a whole number, ${least} or more.` : `${name} is a whole number from ${least} to ${most}.`,
    );
  }
  return n;
}

// What's done with an admin key, newest first, a page at a time: which key,
// what (method and path, never the query), about which account, and how it
// went.
export async function adminLog(limit: number, offset: number) {
  const [rows, [{ total }]] = await Promise.all([
    sql<
      {
        id: string;
        method: string;
        path: string;
        account_id: string | null;
        status: number;
        created_at: Date;
        key_name: string | null;
        key_prefix: string | null;
      }[]
    >`
      select l.id, l.method, l.path, l.account_id, l.status, l.created_at, k.name as key_name, k.prefix as key_prefix
      from api_admin_log l left join api_keys k on k.id = l.key_id
      order by l.created_at desc, l.id
      limit ${limit} offset ${offset}`,
    sql<{ total: number }[]>`select count(*)::int as total from api_admin_log`,
  ]);
  return {
    entries: rows.map((row) => ({
      id: row.id,
      method: row.method,
      path: row.path,
      account_id: row.account_id,
      status: row.status,
      created_at: row.created_at.toISOString(),
      key: row.key_name !== null ? { name: row.key_name, prefix: row.key_prefix } : null,
    })),
    total,
  };
}
