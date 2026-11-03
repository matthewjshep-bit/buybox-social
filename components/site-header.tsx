import { Bell, Home, LayoutDashboard, LogOut, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { countUnreadActivity } from "@/lib/activity";
import { firstName, getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";

// On every page: the logo always goes home, whatever page you're on. On phones
// the links shrink to icons, keeping their names for screen readers. Over the
// full-screen feed it floats, white on a soft shadow.
export async function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(user?.role ? user : null, device);
  const unread = visitor ? await countUnreadActivity(visitor.id) : 0;
  const navItem = cn(
    "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5",
    overlay ? "hover:bg-white/15 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]" : "hover:bg-stone-100",
  );
  return (
    <header
      className={
        overlay
          ? "bg-linear-to-b from-black/55 via-black/25 to-transparent pb-6 pt-[env(safe-area-inset-top)] text-white"
          : "border-b border-stone-200 bg-white"
      }
    >
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
        <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 font-display text-lg font-semibold">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <Home size={17} />
          </span>
          <span className="max-[420px]:sr-only">BuyBox Social</span>
        </Link>
        <div className="flex items-center gap-0.5 text-sm font-medium">
          {/* On phones the logo is the way home. */}
          <Link href="/" className={`${navItem} hidden md:flex`}>
            Home
          </Link>
          <Link href="/search" className={navItem}>
            <MapIcon aria-hidden size={18} />
            <span className="sr-only md:not-sr-only">Map</span>
          </Link>
          {visitor && (
            <Link href="/activity" className={`${navItem} relative`}>
              <Bell aria-hidden size={18} />
              <span className="sr-only">
                Activity{unread > 0 && `, ${unread} new`}
              </span>
              {unread > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-[18px] text-white tabular-nums"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
          {user?.role ? (
            <>
              {user.role === "agent" && (
                <Link href="/dashboard" className={navItem}>
                  <LayoutDashboard aria-hidden size={18} className="md:hidden" />
                  <span className="sr-only md:not-sr-only">Dashboard</span>
                </Link>
              )}
              <Link
                href="/people/me"
                aria-label="Your profile"
                className={cn(
                  "mx-1 flex size-9 items-center justify-center rounded-full text-sm font-semibold",
                  overlay ? "bg-white/25" : "bg-stone-200",
                )}
              >
                {firstName(user)[0]?.toUpperCase()}
              </Link>
              <form action={signOut}>
                <button type="submit" className={navItem}>
                  <LogOut aria-hidden size={18} className="sm:hidden" />
                  <span className="sr-only sm:not-sr-only">Sign out</span>
                </button>
              </form>
            </>
          ) : user ? (
            <form action={signOut}>
              <button type="submit" className={navItem}>
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/for-agents" className={`${navItem} hidden md:flex`}>
                For agents
              </Link>
              <Link href="/login" className={`${navItem} hidden sm:flex`}>
                Sign in
              </Link>
              <Link
                href="/login"
                className="ml-1 flex min-h-11 items-center rounded-lg bg-brand px-3 font-semibold text-white"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
