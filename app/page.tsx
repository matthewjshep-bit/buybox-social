import { after, connection } from "next/server";
import { AgentHome } from "@/components/home/agent-home";
import { BuyerHome } from "@/components/home/buyer-home";
import { JoinGate, JoinIntro } from "@/components/join";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { devLoginEnabled, firstName, getCurrentUser, getViewAs } from "@/lib/auth";
import { getClientCards } from "@/lib/client-feed";
import { getClientBook } from "@/lib/clients";
import { readDevice } from "@/lib/engagement";
import { getFollowCounts } from "@/lib/follows";
import { getReel } from "@/lib/feed";
import {
  feedKeys,
  getFollowedFaces,
  getHomeFeed,
  getHomeSeen,
  getPicks,
  markHomeSeen,
  myReactions,
  suggestPeople,
} from "@/lib/home-feed";
import { getMyLinks } from "@/lib/my-links";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { getPublicIdentity } from "@/lib/public";
import { getTaste } from "@/lib/taste";

// How many homes someone sees before they're asked to sign up.
const FREE_HOMES = 3;
// People worth following, beside the stream (and in it, on a phone).
const SUGGESTIONS = 5;

// The home page. Signed out: homes full screen, one after another, opening on
// what this is and a short sign-up form, then asking them to sign up to see
// the rest. Signed in, everyone's home is laid out the same way (their card
// down the left, the feed, what's beside it down the right): an agent's is
// what their clients did and their clients as people (AgentHome); anyone
// else's is their agent's homes, the people they follow and homes picked for
// them (BuyerHome).
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [user, device, viewAs, params] = await Promise.all([getCurrentUser(), readDevice(), getViewAs(), searchParams]);
  const { visitor, name } = await getPublicIdentity(user, device);

  if (!user) {
    const posts = await getReel(user, device, await getTaste(visitor?.id));
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

  const visitorId = visitor?.id ?? null;
  const lensParam = typeof params.lens === "string" ? params.lens : null;
  const lens = { initial: lensParam ?? "", fromUrl: lensParam !== null };
  const profileHref = visitorId ? `/people/${visitorId}` : "/people/me";
  // Once this page is on its way, it's been seen: next time, "new" starts
  // here. (Not while an admin is looking as them: that's not them looking.)
  if (visitorId && !viewAs) {
    after(async () => {
      await markHomeSeen(visitorId);
    });
  }

  const me = {
    name: user.full_name.trim() || user.email,
    photo: visitorId ? photoUrl(visitorId, photoVersion(user.photo_data_url)) : user.photo_data_url,
  };
  const noFollows = { followers: 0, following: 0 };

  if (user.role === "agent") {
    // (No homes picked for an agent, nor people to follow: their home is
    // their clients, and it loads without the scan those take.)
    const [book, cards, feed, seenAt, follows] = await Promise.all([
      getClientBook(user.id),
      getClientCards(user.id),
      getHomeFeed(user, visitorId),
      getHomeSeen(visitorId),
      visitorId ? getFollowCounts(visitorId) : noFollows,
    ]);
    const mine = await myReactions(visitorId, feedKeys(feed));
    return (
      <AgentHome
        firstName={firstName(user)}
        me={{ ...me, brokerage: user.brokerage }}
        profileHref={profileHref}
        book={book}
        cards={cards}
        follows={follows}
        feed={feed}
        mine={mine}
        seenAt={seenAt}
        lens={lens}
      />
    );
  }

  const [feed, links, followed, seenAt, picks, suggestions, follows] = await Promise.all([
    getHomeFeed(user, visitorId),
    getMyLinks(user.id),
    getFollowedFaces(visitorId),
    getHomeSeen(visitorId),
    getPicks(user, device, visitorId),
    suggestPeople(visitorId, SUGGESTIONS),
    visitorId ? getFollowCounts(visitorId) : noFollows,
  ]);
  const mine = await myReactions(visitorId, feedKeys(feed));
  return (
    <BuyerHome
      firstName={firstName(user)}
      me={me}
      follows={follows}
      profileHref={profileHref}
      links={links}
      followed={followed}
      suggestions={suggestions}
      feed={feed}
      mine={mine}
      seenAt={seenAt}
      picks={picks}
      lens={lens}
    />
  );
}
