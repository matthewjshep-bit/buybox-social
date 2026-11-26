import { Bell, Flame, House, Search as SearchIcon, Send } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { OnboardingGate } from "@/components/header-gate";
import { AccountMenu, NavLink, SignInLink, SiteLogo } from "@/components/header-nav";
import { NavCount } from "@/components/nav-badge";
import { countUnreadActivity } from "@/lib/activity";
import { countUnreadThreads } from "@/lib/messages";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { agentFirstName, cn } from "@/lib/format";
import { getMyLinks, hasRated, type MyLink } from "@/lib/my-links";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { getPublicIdentity } from "@/lib/public";
import { button } from "@/lib/ui";
import { kindOf, listingWords } from "@/lib/kinds";

// On every page, one bar across the top: the logo, then the same few places
// for everyone signed in (Home, Popular, Search, the bell, and you: your
// face, opening your places and Sign out), each an icon over its name, the
// one you're on underlined. Messages is everyone's. Signed out: For agents,
// and Sign in. Away from the full-screen feed it stays at the top of the
// screen as the page scrolls, as an app's bar does. On a phone the
// names are there too, small, under their icons, and the logo steps aside
// for them (Home does its job). Over the full-screen feed it floats on the
// dark ground, white; only on a phone on its side, where the photo runs
// under it, does it bring its own shade, dark enough behind its words for a
// bright sky, and gone before the sign-up card below it starts.
// When the server drew this bar: once a request (this is a server component,
// drawn once and never again in the browser), so each drawing is told apart.
const drawnAt = () => Date.now();

export async function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(user?.role ? user : null, device);
  const [unread, newMessages, admin, links] = await Promise.all([
    visitor ? countUnreadActivity(visitor.id) : 0,
    // Conversations with something new in them (homes they sent, with something done on them since they looked).
    user?.role ? countUnreadThreads(user.id) : 0,
    isAdmin(user),
    // Someone on an agent's link (a pro too, when they're someone's client):
    // the way back to it, under their initial, and the homes they've rated.
    user?.role ? getMyLinks(user.id) : [],
  ]);
  // When this bar was drawn: a cleared count stays cleared until the next one (NavCount).
  const rendered = drawnAt();
  // Each place in the bar: its icon over its name, at every width (nobody
  // has to guess what two people or a stack of photos mean), and a line
  // under the one you're on.
  // (Its focus ring rounded and inside it, clear of the top of the screen.)
  const navItem = cn(
    "relative flex h-14 min-w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-[12px] font-medium leading-none transition-colors focus-visible:outline-offset-[-4px] md:min-w-[4.75rem]",
    "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full",
    overlay
      ? "text-white/85 hover:text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)] [&[aria-current]]:text-white [&[aria-current]]:after:bg-white"
      : "text-muted hover:text-ink [&[aria-current]]:text-ink [&[aria-current]]:after:bg-ink",
  );
  // The name: small on a phone, so six of them fit across one, each on one line.
  const name = "whitespace-nowrap text-[10px] tracking-tight md:text-[12px] md:tracking-normal";
  const agent = user?.role === "agent";
  const ring = overlay ? "none" : "white";
  // Signed in but not started yet, or part way through getting started (at
  // /welcome): the way out, should it be the wrong account.
  const signOutForm = (
    <form action={signOut}>
      <button type="submit" className="flex min-h-11 items-center rounded-full px-3 transition-colors hover:bg-stone-100">
        Sign out
      </button>
    </form>
  );
  const logo = (hide: boolean) => (
    // (Signed in on a phone, the logo makes room for the places' names:
    // Home, first among them, goes where it went. On a tablet, just its
    // card, so the places in the middle have room beside it.)
    <div className={cn("flex shrink-0 justify-start", hide && "max-md:hidden")}>
      <SiteLogo overlay={overlay} compact={hide} />
    </div>
  );
  const end = "flex min-w-0 items-center gap-0.5 text-sm font-medium md:col-start-3 md:justify-self-end";
  return (
    <header
      className={cn(
        // Clear of a notch, top and sides, now that pages run edge to edge.
        "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]",
        overlay
          ? "text-white short:bg-[linear-gradient(to_bottom,rgb(0_0_0/0.75),rgb(0_0_0/0.6)_55%,rgb(0_0_0/0.25)_80%,transparent)] short:pb-3"
          : // Held at the top as the page scrolls (what else sticks sits
            // under it, at `top-(--header)`).
            "sticky top-0 z-40 border-b border-stone-200 bg-white",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          // The whole width of the window: the logo at its far left, the
          // places in the middle of it (on a phone, where there's no room
          // for a middle, they follow the logo to the right edge).
          "flex h-14 items-center justify-between gap-1 px-3 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-x-4",
          // Over the map, in line with its search field and its photos
          // (HeaderGate says which page wants this).
          "sm:group-data-wide/top:px-4",
        )}
      >
        {user?.role ? (
          <OnboardingGate
            // Getting started: nothing to wander off to half way through.
            onboarding={
              <>
                {logo(false)}
                <div className={end}>{signOutForm}</div>
              </>
            }
          >
            {logo(true)}
            {/* Signed in, the same few places for everyone, across the top:
                Home, Messages, Popular, Search, the bell, and you. Their
                listings aren't part of it: those are under their face. */}
            <div className="flex min-w-0 items-center max-md:flex-1 max-md:justify-between md:gap-1">
              <NavLink href="/" pending className={navItem}>
                <House aria-hidden size={20} />
                <span className={name}>Home</span>
              </NavLink>
              {/* Every home they sent or were sent, as conversations: for everyone. */}
              <NavLink href="/messages" section also="/dashboard/shares" pending className={navItem}>
                <NavCount icon={<Send aria-hidden size={20} />} count={newMessages} label="Messages" ring={ring} />
                <span aria-hidden className={name}>
                  Messages
                </span>
              </NavLink>
              {/* What everyone likes most: homes, and the people liking them. */}
              <NavLink href="/popular" section pending className={navItem}>
                <Flame aria-hidden size={20} />
                <span className={name}>Popular</span>
              </NavLink>
              {/* (The one way to find a home: on the map, by its filters, or
                  one at a time full screen from there. And people too.) */}
              <NavLink href="/search" section pending className={navItem}>
                <SearchIcon aria-hidden size={20} />
                <span className={name}>Search</span>
              </NavLink>
              {/* Everyone signed in has the bell, whether or not anything
                  has happened yet (its page says so), so the bar is the
                  same six places from the first day. Its count is gone on
                  its own page, and after. */}
              <NavLink href="/activity" pending className={navItem}>
                <NavCount
                  icon={<Bell aria-hidden size={20} />}
                  count={unread}
                  label="Notifications"
                  clearOn="/activity"
                  rendered={rendered}
                  ring={ring}
                />
                <span aria-hidden className={name}>
                  Notifications
                </span>
              </NavLink>
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
                rated={hasRated(links)}
              />
            </div>
          </OnboardingGate>
        ) : (
          <>
            {logo(false)}
            <div className={end}>
              {/* Signed out, just two things: the page for agents, and Sign in
                  (which signs up too). The logo is the way home. */}
              {user ? (
                signOutForm
              ) : (
                <>
                  <NavLink
                    href="/for-agents"
                    className={cn(
                      "flex min-h-11 shrink-0 items-center rounded-full px-2.5 transition-colors",
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
          </>
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
