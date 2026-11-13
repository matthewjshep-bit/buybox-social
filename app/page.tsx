import { connection } from "next/server";
import { HomeFeed } from "@/components/home-feed";
import { JoinGate, JoinIntro } from "@/components/join";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { devLoginEnabled, firstName, getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel } from "@/lib/feed";
import { getFollowCounts } from "@/lib/follows";
import { getHomeFeed, suggestPeople } from "@/lib/home-feed";
import { getPublicIdentity } from "@/lib/public";
import { getTaste } from "@/lib/taste";

// How many homes someone sees before they're asked to sign up.
const FREE_HOMES = 3;
// While someone follows fewer than this, the feed suggests people to follow.
const SUGGEST_UNDER = 5;
// Homes picked for them, on a feed with little in it yet.
const PICKS = 4;

// The home page. Signed out: homes full screen, one after another, opening on
// what this is and a short sign-up form, then asking them to sign up to see
// the rest. Signed in: their feed (see HomeFeed), each home in it opening them
// all full screen; every home is one tap away, under Browse homes.
export default async function Home() {
  await connection();
  const [user, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor, name } = await getPublicIdentity(user, device);
  const taste = await getTaste(visitor?.id);

  if (!user) {
    const posts = await getReel(user, device, taste);
    const free = posts.slice(0, FREE_HOMES);
    // The next home waits, blurred, behind the sign-up.
    const next = (posts[FREE_HOMES] ?? free.at(-1))?.listing.Media[0];
    return (
      <ReelFeed
        // Signing up comes back to this page: their feed, not this one's state.
        key="guest"
        initial={free}
        mode="public"
        actions={publicReelActions}
        myName={name}
        prompt={PUBLIC_PROMPT}
        header={<SiteHeader overlay />}
        intro={<JoinIntro photo={free[0]?.listing.Media[0]} devMode={devLoginEnabled} />}
        // How it works, the first time, once they're on the first home.
        tour="home"
        end={<JoinGate photo={next} devMode={devLoginEnabled} />}
      />
    );
  }

  const [entries, counts] = await Promise.all([
    getHomeFeed(user, visitor?.id ?? null),
    visitor ? getFollowCounts(visitor.id) : { followers: 0, following: 0 },
  ]);
  const [suggestions, picks] = await Promise.all([
    counts.following < SUGGEST_UNDER ? suggestPeople(visitor?.id ?? null) : [],
    entries.length < PICKS ? getReel(user, device, taste, { limit: PICKS }) : [],
  ]);
  return (
    <HomeFeed
      entries={entries}
      suggestions={suggestions}
      firstName={firstName(user)}
      picks={picks.map((post) => ({
        key: post.listing.ListingKey,
        address: post.listing.UnparsedAddress,
        price: post.listing.ListPrice,
        photo: post.listing.Media[0]?.MediaURL ?? null,
      }))}
    />
  );
}
