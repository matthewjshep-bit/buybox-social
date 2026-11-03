import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FeedEnd } from "@/components/feed-end";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { getTaste } from "@/lib/taste";

// The home page, for everyone: homes full screen, one after another, for as
// long as you scroll. Best matches for your taste first.
export default async function Home() {
  await connection();
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  if (user && !user.role) redirect("/welcome");
  const { visitor, name } = await getPublicIdentity(user, device);
  const taste = await getTaste(visitor?.id);
  const posts = await getReel(user, device, taste);

  return (
    <ReelFeed
      initial={posts}
      mode="public"
      infinite
      actions={publicReelActions}
      myName={name}
      prompt={PUBLIC_PROMPT}
      header={<SiteHeader overlay />}
      end={<FeedEnd taste={taste} account={user} />}
    />
  );
}
