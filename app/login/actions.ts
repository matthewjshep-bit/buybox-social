"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEV_COOKIE, devLoginEnabled } from "@/lib/auth";
import { appUrl } from "@/lib/format";
import { createSupabase, supabaseConfigured } from "@/lib/supabase/server";

export type LoginState = { error?: string; sent?: boolean };

const emailSchema = z.email().max(254);

export async function requestSignIn(_: LoginState, form: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address." };

  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: { emailRedirectTo: `${appUrl()}/auth/callback` },
    });
    if (error) {
      console.error("[auth] sign-in email failed", error.message);
      return { error: "We couldn't send your sign-in link. Please try again." };
    }
    return { sent: true };
  }

  if (devLoginEnabled) {
    (await cookies()).set(DEV_COOKIE, email.data, { httpOnly: true, sameSite: "lax", path: "/" });
    redirect("/dashboard");
  }

  return { error: "Sign-in isn't set up yet." };
}

export async function signOut() {
  if (supabaseConfigured) {
    const supabase = await createSupabase();
    await supabase.auth.signOut();
  }
  (await cookies()).delete(DEV_COOKIE);
  redirect("/login");
}
