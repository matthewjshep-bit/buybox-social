import { Bell, Home, Map as MapIcon, Shield } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { AccountMenu, NavLink } from "@/components/header-nav";
import { countUnreadActivity } from "@/lib/activity";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";

// On every page, one header: the logo always goes home; then the map, the
// bell, your dashboard if you send homes, and you (your initial, opening your
// places and Sign out), or Sign in and Sign up. On phones the map and the
// bell are icons, keeping their names for screen readers. The page you're on
// is marked. Over the full-screen feed it floats on the dark ground, white;
// only on a phone on its side, where the photo runs under it, does it bring
// its own shade.
export async function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(user?.role ? user : null, device);
  const [unread, admin] = await Promise.all([
    visitor ? countUnreadActivity(visitor.id) : 0,
    isAdmin(user),
  ]);
  const navItem = cn(
    "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5",
    overlay
      ? "hover:bg-white/15 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)] [&[aria-current]]:bg-white/15"
      : "hover:bg-stone-100 [&[aria-current]]:bg-stone-100 [&[aria-current]]:text-ink",
  );
  return (
    <header
      className={cn(
        // Clear of a notch, top and sides, now that pages run edge to edge.
        "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]",
        overlay
          ? "text-white short:bg-linear-to-b short:from-black/55 short:via-black/25 short:to-transparent short:pb-6"
          : "border-b border-stone-200 bg-white",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6",
          // Side by side, edge to edge: the logo over the photo's left edge,
          // you over the white panel's right edge.
          overlay && "split:max-w-none split:px-6",
        )}
      >
        <Link
          href="/"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl font-display text-lg font-semibold"
        >
          <span
            aria-hidden
            className={cn(
              "flex size-9 items-center justify-center rounded-xl bg-brand text-white",
              overlay && "ring-1 ring-white/30",
            )}
          >
            <Home size={18} />
          </span>
          <span className="max-[420px]:sr-only">BuyBox Social</span>
        </Link>
        <div className="flex min-w-0 items-center gap-0.5 text-sm font-medium">
          {/* On phones the logo is the way home. */}
          <NavLink href="/" className={`${navItem} hidden md:flex`}>
            Home
          </NavLink>
          <NavLink href="/search" className={navItem}>
            <MapIcon aria-hidden size={18} />
            <span className="sr-only md:not-sr-only">Map</span>
          </NavLink>
          {!user && (
            <NavLink href="/for-agents" className={`${navItem} hidden md:flex`}>
              For agents
            </NavLink>
          )}
          {visitor && (
            <NavLink href="/activity" className={`${navItem} relative`}>
              <Bell aria-hidden size={18} />
              <span className="sr-only">
                Activity{unread > 0 && `, ${unread} new`}
              </span>
              {unread > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-[18px] text-white tabular-nums [text-shadow:none]"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </NavLink>
          )}
          {admin && (
            <NavLink href="/admin" section className={navItem}>
              <Shield aria-hidden size={18} className="md:hidden" />
              <span className="sr-only md:not-sr-only">Admin</span>
            </NavLink>
          )}
          {user?.role === "agent" && (
            // In words on phones too: it's where an agent's work is.
            <NavLink href="/dashboard" section className={navItem}>
              Dashboard
            </NavLink>
          )}
          {user?.role ? (
            <AccountMenu
              profile={visitor ? `/people/${visitor.id}` : "/people/me"}
              initial={(user.full_name.trim() || user.email)[0]?.toUpperCase() ?? ""}
              name={user.full_name.trim()}
              email={user.email}
              agent={user.role === "agent"}
              unread={unread}
              overlay={overlay}
            />
          ) : user ? (
            <form action={signOut}>
              <button type="submit" className={navItem}>
                Sign out
              </button>
            </form>
          ) : (
            <>
              <NavLink href="/login" className={navItem}>
                Sign in
              </NavLink>
              <Link
                href="/login"
                className="ml-1 flex min-h-11 shrink-0 items-center rounded-full bg-brand px-4 font-semibold text-white"
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
