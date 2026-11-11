"use client";

import { Bell, LayoutDashboard, LogOut, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { PorchcardLogo, PorchcardMark } from "@/components/porchcard-logo";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";

// Which page a link is: the one you're on, or the part of the site it's in
// (a client's page is in the dashboard).
function useCurrent(href: string, section: boolean) {
  const pathname = usePathname();
  if (pathname === href) return "page" as const;
  if (section && pathname.startsWith(`${href}/`)) return "true" as const;
  return undefined;
}

// Porchcard's logo, which always goes home: navy on the white header, white
// over the feed (with a soft shadow, for a bright photo). On a narrow phone,
// just the house with its heart.
export function SiteLogo({ overlay = false }: { overlay?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-1",
        overlay ? "text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.45)]" : "text-[#052747]",
      )}
    >
      <PorchcardLogo className="h-7 w-auto max-[420px]:hidden" />
      <PorchcardMark className="hidden h-8 w-auto max-[420px]:block" />
      <span className="sr-only">Porchcard</span>
    </Link>
  );
}

// A link in the header that says when it's where you are.
export function NavLink({
  href,
  section = false,
  className,
  children,
}: {
  href: string;
  section?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-current={useCurrent(href, section)} className={className}>
      {children}
    </Link>
  );
}

// You, as your initial: a tap opens your places and the way to sign out. It
// works before scripts load (the browser opens it). It closes on a tap
// anywhere else (which does nothing more than close it), on Escape, when
// the keyboard moves on past it, and when you go somewhere from it.
export function AccountMenu({
  profile,
  initial,
  name,
  email,
  agent,
  admin = false,
  unread,
  overlay,
}: {
  // Your own page: straight to it once you have one (so it's marked when you're there).
  profile: string;
  initial: string;
  name: string;
  email: string;
  agent: boolean;
  // Runs the site: Admin is in here too.
  admin?: boolean;
  unread: number;
  overlay: boolean;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Until it's first opened, the browser says whether it is.
  const [open, setOpen] = useState<boolean>();
  const pathname = usePathname();

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
        aria-label="Your profile"
        aria-expanded={open}
        onBlur={leave}
        onKeyDown={arrows}
        className="flex size-11 shrink-0 items-center justify-center rounded-full [anchor-name:--account-menu]"
      >
        {/* The face you have everywhere: a buyer's in the brand's colour, an
            agent's in ink. */}
        <Avatar
          name={initial}
          tone={agent ? "agent" : "person"}
          className={cn("[text-shadow:none]", overlay && "ring-1 ring-white/30")}
        />
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
          <MenuLink
            href="/activity"
            icon={<Bell aria-hidden size={18} />}
            onGo={close}
            after={
              unread > 0 && (
                <span aria-hidden className="ml-auto rounded-full bg-rose-600 px-2 text-[12px] font-bold leading-5 text-white tabular-nums">
                  {unread > 9 ? "9+" : unread}
                </span>
              )
            }
          >
            Activity
            {unread > 0 && <span className="sr-only">{`, ${unread} new`}</span>}
          </MenuLink>
          {agent && (
            <MenuLink href="/dashboard" section icon={<LayoutDashboard aria-hidden size={18} />} onGo={close}>
              Dashboard
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
  after,
  children,
}: {
  href: string;
  section?: boolean;
  icon: ReactNode;
  onGo: () => void;
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li>
      <Link href={href} aria-current={useCurrent(href, section)} onClick={onGo} className={menuItem}>
        <span className="text-muted">{icon}</span>
        <span>{children}</span>
        {after}
      </Link>
    </li>
  );
}
