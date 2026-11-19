import { redirect } from "next/navigation";
import { getCurrentUser, signInPath } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { ensureAccountVisitor, getPublicIdentity } from "@/lib/public";

// Your own profile, wherever you are: by account, or by this browser.
// `?tab=activity` comes along for an agent, whose profile may open on their
// listings; so does `?show=saved`, for the homes you saved.
export default async function MyProfile({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; show?: string | string[] }>;
}) {
  const { tab, show } = await searchParams;
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account, device);
  // Signed in but nothing public yet: your profile still exists, just empty.
  const me = visitor ?? (account ? await ensureAccountVisitor(account) : null);
  const params = new URLSearchParams();
  if (tab === "activity" && account?.role === "agent") params.set("tab", "activity");
  if (show === "saved") params.set("show", "saved");
  const query = params.toString();
  // (Signed out, and nothing of this browser's: sign in, then back here.)
  redirect(me ? `/people/${me.id}${query ? `?${query}` : ""}` : await signInPath("/people/me"));
}
