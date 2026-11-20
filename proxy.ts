import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the signed-in person's Supabase session fresh. Every page shows who is
// signed in, so this runs everywhere except static files (and the API).
//
// It also notes the page asked for, as `x-path` on the request the pages see:
// someone stopped at a page that takes an account is sent to sign in, and
// then back to it (lib/auth.ts signInPath). Set on every way out of here, so
// it's always this request's own address, never one a browser sent along.
export async function proxy(request: NextRequest) {
  // (Without the `_rsc` a tap on a link adds: it's the router's, not the page's.)
  const asked = request.nextUrl.clone();
  asked.searchParams.delete("_rsc");
  const path = request.nextUrl.searchParams.has("_rsc")
    ? `${asked.pathname}${asked.search}`
    : `${request.nextUrl.pathname}${request.nextUrl.search}`;
  // On to the page, with the request's headers as they are now (its cookies too).
  const onward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-path", path);
    return NextResponse.next({ request: { headers } });
  };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return onward();

  let response = onward();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = onward();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers ?? {})) {
          response.headers.set(name, value);
        }
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

// Not the API (/api/v1, and the owner's /api/admin/v1): it knows a request
// only by its key, never a session, so there's no session to keep fresh
// there, and no cookie should ever come back on its answers.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sample/|api/v1/|api/admin/).*)"],
};
