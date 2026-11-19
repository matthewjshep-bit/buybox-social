"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tab } from "@/lib/ui";

const LINKS = [
  { href: "/dashboard", label: "Clients" },
  { href: "/dashboard/links", label: "Links" },
];

// Clients, in the bar, is two places: the people an agent has sent homes to,
// and the links those went on. Tabs with a line under the one you're in: the
// same tabs a profile's sections are (`tab`, lib/ui.ts). Only on those two
// pages: a client's page, a link's and sending homes each have their own way
// back (or their own steps), and don't need a second row above it. (An
// agent's listings aren't here: they're under their face, with their profile.)
export function DashboardNav() {
  const pathname = usePathname();
  if (!LINKS.some((link) => link.href === pathname)) return null;
  return (
    <div className="mt-1 flex items-end border-b border-stone-200">
      <nav aria-label="Clients" className="-mb-px flex gap-1">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={tab(pathname === href)}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
