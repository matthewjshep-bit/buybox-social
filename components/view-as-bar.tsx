import { Eye, Shield } from "lucide-react";
import Link from "next/link";
import { stopViewingAs } from "@/app/admin/actions";
import type { Account } from "@/lib/auth";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// While an admin sees the site as someone else: who, that everything done is
// done as them, and the way back. Along the foot of every page, over the full-
// screen homes too, never in the way of their header.
export function ViewAsBar({ as }: { as: Account }) {
  const name = as.full_name.trim() || as.email;
  return (
    <div
      role="region"
      aria-label="Viewing as someone else"
      className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] flex justify-center px-3"
    >
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-amber-300 px-4 py-2 text-sm text-ink shadow-lg ring-1 ring-amber-500">
        <p className="flex min-w-0 items-center gap-1.5">
          <Eye aria-hidden size={16} className="shrink-0" />
          <span className="min-w-0">
            Viewing as <strong className="font-semibold">{name}</strong> ({as.role === "agent" ? "agent" : "buyer"}).{" "}
            <span className="text-stone-800">Anything you do is done as them.</span>
          </span>
        </p>
        <div className="flex gap-2">
          <Link href="/admin" className={cn(button({ kind: "ghost", flush: true }), "min-h-9 text-ink")}>
            <Shield aria-hidden size={15} /> Admin
          </Link>
          <form action={stopViewingAs}>
            <button type="submit" className={cn(button({ kind: "primary" }), "min-h-9 px-4")}>
              Stop
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
