import Link from "next/link";
import { requireAgent } from "@/lib/auth";

export const metadata = { title: "Dashboard · BuyBox Social" };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireAgent();
  return (
    <div style={{ "--brand": agent.brand_color } as React.CSSProperties} className="min-h-dvh">
      <nav aria-label="Dashboard" className="mx-auto flex max-w-3xl gap-1 px-4 pt-3 text-sm font-medium">
        <Link href="/dashboard" className="rounded-lg px-3 py-2.5 hover:bg-stone-200/60">
          Your shares
        </Link>
        <Link href="/dashboard/profile" className="rounded-lg px-3 py-2.5 hover:bg-stone-200/60">
          Your brand
        </Link>
      </nav>
      <main className="mx-auto max-w-3xl px-4 pb-6 pt-2">{children}</main>
    </div>
  );
}
