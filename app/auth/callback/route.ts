import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { accountFor, claimAgentIntent, nameFromSignUp, sitePath } from "@/lib/auth";
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
      // Back to the page they started on (an agent's link, say), if it's on this site.
      const next = sitePath(searchParams.get("next"));
      const proved = data?.user?.email ? { id: data.user.id, email: data.user.email.toLowerCase() } : null;
      if (!proved) return NextResponse.redirect(new URL(next ?? "/", here));
      // Their account, made now if this is their first time: an agent's only
      // when this email asked for that on "For agents" in the last half hour.
      // One already there stays what it is, whatever was typed since.
      const asked = await claimAgentIntent(proved.email);
      const account = await accountFor(proved, asked ? "agent" : "buyer");
      const fullName = await nameFromSignUp(account);
      const agent = account.role === "agent";
      // An agent, with nowhere else asked for: straight to their dashboard.
      const to = next ?? (agent ? "/dashboard" : "/");
      // A buyer with no name yet (they asked from the sign-in page, which
      // takes only an email): their first name first, then on (the sign-in
      // page asks, for anyone signed in with none).
      if (!agent && !fullName.trim()) {
        return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(to)}`, here));
      }
      return NextResponse.redirect(new URL(to, here));
    }
    console.error("[auth] callback failed", error.message);
  }
  return NextResponse.redirect(new URL("/login?error=link", here));
}
