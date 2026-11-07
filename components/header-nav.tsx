"use client";

import { Bell, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/format";

// Which page a link is: the one you're on, or the part of the site it's in
// (a client's page is in the dashboard).
function useCurrent(href: string, section: boolean) {
  const pathname = usePathname();
  if (pathname === href) return "page" as const;
  if (section && pathname.startsWith(`${href}/`)) return "true" as const;
  return undefined;
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
// works before scripts load (the browser opens it), closes on a tap anywhere
// else or Escape, and closes when you go somewhere from it.
export function AccountMenu({
  profile,
  initial,
  name,
  email,
  agent,
  unread,
  overlay,
}: {
  // Your own page: straight to it once you have one (so it's marked when you're there).
  profile: string;
  initial: string;
  name: string;
  email: string;
  agent: boolean;
  unread: number;
  overlay: boolean;
}) {
  const menu = useRef<HTMLDivElement>(null);
  // Until it's first opened, the browser says whether it is.
  const [open, setOpen] = useState<boolean>();
  const pathname = usePathname();

  const close = () => {
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
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

  return (
    <>
      <button
        type="button"
        popoverTarget="account-menu"
        aria-label="Your profile"
        aria-expanded={open}
        className="flex size-11 shrink-0 items-center justify-center rounded-full [anchor-name:--account-menu]"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 items-center justify-center rounded-full text-sm font-semibold",
            overlay ? "bg-white/25" : "bg-stone-200 text-ink",
          )}
        >
          {initial}
        </span>
      </button>
      <div
        ref={menu}
        id="account-menu"
        popover="auto"
        data-light
        className={cn(
          "m-0 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border-0 bg-white p-1.5 text-ink shadow-[0_12px_40px_rgb(0_0_0/0.22)] ring-1 ring-black/5",
          // Just under the initial, its right edge in line with it.
          "inset-auto mt-1.5 [position-anchor:--account-menu] top-[anchor(bottom)] right-[anchor(right)]",
          // A browser that can't place it there: under the header, at the right.
          "not-supports-[anchor-name:--a]:top-[calc(3.5rem+env(safe-area-inset-top))] not-supports-[anchor-name:--a]:right-3",
        )}
      >
        <div className="px-3 pb-2 pt-2.5">
          {name && <p className="truncate text-[15px] font-semibold">{name}</p>}
          <p className={cn("truncate", name ? "text-[13px] text-stone-600" : "text-[15px] font-semibold")}>{email}</p>
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
        </ul>
        <form action={signOut} className="mt-1.5 border-t border-stone-100 pt-1.5">
          <button type="submit" className={menuItem}>
            <LogOut aria-hidden size={18} className="text-stone-600" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

const menuItem =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium hover:bg-stone-100 [&[aria-current]]:bg-stone-100 [&[aria-current]]:font-semibold";

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
        <span className="text-stone-600">{icon}</span>
        <span>{children}</span>
        {after}
      </Link>
    </li>
  );
}
