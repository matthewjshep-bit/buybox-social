"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { claimAgentIntent, DEV_COOKIE, devLoginEnabled, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { appUrl } from "@/lib/format";
import { createSupabase, supabaseConfigured } from "@/lib/supabase/server";

export type LoginState = { error?: string; sent?: boolean };

const emailSchema = z.email().max(254);

// Emails a sign-in link, or signs straight in locally. Agents land on their
// dashboard (which first asks for their name and brand); everyone else, the feed.
async function sendSignInLink(email: string): Promise<LoginState> {
  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${appUrl()}/auth/callback` },
    });
    if (error) {
      console.error("[auth] sign-in email failed", error.message);
      return { error: "We couldn't send your sign-in link. Please try again." };
    }
    return { sent: true };
  }

  if (devLoginEnabled) {
    (await cookies()).set(DEV_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/" });
    redirect((await claimAgentIntent(email)) ? "/dashboard" : "/");
  }

  return { error: "Sign-in isn't set up yet." };
}

export async function requestSignIn(_: LoginState, form: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address." };
  // From "For agents": they're signing up as an agent, which applies once
  // they've signed in.
  if (form.get("as") === "agent") {
    await sql`
      insert into account_intents (email, role) values (${email.data}, 'agent')
      on conflict (email) do update set role = excluded.role, created_at = now()`;
  }
  return sendSignInLink(email.data);
}

// A buyer who sends homes to clients after all: an agent's account, then
// their name and brand.
export async function becomeAgent() {
  const user = await requireUser();
  if (user.role !== "agent") await sql`update accounts set role = 'agent' where id = ${user.id}`;
  redirect("/dashboard");
}

export type SignUpField = "fullName" | "phone" | "email";
export type SignUpState = LoginState & {
  // Which field to fix, and what was typed, so nothing has to be typed again.
  field?: SignUpField;
  values?: Record<SignUpField, string>;
  email?: string;
};

// The home page's form: a name, a phone number and an email. They're saved
// straight away, then the sign-in link goes out like any other.
export async function signUp(_: SignUpState, form: FormData): Promise<SignUpState> {
  const values = {
    fullName: String(form.get("fullName") ?? "").replace(/\s+/g, " ").trim(),
    phone: String(form.get("phone") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
  };
  const digits = values.phone.replace(/\D/g, "");
  if (!values.fullName || values.fullName.length > 80) {
    return { error: "Please add your name.", field: "fullName", values };
  }
  if (values.phone.length > 30 || digits.length < 10 || digits.length > 15) {
    return { error: "Please add your phone number, with the area code.", field: "phone", values };
  }
  if (!emailSchema.safeParse(values.email).success) {
    return { error: "Please enter a valid email address.", field: "email", values };
  }

  await sql`
    insert into signups (email, full_name, phone)
    values (${values.email}, ${values.fullName}, ${values.phone})
    on conflict (email) do update
      set full_name = excluded.full_name, phone = excluded.phone, updated_at = now()`;

  const result = await sendSignInLink(values.email);
  return result.error ? { ...result, values } : { ...result, email: values.email };
}

export async function signOut() {
  if (supabaseConfigured) {
    const supabase = await createSupabase();
    await supabase.auth.signOut();
  }
  (await cookies()).delete(DEV_COOKIE);
  redirect("/login");
}
