"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { BANNER_STYLE } from "@/lib/banner";
import { fail, readDevice, type ActionResult } from "@/lib/engagement";
import { NOT_AN_EMAIL } from "@/lib/people-picker";
import {
  aboutLink,
  BANNER_IMAGE_MOST_CHARS,
  BANNER_SOURCE_MOST_CHARS,
  BIO_MOST,
  BUYER_NAME_MOST,
  JPEG_DATA_URL,
  linkUrl,
  LINKS_MOST,
  PROFILE_PHOTO_MOST_CHARS,
} from "@/lib/profile-fields";
import { ensureAccountVisitor, getPublicIdentity } from "@/lib/public";
import type { Sentiment } from "@/lib/reactions";

// Follows someone, or stops. Only someone signed in follows anyone, as their
// own page (made now if they have none yet), and never themselves. `stay`:
// the page isn't refreshed (a list keeps whoever was just unfollowed, to undo).
export async function setFollowing(personId: string, on: boolean, stay = false): Promise<ActionResult> {
  if (!z.uuid().safeParse(personId).success || typeof on !== "boolean") return fail("We couldn't do that.");
  const account = await getCurrentUser();
  if (!account?.role) return fail("Sign in to follow people.");
  const me = await ensureAccountVisitor(account);
  if (me.id === personId) return fail("That's you.");
  if (on) {
    await sql`
      insert into follows (follower_id, followed_id)
      select ${me.id}, id from visitors where id = ${personId}
      on conflict do nothing`;
  } else {
    await sql`delete from follows where follower_id = ${me.id} and followed_id = ${personId}`;
  }
  if (stay !== true) refresh();
  return { ok: true };
}

// Only ever your own page: each of these works on whoever is asking, never
// on a page named in the request.
async function ownVisitor() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  return visitor;
}

const chipKey = z.string().trim().min(1).max(60);

// Keeps one thing your taste says on your page, or takes it off for everyone
// else (and out of the description). Kept however the description changes.
export async function showTasteChip(key: string, shown: boolean): Promise<ActionResult> {
  const parsed = chipKey.safeParse(key);
  if (!parsed.success || typeof shown !== "boolean") return fail("We couldn't save that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  const item = parsed.data.toLowerCase();
  if (shown) {
    await sql`
      update visitors
      set taste_hidden = coalesce(
        (select jsonb_agg(value) from jsonb_array_elements_text(taste_hidden) value where value <> ${item}),
        '[]'::jsonb)
      where id = ${visitor.id}`;
  } else {
    await sql`
      update visitors set taste_hidden = taste_hidden || jsonb_build_array(${item}::text)
      where id = ${visitor.id}
        and not taste_hidden @> jsonb_build_array(${item}::text)
        and jsonb_array_length(taste_hidden) < 100`;
  }
  refresh();
  return { ok: true };
}

// Whether everyone else sees what you pass on: the "Passes on" chips, the
// passes in your feed, and your page filtered to passes (`?show=passed`).
export async function showPasses(shown: boolean): Promise<ActionResult> {
  if (typeof shown !== "boolean") return fail("We couldn't save that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  await sql`update visitors set hide_passes = ${!shown} where id = ${visitor.id}`;
  refresh();
  return { ok: true };
}

// Whether what you do on links you were sent (likes, passes, what you say
// about a home) shows on your page. Switched back on, it shows from then on:
// never what you did while it was off.
export async function showLinkActivity(shown: boolean): Promise<ActionResult> {
  if (typeof shown !== "boolean") return fail("We couldn't save that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  await sql`
    update visitors set hide_links = ${!shown},
      links_shown_from = case when ${shown} and hide_links then now() else links_shown_from end
    where id = ${visitor.id}`;
  refresh();
  return { ok: true };
}

const listingKey = z.string().min(1).max(100);
const sentiment = z.enum(["like", "dislike"]);
// Which things in a home's photos (or which of its facts): as saved.
const spotList = z
  .array(z.object({ mediaKey: z.string().min(1).max(500), tag: z.string().min(1).max(60) }))
  .min(1)
  .max(50);

// Takes back your like (or pass) on a home, from your page. Only yours: it
// never touches anyone else's, whatever it's sent.
export async function removeMyReaction(key: string, kind: Sentiment): Promise<ActionResult> {
  if (!listingKey.safeParse(key).success || !sentiment.safeParse(kind).success) return fail("We couldn't do that.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  await sql`
    delete from public_reactions
    where listing_key = ${key} and visitor_id = ${visitor.id} and reaction = ${kind}`;
  refresh();
  return { ok: true };
}

// Takes back what you liked (or didn't) in a home's photos or facts: "the front door".
export async function removeMySpots(key: string, kind: Sentiment, spots: unknown): Promise<ActionResult> {
  const parsed = spotList.safeParse(spots);
  if (!listingKey.safeParse(key).success || !sentiment.safeParse(kind).success || !parsed.success) {
    return fail("We couldn't do that.");
  }
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  const mediaKeys = parsed.data.map((spot) => spot.mediaKey);
  const tags = parsed.data.map((spot) => spot.tag);
  const which = sql`
    listing_key = ${key} and visitor_id = ${visitor.id}
    and (media_key, tag) in (select * from unnest(${mediaKeys}::text[], ${tags}::text[]))`;
  if (kind === "like") await sql`delete from public_photo_likes where ${which}`;
  else await sql`delete from public_photo_dislikes where ${which}`;
  refresh();
  return { ok: true };
}

// Deletes a comment you wrote, unless someone else has answered it: their
// words would go with it. (Your own replies to it go too.)
export async function deleteMyComment(id: string): Promise<ActionResult> {
  if (typeof id !== "string" || id.length > 64) return fail("That comment isn't there anymore.");
  const visitor = await ownVisitor();
  if (!visitor) return fail("Please add your name first.");
  const outcome = await sql.begin(async (tx) => {
    // Held first, so a reply being saved this moment finishes and is counted
    // below rather than going with the comment. Someone else's reads as gone,
    // so it doesn't even say there's one there.
    const [mine] = await tx`
      select id from public_comments where id::text = ${id} and visitor_id = ${visitor.id} for update`;
    if (!mine) return "gone";
    const [deleted] = await tx`
      delete from public_comments c
      where c.id = ${mine.id}
        and not exists (select 1 from public_comments r where r.parent_id = c.id and r.visitor_id <> ${visitor.id})
      returning c.id`;
    return deleted ? "deleted" : "answered";
  });
  if (outcome === "gone") return fail("That comment isn't there anymore.");
  if (outcome === "answered") return fail("Comments with replies can't be deleted here.");
  refresh();
  return { ok: true };
}

// Your own name: a buyer's, given right after signing in with only an email
// (the sign-in page asks, once) or changed on Edit profile. Up to 60
// characters and never an email: everyone else only ever sees the first of
// it, and an email typed here by mistake would show whole. Their public page
// goes by it from then on. An agent's is among their details instead (their
// MLS ID is checked against it there). (The page isn't refreshed here: the
// sign-in page is on its way somewhere else, and each form does it itself.)
// (lib/profile-fields.ts, the same as the admin API.)
const NAME_MOST = BUYER_NAME_MOST;

export async function setMyName(name: string): Promise<ActionResult> {
  const typed = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (typed.includes("@")) return fail(NOT_AN_EMAIL);
  if (!typed) return fail("Please add your name.");
  if (typed.length > NAME_MOST) return fail(`Keep it to ${NAME_MOST} characters.`);
  const account = await getCurrentUser();
  if (!account) return fail("Sign in to change your name.");
  if (account.role === "agent") return fail("Your name is in Your details.");
  await sql`update accounts set full_name = ${typed} where id = ${account.id}`;
  await ensureAccountVisitor({ ...account, full_name: typed });
  return { ok: true };
}

const PHOTO = JPEG_DATA_URL;

// Your own photo, in place of your initial wherever you appear: a small square
// JPEG made in the browser (lib/resize-photo.ts). Empty takes it away.
export async function setMyPhoto(photo: string): Promise<ActionResult> {
  if (typeof photo !== "string" || photo.length > PROFILE_PHOTO_MOST_CHARS || (photo !== "" && !PHOTO.test(photo))) {
    return fail("We couldn't use that photo. Try a JPEG or PNG.");
  }
  const account = await getCurrentUser();
  if (!account?.role) return fail("Sign in to add a photo.");
  await sql`update accounts set photo_data_url = ${photo || null} where id = ${account.id}`;
  refresh();
  return { ok: true };
}

// The band across the top of your profile: a drawn scene, nothing ("blank"),
// or an image of your own (a small wide JPEG made in the browser:
// lib/resize-photo.ts), sent with the choice the first time and whenever it
// changes. "" goes back to the scene picked for you. An image, once added, is
// kept while another choice is on, so it can be chosen again. With a new
// image comes the image as it was added (`source`), kept so it can be moved
// and resized later; and with any image, how it's framed (`frame`).
const bannerFrame = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(0.01).max(3) });

export async function setMyBanner(
  style: string,
  image?: string,
  source?: string,
  frame?: { x: number; y: number; zoom: number },
): Promise<ActionResult> {
  if (typeof style !== "string" || !BANNER_STYLE.test(style)) return fail("We couldn't save that.");
  if (image !== undefined && (typeof image !== "string" || image.length > BANNER_IMAGE_MOST_CHARS || !PHOTO.test(image))) {
    return fail("We couldn't use that image. Try a JPEG or PNG.");
  }
  if (source !== undefined && (typeof source !== "string" || source.length > BANNER_SOURCE_MOST_CHARS || !PHOTO.test(source))) {
    return fail("That image is too large. Try a smaller one.");
  }
  const framed = frame === undefined ? null : bannerFrame.safeParse(frame);
  if (framed && !framed.success) return fail("We couldn't save that.");
  const account = await getCurrentUser();
  if (!account?.role) return fail("Sign in to change your banner.");
  const saved = await sql`
    update accounts set banner = ${style},
      banner_data_url = coalesce(${image ?? null}, banner_data_url),
      banner_source_data_url = coalesce(${source ?? null}, banner_source_data_url),
      banner_frame = coalesce(${framed ? sql.json(framed.data) : null}, banner_frame)
    where id = ${account.id} and (${style} <> 'image' or coalesce(${image ?? null}, banner_data_url) is not null)
    returning id`;
  if (saved.length === 0) return fail("Add an image first.");
  refresh();
  return { ok: true };
}

// What you say about yourself at the top of your page, and (an agent) a few
// links: each http(s), a bare address taken as https (lib/profile-fields.ts).
// Only ever your own.

export async function saveAbout(bio: string, links: { label: string; url: string }[]): Promise<ActionResult> {
  if (typeof bio !== "string" || !Array.isArray(links)) return fail("We couldn't save that.");
  const text = bio.replace(/\r\n/g, "\n").trim();
  if (text.length > BIO_MOST) return fail(`Keep it to ${BIO_MOST} characters.`);
  const account = await getCurrentUser();
  if (!account?.role) return fail("Sign in to edit your profile.");
  const kept: { label: string; url: string }[] = [];
  if (account.role === "agent") {
    const parsed = z.array(aboutLink).max(LINKS_MOST).safeParse(links.filter((link) => link?.url?.trim()));
    if (!parsed.success) return fail(`Up to ${LINKS_MOST} links, each a web address.`);
    for (const link of parsed.data) {
      const url = linkUrl(link.url);
      if (!url) return fail(`“${link.url}” doesn't look like a web address.`);
      kept.push({ label: link.label, url });
    }
  }
  await sql`
    update accounts set bio = ${text}, profile_links = ${sql.json(kept)}
    where id = ${account.id}`;
  refresh();
  return { ok: true };
}
