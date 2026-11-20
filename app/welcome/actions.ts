"use server";

import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isKind, isProKind } from "@/lib/kinds";
import {
  AGENT_NAME_MOST,
  BROKERAGE_MOST,
  BUYER_NAME_MOST,
  isBrandColor,
  isDuplicate,
  JPEG_DATA_URL,
  mlsAgentIdProblem,
  PROFILE_PHOTO_MOST_CHARS,
} from "@/lib/profile-fields";
import { NOT_AN_EMAIL } from "@/lib/people-picker";
import { ensureAccountVisitor } from "@/lib/public";

// Getting started, a step at a time (app/welcome): each step saves its one
// answer as it's given. Only ever about whoever's signed in. (The page isn't
// refreshed by these: once what they are and their name are saved, the page
// would send them on before the rest is asked. It's refreshed at the end.)

export type StepResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): StepResult => ({ ok: false, error });

// What they are. Said once, when they join (an account that hasn't said
// yet); after that, a pro can switch between agent, investor and lender on
// Edit profile (lib: setMyKind). Agents, investors and lenders get the same
// tools: an agent's account; someone shopping, a buyer's.
export async function chooseKind(kind: string): Promise<StepResult> {
  if (!isKind(kind)) return fail("Pick one to go on.");
  const me = await getCurrentUser();
  if (!me) return fail("Sign in again to go on.");
  // (Back on this step while getting started, within their first day, any
  // answer can change; after that, only between the pros.)
  const [{ fresh }] = await sql<{ fresh: boolean }[]>`
    select created_at > now() - interval '1 day' as fresh from accounts where id = ${me.id}`;
  if (me.kind && !fresh && !(isProKind(me.kind) && isProKind(kind))) {
    return fail("You've already said. Change it on Edit profile.");
  }
  await sql`
    update accounts set kind = ${kind}, role = ${isProKind(kind) ? "agent" : "buyer"}
    where id = ${me.id}`;
  return { ok: true };
}

// Their name: a pro's full name (on their profile, and what their MLS
// listings are matched by), or a buyer's first name (beside their likes).
export async function saveName(name: string): Promise<StepResult> {
  const typed = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  const me = await getCurrentUser();
  if (!me) return fail("Sign in again to go on.");
  const pro = me.role === "agent";
  const most = pro ? AGENT_NAME_MOST : BUYER_NAME_MOST;
  if (!typed) return fail(pro ? "Please add your full name." : "Please add your first name.");
  if (typed.includes("@")) return fail(pro ? "Type your name, not an email" : NOT_AN_EMAIL);
  if (typed.length > most) return fail(`Keep it to ${most} characters.`);
  await sql`update accounts set full_name = ${typed} where id = ${me.id}`;
  await ensureAccountVisitor({ ...me, full_name: typed });
  return { ok: true };
}

// A pro's company: their brokerage, an investor's or a lender's company.
export async function saveCompany(company: string): Promise<StepResult> {
  const typed = typeof company === "string" ? company.replace(/\s+/g, " ").trim() : "";
  if (typed.length > BROKERAGE_MOST) return fail(`Keep it to ${BROKERAGE_MOST} characters.`);
  const me = await getCurrentUser();
  if (me?.role !== "agent") return fail("Sign in again to go on.");
  await sql`update accounts set brokerage = ${typed} where id = ${me.id}`;
  return { ok: true };
}

// An agent's MLS ID: their MLS listings show on their profile by it.
export async function saveMlsId(mlsId: string): Promise<StepResult> {
  const typed = typeof mlsId === "string" ? mlsId.trim() : "";
  const me = await getCurrentUser();
  if (me?.role !== "agent") return fail("Sign in again to go on.");
  const problem = await mlsAgentIdProblem(typed, me.full_name);
  if (problem) return fail(problem);
  try {
    await sql`update accounts set mls_agent_id = ${typed} where id = ${me.id}`;
  } catch (error) {
    if (isDuplicate(error)) return fail("Another account already has that MLS ID.");
    throw error;
  }
  return { ok: true };
}

// A pro's colour: their links and profile wear it.
export async function saveColor(color: string): Promise<StepResult> {
  if (!isBrandColor(color)) return fail("Pick one of the colors.");
  const me = await getCurrentUser();
  if (me?.role !== "agent") return fail("Sign in again to go on.");
  await sql`update accounts set brand_color = ${color} where id = ${me.id}`;
  return { ok: true };
}

// Their photo: a small square JPEG made in the browser (lib/resize-photo.ts),
// as Edit profile takes it.
export async function savePhoto(photo: string): Promise<StepResult> {
  if (typeof photo !== "string" || photo.length > PROFILE_PHOTO_MOST_CHARS || !JPEG_DATA_URL.test(photo)) {
    return fail("We couldn't use that photo. Try a JPEG or PNG.");
  }
  const me = await getCurrentUser();
  if (!me?.role) return fail("Sign in again to go on.");
  await sql`update accounts set photo_data_url = ${photo} where id = ${me.id}`;
  return { ok: true };
}
