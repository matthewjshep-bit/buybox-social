"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tab } from "@/lib/ui";

const LINKS = [
  { href: "/dashboard", label: "Clients" },
  { href: "/dashboard/links", label: "Links" },
  { href: "/dashboard/listings", label: "Listings" },
];

// The dashboard's three places, as tabs with a line under the one you're in:
// the same tabs a profile's sections are (`tab`, lib/ui.ts). Only on those three pages: a client's
// page, a link's, sending homes and a listing's each have their own way back
// (or their own steps), and don't need a second row above it.
export function DashboardNav() {
  const pathname = usePathname();
  if (!LINKS.some((link) => link.href === pathname)) return null;
  return (
    <div className="mt-1 flex items-end border-b border-stone-200">
      <nav aria-label="Dashboard" className="-mb-px flex gap-1">
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
