"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEV_COOKIE, devLoginEnabled, INVITED_PREFIX, requireUser, sitePath, VIEW_AS_COOKIE } from "@/lib/auth";
import { sql } from "@/lib/db";
import { afterSignIn } from "@/lib/sign-in";
import { siteOrigin } from "@/lib/site";
import { createSupabase, supabaseConfigured } from "@/lib/supabase/server";
import { clearTestUser, setTestUser, testPasswordMatches, testSignInEnabled } from "@/lib/test-sign-in";

// Signing up and signing in are one thing, done on the page you're on: an
// email (and, new here, a first name), then the code emailed to it. No
// password, and no link to follow to another tab (the same email has one, for
// anyone who'd rather tap it). Locally, with no email to send, the code is
// DEV_CODE, shown on the page.

export type CodeState = {
  error?: string;
  // Which field to fix.
  field?: "firstName" | "phone" | "email" | "code" | "password";
  // Sent: to this email.
  sent?: string;
  // Locally: the code, since no email goes out.
  devCode?: string;
  // Signed in. `agent`: their account is an agent's.
  // `needsName`: a buyer's with no first name yet, to ask for (an agent gives
  // their full name with their brand, on their dashboard).
  // `welcome`: new here (they haven't said what they are yet), to be asked
  // that and the rest a step at a time (/welcome).
  done?: { agent: boolean; needsName: boolean; welcome: boolean };
};

const DEV_CODE = "123456";

const emailSchema = z.email().max(254);

// Step one: a code to their email, and a link in it back to `next`. A first
// name, when they give one, names their account if it's new. From "For
// agents" (`asAgent`), they're signing up as an agent: noted for the email's
// link, which can't say which form it came from (the code, typed on that
// form, says so itself).
export async function sendCode(input: {
  email: string;
  firstName?: string;
  // Optional, from the home page's form: for a call back.
  phone?: string;
  next?: string;
  asAgent?: boolean;
}): Promise<CodeState> {
  const email = emailSchema.safeParse(String(input.email ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address.", field: "email" };
  const phone = String(input.phone ?? "").trim();
  const digits = phone.replace(/\D/g, "");
  if (phone && (phone.length > 30 || digits.length < 10 || digits.length > 15)) {
    return { error: "Please add the phone number with its area code, or leave it empty.", field: "phone" };
  }
  if (input.firstName !== undefined) {
    const name = String(input.firstName).replace(/\s+/g, " ").trim();
    if (!name || name.length > 40) return { error: "Please add your first name.", field: "firstName" };
    await sql`
      insert into signups (email, full_name, phone) values (${email.data}, ${name}, ${phone})
      on conflict (email) do update set
        full_name = excluded.full_name,
        phone = coalesce(nullif(excluded.phone, ''), signups.phone),
        updated_at = now()`;
  }
  // (The newest email's code and link are the only ones that work, so the
  // newest form asked from is the one that counts.)
  if (input.asAgent === true) await signingUpAsAgent(email.data);
  else await sql`delete from account_intents where email = ${email.data}`;
  if (supabaseConfigured) {
    // (Only a path on this site, so the email's link can never send anyone elsewhere.)
    const next = sitePath(input.next);
    const supabase = await createSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: {
        shouldCreateUser: true,
        // Back to this address (www.porchcard.com, say), where the code was
        // asked for: signed in at one address, they aren't at another.
        // (Always with a query, so the email's link can add the token to it.)
        emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next ?? "/")}`,
      },
    });
    if (error) {
      console.error("[auth] sign-in email failed", error.message);
      return { error: "We couldn't send your code just now. Please try again in a minute." };
    }
    return { sent: email.data };
  }
  if (devLoginEnabled) return { sent: email.data, devCode: DEV_CODE };
  return { error: "Sign-in isn't set up yet." };
}

// Step two: the code from the email. They're signed in right here, and what
// this browser did before (a first name on an agent's link, likes on public
// homes) becomes their account's. `asAgent`: typed on the "For agents" form,
// so the account is an agent's. Only whoever has the code can say so: an
// email typed on that form by someone else changes nothing.
export async function verifyCode(input: { email: string; code: string; asAgent?: boolean }): Promise<CodeState> {
  const email = emailSchema.safeParse(String(input.email ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address.", field: "email" };
  const code = String(input.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(code)) return { error: "Enter the code from the email.", field: "code" };
  // (A code works once, and only the newest: the email's link is the same
  // code, so opening it uses the code up.)
  const wrong: CodeState = {
    error: "That code didn't work. Use the newest email's code (opening its link uses the code up), or send a new code.",
    field: "code",
  };

  let user: { id: string; email: string };
  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: code, type: "email" });
    if (error || !data.user?.email) return wrong;
    user = { id: data.user.id, email: data.user.email.toLowerCase() };
    await clearTestUser();
  } else if (devLoginEnabled) {
    if (code !== DEV_CODE) return wrong;
    (await cookies()).set(DEV_COOKIE, email.data, { httpOnly: true, sameSite: "lax", path: "/" });
    user = { id: `dev:${email.data}`, email: email.data };
  } else {
    return { error: "Sign-in isn't set up yet." };
  }
  return signedIn(user, { asAgent: input.asAgent === true });
}

// For testing, while sign-in emails aren't set up (lib/test-sign-in.ts): any
// email and the site's test password, and they're signed in as that email, no
// code. The account already there for the email is theirs, or a new one is.
export async function testSignIn(input: { email: string; password: string; asAgent?: boolean }): Promise<CodeState> {
  if (!testSignInEnabled) return { error: "Test sign-in is off." };
  const email = emailSchema.safeParse(String(input.email ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address.", field: "email" };
  if (!testPasswordMatches(String(input.password ?? ""))) {
    // (Slows guessing.)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: "That isn't the test password.", field: "password" };
  }
  const [existing] = await sql<{ auth_user_id: string }[]>`
    select auth_user_id from accounts where lower(email) = ${email.data} order by created_at limit 1`;
  // (An account the owner made for this email, not yet signed in to, is
  // claimed by this sign-in like any other: lib/auth.ts accountFor.)
  const known = existing && !existing.auth_user_id.startsWith(INVITED_PREFIX) ? existing.auth_user_id : null;
  const user = { id: known ?? `test:${email.data}`, email: email.data };
  // Out of any emailed sign-in on this browser (only here), so it's this one.
  if (supabaseConfigured) await (await createSupabase()).auth.signOut({ scope: "local" });
  await setTestUser(user);
  return signedIn(user, { asAgent: input.asAgent === true });
}

// From "For agents": signing up (or in) as an agent. Kept for half an hour,
// for the email's link (lib/auth.ts claimAgentIntent).
async function signingUpAsAgent(email: string) {
  await sql`
    insert into account_intents (email, role) values (${email}, 'agent')
    on conflict (email) do update set role = excluded.role, created_at = now()`;
}

// Proved to be them, on the form they signed in on: their account (made the
// first time), and what this browser did before becomes its (lib/sign-in.ts,
// the same as the emailed link does). `asAgent`: that form was "For agents",
// so the account is an agent's, new or not (they chose it themselves, with
// the code or the password in hand).
async function signedIn(user: { id: string; email: string }, { asAgent }: { asAgent: boolean }): Promise<CodeState> {
  const { agent, needsName, welcome } = await afterSignIn(user, { asAgent, chosen: true });
  return { done: { agent, needsName, welcome } };
}

// A buyer who sends homes to clients after all: an agent's account, then
// their name and brand.
export async function becomeAgent() {
  const user = await requireUser();
  if (user.role !== "agent") await sql`update accounts set role = 'agent', kind = 'agent' where id = ${user.id}`;
  // The bar is drawn again too: the Dashboard they were just told they'd get
  // is in it when they land, in place of Send.
  refresh();
  redirect("/dashboard");
}

// Signs this browser out, and only this one: their phone, signed in from the
// agent's link, stays signed in. (Supabase's default signs out every device.)
export async function signOut() {
  if (supabaseConfigured) {
    const supabase = await createSupabase();
    await supabase.auth.signOut({ scope: "local" });
  }
  (await cookies()).delete(DEV_COOKIE);
  (await cookies()).delete(VIEW_AS_COOKIE);
  await clearTestUser();
  redirect("/login");
}
