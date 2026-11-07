"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const LINKS = [
  { href: "/dashboard", label: "Your shares" },
  { href: "/dashboard/profile", label: "Your brand" },
];

// The dashboard's two places. A client's page and a new share count as part
// of "Your shares".
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
              within ? "bg-ink text-white" : "text-stone-700 hover:bg-stone-200/60",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
