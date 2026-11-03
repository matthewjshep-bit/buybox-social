import { Home, Search } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { firstName, getCurrentUser } from "@/lib/auth";

// On every page: the logo always goes home, whatever page you're on.
export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-stone-200 bg-white">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-display text-lg font-semibold">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <Home size={17} />
          </span>
          BuyBox Social
        </Link>
        <div className="flex items-center gap-1 text-sm font-medium">
          <Link href="/search" className="flex items-center gap-1.5 rounded-lg px-3 py-2.5">
            <Search aria-hidden size={16} />
            <span className="sr-only sm:not-sr-only">Search homes</span>
          </Link>
          {user?.role ? (
            <>
              {user.role === "agent" && (
                <Link href="/dashboard" className="rounded-lg px-3 py-2.5">
                  Dashboard
                </Link>
              )}
              <span
                aria-hidden
                className="mx-1 flex size-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold"
              >
                {firstName(user)[0]?.toUpperCase()}
              </span>
              <form action={signOut}>
                <button type="submit" className="rounded-lg px-3 py-2.5">
                  Sign out
                </button>
              </form>
            </>
          ) : user ? (
            <form action={signOut}>
              <button type="submit" className="rounded-lg px-3 py-2.5">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2.5">
                Sign in
              </Link>
              <Link href="/login" className="flex min-h-11 items-center rounded-lg bg-brand px-3 font-semibold text-white">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
