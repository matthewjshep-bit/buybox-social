import { Bell, Flame, House, Search as SearchIcon, Send, Users } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { AccountMenu, NavLink, SignInLink, SiteLogo } from "@/components/header-nav";
import { countUnreadActivity } from "@/lib/activity";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { agentFirstName, cn } from "@/lib/format";
import { getMyLinks, type MyLink } from "@/lib/my-links";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { getPublicIdentity } from "@/lib/public";
import { button } from "@/lib/ui";
import { kindOf, listingWords } from "@/lib/kinds";

// On every page, one bar across the top: the logo, then the same few places
// for everyone signed in (Home, Popular, Search, the bell, and you: your
// face, opening your places and Sign out), each an icon over its name, the
// one you're on underlined. An agent has Clients (everyone they've sent homes to) there;
// anyone else, Send. Signed out: For agents, and Sign in. On a phone the
// names are there too, small, under their icons, and the logo steps aside
// for them (Home does its job). Over the full-screen feed it floats on the
// dark ground, white; only on a phone on its side, where the photo runs
// under it, does it bring its own shade, dark enough behind its words for a
// bright sky, and gone before the sign-up card below it starts.
export async function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(user?.role ? user : null, device);
  const [unread, admin, links] = await Promise.all([
    visitor ? countUnreadActivity(visitor.id) : 0,
    isAdmin(user),
    // Someone on an agent's link: the way back to it, under their initial.
    user?.role && user.role !== "agent" ? getMyLinks(user.id) : [],
  ]);
  // Each place in the bar: its icon over its name, at every width (nobody
  // has to guess what two people or a stack of photos mean), and a line
  // under the one you're on.
  const navItem = cn(
    "relative flex h-14 min-w-11 shrink-0 flex-col items-center justify-center gap-1 px-1.5 text-[12px] font-medium leading-none md:min-w-[4.75rem]",
    "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full",
    overlay
      ? "text-white/85 hover:text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)] [&[aria-current]]:text-white [&[aria-current]]:after:bg-white"
      : "text-stone-600 hover:text-ink [&[aria-current]]:text-ink [&[aria-current]]:after:bg-ink",
  );
  // The name: small on a phone, so six of them fit across one, each on one line.
  const name = "whitespace-nowrap text-[10px] tracking-tight md:text-[12px] md:tracking-normal";
  const agent = user?.role === "agent";
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
          // The whole width of the window: the logo at its far left, the
          // places in the middle of it (on a phone, where there's no room
          // for a middle, they follow the logo to the right edge).
          "flex h-14 items-center justify-between gap-1 px-3 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr]",
          // Over the map, in line with its search field and its photos
          // (HeaderGate says which page wants this).
          "sm:group-data-wide/top:px-4",
        )}
      >
        {/* (Signed in on a phone, the logo makes room for the places' names:
            Home, first among them, goes where it went.) */}
        <div className={cn("flex shrink-0 justify-start", user?.role && "max-md:hidden")}>
          <SiteLogo overlay={overlay} />
        </div>
        {/* Signed in, the same few places for everyone, across the top: Home,
            Popular, Search, the bell, and you. An agent has Clients
            (everyone they've sent homes to, and the links they went on) in
            place of Send, which is in it. Their listings aren't part of it:
            those are under their face. */}
        {user?.role ? (
          <div className="flex min-w-0 items-center max-md:flex-1 max-md:justify-between md:gap-1">
            <NavLink href="/" className={navItem}>
              <House aria-hidden size={20} />
              <span className={name}>Home</span>
            </NavLink>
            {agent && (
              <NavLink href="/dashboard" section except="/dashboard/listings" className={navItem}>
                <Users aria-hidden size={20} />
                <span className={name}>Clients</span>
              </NavLink>
            )}
            {/* What everyone likes most: homes, and the people liking them. */}
            <NavLink href="/popular" section className={navItem}>
              <Flame aria-hidden size={20} />
              <span className={name}>Popular</span>
            </NavLink>
            {/* (The one way to find a home: on the map, by its filters, or
                one at a time full screen from there. And people too.) */}
            <NavLink href="/search" section className={navItem}>
              <SearchIcon aria-hidden size={20} />
              <span className={name}>Search</span>
            </NavLink>
            {!agent && (
              <NavLink href="/send" section className={navItem}>
                <Send aria-hidden size={20} />
                <span className={name}>Send</span>
              </NavLink>
            )}
            {visitor && (
              <NavLink href="/activity" className={navItem}>
                <span className="relative">
                  <Bell aria-hidden size={20} />
                  {unread > 0 && (
                    <span
                      aria-hidden
                      className="absolute -right-2.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-tiny font-bold leading-[18px] text-white tabular-nums [text-shadow:none]"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                {/* (Its name whole for a screen reader, with how many are new; on screen, the word.) */}
                <span className="sr-only">{unread > 0 ? `Notifications, ${unread} new` : "Notifications"}</span>
                <span aria-hidden className={name}>
                  Notifications
                </span>
              </NavLink>
            )}
            <AccountMenu
              profile={visitor ? `/people/${visitor.id}` : "/people/me"}
              photo={visitor ? photoUrl(visitor.id, photoVersion(user.photo_data_url)) : user.photo_data_url}
              initial={(user.full_name.trim() || user.email)[0]?.toUpperCase() ?? ""}
              name={user.full_name.trim()}
              email={user.email}
              agent={agent}
              listings={listingWords(kindOf(user)).Many}
              admin={admin}
              overlay={overlay}
              links={menuLinks(links)}
            />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-0.5 text-sm font-medium md:col-start-3 md:justify-self-end">
            {/* Signed out, just two things: the page for agents, and Sign in
                (which signs up too). The logo is the way home. */}
            {user ? (
              <form action={signOut}>
                <button type="submit" className="flex min-h-11 items-center rounded-full px-3 hover:bg-stone-100">
                  Sign out
                </button>
              </form>
            ) : (
              <>
                <NavLink
                  href="/for-agents"
                  className={cn(
                    "flex min-h-11 shrink-0 items-center rounded-full px-2.5",
                    overlay ? "hover:bg-white/15 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]" : "hover:bg-stone-100 [&[aria-current]]:bg-stone-100",
                  )}
                >
                  For agents
                </NavLink>
                {/* The one thing to do, so it's the button. */}
                <SignInLink className={cn(button({ kind: "primary" }), "ml-1 shrink-0")} />
              </>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}

// The links someone is on, as the menu offers them: one per agent (their
// newest), two at most.
function menuLinks(links: MyLink[]) {
  const seen = new Set<string>();
  return links
    .map((link) => ({ href: `/s/${link.token}`, label: `Homes from ${agentFirstName(link.agent.firstName || link.agent.name)}` }))
    .filter((link) => !seen.has(link.label) && Boolean(seen.add(link.label)))
    .slice(0, 2);
}
