"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const LINKS = [
  { href: "/dashboard", label: "Your links" },
  { href: "/dashboard/profile", label: "Your brand" },
];

// The dashboard's two places. A client's page and a new link count as part
// of "Your links". The one you're in is marked the way the header marks the
// page you're on: a soft grey pill, in ink.
export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 pt-3 text-sm font-medium">
      {LINKS.map(({ href, label }) => {
        const here = pathname === href;
        const within = here || (href === "/dashboard" && !pathname.startsWith("/dashboard/profile"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={here ? "page" : within ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full px-4",
              // Marked quietly, so the page's own buttons lead.
              within ? "bg-stone-200 font-semibold text-ink" : "text-stone-700 hover:bg-stone-200/60",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
