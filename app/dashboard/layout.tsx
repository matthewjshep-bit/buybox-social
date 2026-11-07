import { requireAgent } from "@/lib/auth";
import { DashboardNav } from "./nav";

export const metadata = { title: "Dashboard · BuyBox Social" };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireAgent();
  return (
    <div
      style={{ "--brand": agent.brand_color } as React.CSSProperties}
      // A Scorecard's panel down the right of a wide screen makes room for
      // itself, so nothing on the page sits under it.
      className="min-h-dvh lg:has-[[data-scorecard-docked]]:pr-[29.5rem]"
    >
      {/* A page with two columns on a wide screen (a client's page) asks for
          more room with data-wide. */}
      <div className="mx-auto max-w-3xl px-4 lg:has-[[data-wide]]:max-w-6xl">
        <DashboardNav />
        <main className="pb-6 pt-5">{children}</main>
      </div>
    </div>
  );
}
