import { requireAgent } from "@/lib/auth";
import { pageColumn } from "@/lib/ui";

// What the bar calls this place. (A client's page, a link's and Send homes
// say their own.)
export const metadata = { title: "Porchcard" };

// The agent's own colour is set around this and the header together, so the
// logo is theirs too (BrandScope, app/layout.tsx).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAgent();
  return (
    <div
      // A Scorecard's panel down the right of a wide screen makes room for
      // itself, so nothing on the page sits under it. (No height of its own:
      // under the header, a short page fits the window without scrolling.)
      className="lg:has-[[data-scorecard-docked]]:pr-[29.5rem]"
    >
      {/* The column every one-column page has. (Its foot is the short one:
          sending homes is under here, and ends in a bar held to the screen's.) */}
      <div className={pageColumn({ tray: true })}>
        <main className="pt-5">{children}</main>
      </div>
    </div>
  );
}
