import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/format";
import { createSupabase, supabaseConfigured } from "@/lib/supabase/server";

// Where the emailed sign-in link lands. `token_hash` also works when the link is
// opened in a different browser from the one that requested it, such as an email
// app's built-in browser; `code` does not. See the README's email template step.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error("missing sign-in parameters") };
    if (!error) return NextResponse.redirect(new URL("/dashboard", appUrl()));
    console.error("[auth] callback failed", error.message);
  }
  return NextResponse.redirect(new URL("/login?error=link", appUrl()));
}
