import { after, connection } from "next/server";
import { AgentHome } from "@/components/home/agent-home";
import { BuyerHome } from "@/components/home/buyer-home";
import { MarketingHome } from "@/components/marketing-home";
import { devLoginEnabled, firstName, getCurrentUser, getViewAs } from "@/lib/auth";
import { getClientCards } from "@/lib/client-feed";
import { getClientBook } from "@/lib/clients";
import { readDevice } from "@/lib/engagement";
import { getFollowCounts } from "@/lib/follows";
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

// People worth following, beside the stream (and in it, on a phone).
const SUGGESTIONS = 5;

// The home page. Signed out: what Porchcard is, for agents and for buyers,
// and a way to start (MarketingHome). Signed in, everyone's home is laid out the same way (their card
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
  // Signed out: what Porchcard is. (The homes are at /reel.)
  if (!user) return <MarketingHome devMode={devLoginEnabled} />;
  const { visitor } = await getPublicIdentity(user, device);

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
    // Their page's id where they have one: what picks the scene at the top of their card.
    id: visitorId ?? user.id,
    name: user.full_name.trim() || user.email,
    photo: visitorId ? photoUrl(visitorId, photoVersion(user.photo_data_url)) : user.photo_data_url,
  };
  const noFollows = { followers: 0, following: 0 };

  if (user.role === "agent") {
    // (No homes picked for an agent, and no one they follow: their home is
    // their clients, and it loads without the reads those take.)
    const [book, cards, follows] = await Promise.all([
      getClientBook(user.id),
      getClientCards(user.id),
      visitorId ? getFollowCounts(visitorId) : noFollows,
    ]);
    return (
      <AgentHome
        firstName={firstName(user)}
        me={{ ...me, brokerage: user.brokerage, brandColor: user.brand_color }}
        profileHref={profileHref}
        book={book}
        cards={cards}
        follows={follows}
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
