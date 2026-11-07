import { requireAgent } from "@/lib/auth";
import { DashboardNav } from "./nav";

export const metadata = { title: "Dashboard · BuyBox Social" };

// The agent's own colour is set around this and the header together, so the
// logo is theirs too (BrandScope, app/layout.tsx).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAgent();
  return (
    <div className="min-h-dvh">
      {/* A page with two columns on a wide screen (a client's page) asks for
          more room with data-wide. */}
      <div className="mx-auto max-w-3xl px-4 lg:has-[[data-wide]]:max-w-6xl">
        <DashboardNav />
        <main className="pb-6 pt-5">{children}</main>
      </div>
    </div>
  );
}
