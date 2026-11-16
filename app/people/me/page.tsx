import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { ensureAccountVisitor, getPublicIdentity } from "@/lib/public";

// Your own profile, wherever you are: by account, or by this browser.
// `?tab=activity` comes along for an agent, whose profile may open on their listings.
export default async function MyProfile({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account, device);
  // Signed in but nothing public yet: your profile still exists, just empty.
  const me = visitor ?? (account ? await ensureAccountVisitor(account) : null);
  const activity = tab === "activity" && account?.role === "agent";
  redirect(me ? `/people/${me.id}${activity ? "?tab=activity" : ""}` : "/login");
}
