import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { claimAgentIntent } from "@/lib/auth";
import { safeNext } from "@/app/login/actions";
import { siteOrigin } from "@/lib/site";
import { createSupabase, supabaseConfigured } from "@/lib/supabase/server";

// Where the emailed sign-in link lands. `token_hash` also works when the link is
// opened in a different browser from the one that requested it, such as an email
// app's built-in browser; `code` does not. See the README's email template step.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // (Back to this address, where they're now signed in.)
  const here = await siteOrigin();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { data, error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { data: null, error: new Error("missing sign-in parameters") };
    if (!error) {
      // Signed up through "For agents": straight to their dashboard.
      const email = data?.user?.email?.toLowerCase();
      const agent = email ? await claimAgentIntent(email) : false;
      // Back to the page they started on (an agent's link, say), if it's on this site.
      const next = await safeNext(searchParams.get("next"));
      return NextResponse.redirect(new URL(next ?? (agent ? "/dashboard" : "/"), here));
    }
    console.error("[auth] callback failed", error.message);
  }
  return NextResponse.redirect(new URL("/login?error=link", here));
}
