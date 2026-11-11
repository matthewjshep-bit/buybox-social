import { Bell, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { AccountMenu, NavLink, SiteLogo } from "@/components/header-nav";
import { countUnreadActivity } from "@/lib/activity";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";
import { button } from "@/lib/ui";

// On every page, one header: the logo always goes home; then the map, the
// bell, your dashboard if you send homes, and you (your initial, opening your
// places and Sign out), or Sign in and Sign up. On phones the map and the
// bell are icons, keeping their names for screen readers. The page you're on
// is marked. Over the full-screen feed it floats on the dark ground, white;
// only on a phone on its side, where the photo runs under it, does it bring
// its own shade, dark enough behind its words for a bright sky, and gone
// before the sign-up card below it starts.
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
      ? // Marked with a darker fill and an edge, never a lighter one behind white words.
        "hover:bg-white/15 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)] [&[aria-current]]:bg-black/35 [&[aria-current]]:ring-1 [&[aria-current]]:ring-white/50"
      : "hover:bg-stone-100 [&[aria-current]]:bg-stone-100 [&[aria-current]]:text-ink",
  );
  return (
    <header
      className={cn(
        // Clear of a notch, top and sides, now that pages run edge to edge.
        "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]",
        overlay
          ? "text-white short:bg-[linear-gradient(to_bottom,rgb(0_0_0/0.75),rgb(0_0_0/0.6)_55%,rgb(0_0_0/0.25)_80%,transparent)] short:pb-3"
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
          // Over the map, which runs edge to edge, in line with its search
          // field and its photos (HeaderGate says which page wants this).
          "group-data-wide/top:max-w-none sm:group-data-wide/top:px-4",
        )}
      >
        <SiteLogo overlay={overlay} />
        <div className="flex min-w-0 items-center gap-0.5 text-sm font-medium">
          {/* Signed out, just two things: the page for agents, and Sign in
              (which signs up too). The logo is the way home. */}
          {/* Signed in: Search, the bell, and you (where everything else is:
              your profile, Activity, the Dashboard, Admin). The logo is the
              way home. */}
          {user && (
            <NavLink href="/search" className={navItem}>
              <SearchIcon aria-hidden size={18} />
              <span className="sr-only md:not-sr-only">Search</span>
            </NavLink>
          )}
          {!user && (
            <NavLink href="/for-agents" className={navItem}>
              For agents
            </NavLink>
          )}
          {user && visitor && (
            <NavLink href="/activity" className={`${navItem} relative`}>
              <Bell aria-hidden size={18} />
              <span className="sr-only">
                Activity{unread > 0 && `, ${unread} new`}
              </span>
              {unread > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-tiny font-bold leading-[18px] text-white tabular-nums [text-shadow:none]"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </NavLink>
          )}
          {user?.role ? (
            <AccountMenu
              profile={visitor ? `/people/${visitor.id}` : "/people/me"}
              initial={(user.full_name.trim() || user.email)[0]?.toUpperCase() ?? ""}
              name={user.full_name.trim()}
              email={user.email}
              agent={user.role === "agent"}
              admin={admin}
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
            // The one thing to do, so it's the button.
            <Link href="/login" className={cn(button({ kind: "primary" }), "ml-1 shrink-0")}>
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
