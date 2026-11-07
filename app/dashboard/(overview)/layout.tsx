import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";

// An agent with no name yet goes to add it before anything else. Checked here,
// above the list's loading shapes, so it's a plain redirect rather than a
// flash of the dashboard first.
export default async function OverviewLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireAgent();
  if (!agent.full_name) redirect("/dashboard/profile");
  return children;
}
