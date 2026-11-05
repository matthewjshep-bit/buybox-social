import { connection } from "next/server";
import { FeedEnd } from "@/components/feed-end";
import { JoinGate, JoinIntro } from "@/components/join";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { devLoginEnabled, getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { getTaste } from "@/lib/taste";

// How many homes someone sees before they're asked to sign up.
const FREE_HOMES = 3;

// The home page: homes full screen, one after another, best matches for your
// taste first. Signed in, it keeps going for as long as you scroll. Signed
// out, it opens on what this is and a short sign-up form, shows a few homes,
// then asks them to sign up to see the rest.
export default async function Home() {
  await connection();
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor, name } = await getPublicIdentity(user, device);
  const taste = await getTaste(visitor?.id);
  const posts = await getReel(user, device, taste);

  if (!user) {
    const free = posts.slice(0, FREE_HOMES);
    // The next home waits, blurred, behind the sign-up.
    const next = (posts[FREE_HOMES] ?? free.at(-1))?.listing.Media[0];
    return (
      <ReelFeed
        // Signing up comes back to this page: a new feed, not this one's state.
        key="guest"
        initial={free}
        mode="public"
        actions={publicReelActions}
        myName={name}
        prompt={PUBLIC_PROMPT}
        header={<SiteHeader overlay />}
        intro={<JoinIntro photo={free[0]?.listing.Media[0]} devMode={devLoginEnabled} />}
        end={<JoinGate photo={next} devMode={devLoginEnabled} />}
      />
    );
  }

  return (
    <ReelFeed
      key="member"
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
