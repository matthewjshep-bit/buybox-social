import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { ensureAccountVisitor, getPublicIdentity } from "@/lib/public";

// Your own profile, wherever you are: by account, or by this browser.
export default async function MyProfile() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  if (account && !account.role) redirect("/welcome");
  const { visitor } = await getPublicIdentity(account, device);
  // Signed in but nothing public yet: your profile still exists, just empty.
  const me = visitor ?? (account ? await ensureAccountVisitor(account) : null);
  redirect(me ? `/people/${me.id}` : "/login");
}
