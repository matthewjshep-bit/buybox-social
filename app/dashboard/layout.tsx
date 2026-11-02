import Link from "next/link";
import { requireAgent } from "@/lib/auth";
import { signOut } from "../login/actions";

export const metadata = { title: "Dashboard · BuyBox Social" };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireAgent();
  return (
    <div style={{ "--brand": agent.brand_color } as React.CSSProperties} className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
          <Link href="/dashboard" className="py-2 font-display text-lg font-semibold">
            BuyBox Social
          </Link>
          <div className="flex items-center text-sm font-medium">
            <Link href="/dashboard/profile" className="rounded-lg px-3 py-2.5">
              Profile
            </Link>
            <form action={signOut}>
              <button type="submit" className="rounded-lg px-3 py-2.5">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
