import type { Metadata } from "next";
import { AdminNav } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin · BuyBox Social",
  robots: { index: false, follow: false },
};

// Running the site: who's signed up, every home, and what people say. Each
// page checks for an admin too, since a layout isn't re-run on every visit.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { superAdmin } = await requireAdmin();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-16 pt-4 sm:px-6 md:flex-row md:gap-8 md:pt-8">
      <AdminNav superAdmin={superAdmin} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
