"use client";

import {
  Bookmark,
  BriefcaseBusiness,
  ChevronDown,
  Building2,
  House,
  ListChecks,
  LogOut,
  Shield,
  UserRound,
  UserRoundSearch,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { PorchcardLogo, PorchcardMark } from "@/components/porchcard-logo";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";

// Which page a link is: the one you're on, or the part of the site it's in
// (a client's page is in the dashboard).
function useCurrent(href: string, section: boolean, except?: string) {
  const pathname = usePathname();
  if (pathname === href) return "page" as const;
  // (`except`: a part of it that is a place of its own, with its own link.)
  if (except && (pathname === except || pathname.startsWith(`${except}/`))) return undefined;
  if (section && pathname.startsWith(`${href}/`)) return "true" as const;
  return undefined;
}

// Porchcard's logo, which always goes home: navy on the white header, white
// over the feed (with a soft shadow, for a bright photo). On a narrow phone,
// just the card.
export function SiteLogo({ overlay = false }: { overlay?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-1",
        overlay ? "text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.45)]" : "text-[#062B4C]",
      )}
    >
      <PorchcardLogo className="h-6 w-auto max-[420px]:hidden" />
      <PorchcardMark className="hidden h-7 w-auto max-[420px]:block" />
      <span className="sr-only">Porchcard</span>
    </Link>
  );
}

// Sign in, from the header: back to this page once they're in. Not on the
// sign-in page itself, where it would only lead to where you are.
export function SignInLink({ className }: { className?: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;
  const back = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return (
    <Link href={`/login${back}`} className={className}>
      Sign in
    </Link>
  );
}

// A link in the header that says when it's where you are.
export function NavLink({
  href,
  section = false,
  except,
  className,
  children,
}: {
  href: string;
  section?: boolean;
  except?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-current={useCurrent(href, section, except)} className={className}>
      {children}
    </Link>
  );
}

// You, as your initial over "Me": a tap opens your places and the way to
// sign out. On your own page, or editing it, it's underlined as the bar's
// other places are. It works before scripts load (the browser opens it). It
// closes on a tap anywhere else (which does nothing more than close it), on
// Escape, when the keyboard moves on past it, and when you go somewhere
// from it.
export function AccountMenu({
  profile,
  initial,
  name,
  email,
  agent,
  listings = "Listings",
  admin = false,
  dashboard = false,
  overlay,
  photo,
  links = [],
  rated = false,
}: {
  // Your own page: straight to it once you have one (so it's marked when you're there).
  profile: string;
  initial: string;
  // Your own photo, where you've added one, in place of your initial.
  photo?: string | null;
  name: string;
  email: string;
  agent: boolean;
  // What their own homes are called: "Listings", or an investor's "Deals".
  listings?: string;
  // Runs the site: Admin is in here too.
  admin?: boolean;
  // An agent on someone's link, where there's no bar to hold their
  // Dashboard: it's in here.
  dashboard?: boolean;
  overlay: boolean;
  // Someone on an agent's link: the way back to it ("Homes from Dana").
  links?: { href: string; label: string }[];
  // They've liked or passed on homes an agent sent: Rated homes, where those are.
  rated?: boolean;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Until it's first opened, the browser says whether it is.
  const [open, setOpen] = useState<boolean>();
  const pathname = usePathname();
  // Where you are, when it's your own page (or anything under it, or the
  // pages that are always yours: Edit profile).
  const here =
    pathname === profile || pathname === "/people/me"
      ? ("page" as const)
      : pathname.startsWith(`${profile}/`) || pathname.startsWith("/people/me/")
        ? ("true" as const)
        : undefined;

  const isOpen = () => Boolean(menu.current?.matches(":popover-open"));
  const close = () => {
    if (isOpen()) menu.current?.hidePopover();
  };

  useEffect(() => {
    const el = menu.current;
    if (!el) return;
    const toggled = (event: Event) => setOpen((event as ToggleEvent).newState === "open");
    el.addEventListener("toggle", toggled);
    return () => el.removeEventListener("toggle", toggled);
  }, []);

  // Somewhere new: it's done its job.
  useEffect(() => {
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
  }, [pathname]);

  // A tap outside only closes it, as a phone's own menus do: it doesn't also
  // open the photo or the home that was under it. (A click from the keyboard
  // is never held back.)
  useEffect(() => {
    let swallow = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = (event: PointerEvent) => {
      clearTimeout(timer);
      swallow = Boolean(menu.current?.matches(":popover-open")) && !within(menu.current, trigger.current, event.target);
      // A tap's click follows straight after; a drag or a scroll has none.
      if (swallow) timer = setTimeout(() => (swallow = false), 1000);
    };
    const cancel = () => (swallow = false);
    const click = (event: MouseEvent) => {
      if (!swallow || event.detail === 0) return;
      swallow = false;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("click", click, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("click", click, true);
    };
  }, []);

  // Tab past the last of it (or back before the button): it closes, so
  // what's next is never hidden under it. Focus stays where it went.
  const leave = (event: FocusEvent) => {
    if (!event.relatedTarget || within(menu.current, trigger.current, event.relatedTarget)) return;
    setTimeout(() => {
      if (!within(menu.current, trigger.current, document.activeElement)) close();
    });
  };

  // ↑ and ↓ (and Home, End) move through it, and go no further: the feed
  // behind it stays where it is.
  const arrows = (event: KeyboardEvent) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"];
    if (!keys.includes(event.key) || !isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("a, button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home" || event.key === "PageUp"
        ? 0
        : event.key === "End" || event.key === "PageDown"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (at + 1) % items.length
            : at <= 0
              ? items.length - 1
              : at - 1;
    items[next]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget="account-menu"
        aria-label="Account menu"
        aria-expanded={open}
        aria-current={here}
        onBlur={leave}
        onKeyDown={arrows}
        className={cn(
          // (Your face is a little taller than the others' icons, so it sits
          // closer to its word: the words then run in one line across the bar.)
          "relative flex h-14 min-w-11 shrink-0 flex-col items-center justify-center px-1.5 text-[12px] font-medium leading-none [anchor-name:--account-menu] md:min-w-[4.25rem]",
          // The same line under it as the bar's other places, when you're there.
          "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full",
          overlay
            ? "text-white/85 hover:text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)] [&[aria-current]]:text-white [&[aria-current]]:after:bg-white"
            : "text-stone-600 hover:text-ink [&[aria-current]]:text-ink [&[aria-current]]:after:bg-ink",
        )}
      >
        {/* The face you have everywhere: a buyer's in the brand's colour, an
            agent's in ink. */}
        <Avatar
          name={initial}
          tone={agent ? "agent" : "person"}
          photo={photo}
          size={6}
          className={cn("[text-shadow:none]", overlay && "ring-1 ring-white/30")}
        />
        {/* Under your face, as the other places have their names: small on
            a phone, as theirs are. */}
        <span aria-hidden className="flex items-center whitespace-nowrap text-[10px] tracking-tight md:text-[12px] md:tracking-normal">
          Me
          <ChevronDown className="ml-0.5 size-2.5 md:size-3" />
        </span>
      </button>
      <div
        ref={menu}
        id="account-menu"
        popover="auto"
        data-light
        onBlur={leave}
        onKeyDown={arrows}
        className={cn(
          "m-0 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border-0 bg-white p-1.5 text-ink shadow-[0_12px_40px_rgb(0_0_0/0.22)] ring-1 ring-black/5 [text-shadow:none]",
          // Just under the initial, its right edge in line with it.
          "inset-auto mt-1.5 [position-anchor:--account-menu] top-[anchor(bottom)] right-[anchor(right)]",
          // A browser that can't place it there: under the header, at the right.
          "not-supports-[anchor-name:--a]:top-[calc(3.5rem+env(safe-area-inset-top))] not-supports-[anchor-name:--a]:right-3",
        )}
      >
        <div className="px-3 pb-2 pt-2.5">
          {name && <p className="truncate text-body font-semibold">{name}</p>}
          <p className={cn("truncate", name ? "text-meta text-muted" : "text-body font-semibold")}>{email}</p>
        </div>
        <ul className="border-t border-stone-100 pt-1.5">
          <MenuLink href={profile} icon={<UserRound aria-hidden size={18} />} onGo={close}>
            Your profile
          </MenuLink>
          {/* An agent's own listings: theirs to add to and change, like
              their profile, so here with it and not among their clients. */}
          {agent && (
            <MenuLink href="/dashboard/listings" section icon={<Building2 aria-hidden size={18} />} onGo={close}>
              {listings}
            </MenuLink>
          )}
          {/* Two places the bar has no room for: the homes you saved (only
              you see them), and people, by name (Search's other side). */}
          <MenuLink href="/people/me?show=saved" icon={<Bookmark aria-hidden size={18} />} onGo={close}>
            Saved homes
          </MenuLink>
          <MenuLink href="/search/people" icon={<UserRoundSearch aria-hidden size={18} />} onGo={close}>
            Find people
          </MenuLink>
          {links.map((link) => (
            <MenuLink key={link.href} href={link.href} icon={<House aria-hidden size={18} />} onGo={close}>
              {link.label}
            </MenuLink>
          ))}
          {rated && (
            <MenuLink href="/people/me/rated" icon={<ListChecks aria-hidden size={18} />} onGo={close}>
              Rated homes
            </MenuLink>
          )}
          {/* (Notifications and an agent's Clients aren't repeated here:
              the bar has them by name at every width. Only on someone's
              link, which has no bar, is Clients here.) A buyer who is
              an agent sets up their agent's account from here. */}
          {agent && dashboard && (
            <MenuLink href="/dashboard" section icon={<Users aria-hidden size={18} />} onGo={close}>
              Clients
            </MenuLink>
          )}
          {!agent && (
            <MenuLink href="/for-agents" icon={<BriefcaseBusiness aria-hidden size={18} />} onGo={close}>
              I&apos;m an agent
            </MenuLink>
          )}
          {admin && (
            <MenuLink href="/admin" section icon={<Shield aria-hidden size={18} />} onGo={close}>
              Admin
            </MenuLink>
          )}
        </ul>
        <form action={signOut} className="mt-1.5 border-t border-stone-100 pt-1.5">
          <button type="submit" className={menuItem}>
            <LogOut aria-hidden size={18} className="text-muted" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

// Whether something is in the menu, or is the button that opens it.
function within(menu: HTMLElement | null, trigger: HTMLElement | null, node: EventTarget | null) {
  return node instanceof Node && Boolean(menu?.contains(node) || trigger?.contains(node));
}

const menuItem =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-medium hover:bg-stone-100 [&[aria-current]]:bg-stone-100 [&[aria-current]]:font-semibold";

function MenuLink({
  href,
  section = false,
  icon,
  onGo,
  children,
}: {
  href: string;
  section?: boolean;
  icon: ReactNode;
  onGo: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <Link href={href} aria-current={useCurrent(href, section)} onClick={onGo} className={menuItem}>
        <span className="text-muted">{icon}</span>
        <span>{children}</span>
      </Link>
    </li>
  );
}
