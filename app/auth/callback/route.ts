import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { claimAgentIntent, sitePath } from "@/lib/auth";
import { afterSignIn } from "@/lib/sign-in";
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
  // Back to the page they started on (an agent's link, say), if it's on this site.
  const next = sitePath(searchParams.get("next"));

  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { data, error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { data: null, error: new Error("missing sign-in parameters") };
    if (!error) {
      const proved = data?.user?.email ? { id: data.user.id, email: data.user.email.toLowerCase() } : null;
      if (!proved) return NextResponse.redirect(new URL(next ?? "/", here));
      // Their account, made now if this is their first time: an agent's only
      // when this email asked for that on "For agents" in the last half hour.
      // One already there stays what it is, whatever was typed since. And,
      // the same as typing the code: what this browser did before (a place
      // on an agent's link, a name) becomes the account's (lib/sign-in.ts).
      const asked = await claimAgentIntent(proved.email);
      const { account, agent, needsName, welcome } = await afterSignIn(proved, { asAgent: asked, chosen: false });
      // New here (they haven't said what they are), or a buyer with no
      // name yet: asked a step at a time, then on. Anyone else: straight on
      // to the page they started on, or Home (agents too: Clients is a tap away).
      if (welcome || needsName) {
        const asked = new URLSearchParams({ ...(next && { next }), ...(agent && !account.kind && { as: "agent" }) });
        return NextResponse.redirect(new URL(`/welcome${asked.size ? `?${asked}` : ""}`, here));
      }
      return NextResponse.redirect(new URL(next ?? "/", here));
    }
    console.error("[auth] callback failed", error.message);
  }
  // The link didn't work (used up, or too old): the sign-in page says so, and
  // a new code from there still brings them back to the page they started on.
  const retry = new URLSearchParams({ error: "link", ...(next && { next }) });
  return NextResponse.redirect(new URL(`/login?${retry}`, here));
}
