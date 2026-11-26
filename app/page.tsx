import { after, connection } from "next/server";
import { Home } from "@/components/home/home";
import { PEOPLE_SHOWN } from "@/components/home/people-card";
import { MarketingHome } from "@/components/marketing-home";
import { getBanner } from "@/lib/banner";
import { devLoginEnabled, firstName, getCurrentUser, getViewAs } from "@/lib/auth";
import { getClientBook } from "@/lib/clients";
import { readDevice } from "@/lib/engagement";
import { getFollowCounts } from "@/lib/follows";
import { feedCounts, feedKeys, getHomeFeed, markHomeSeen, myReactions, type FeedWho } from "@/lib/home-feed";
import { getMyLinks } from "@/lib/my-links";
import { suggestPeopleFor } from "@/lib/people";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { ensureAccountVisitor, getPublicIdentity } from "@/lib/public";
import { kindOf, listingWords } from "@/lib/kinds";
import { getTop } from "@/lib/top";

// The home page. Signed out: what Porchcard is, for agents and for buyers,
// and a way to start (MarketingHome). Signed in, it's one page for everyone
// (Home): their card down the left; in the middle the box to send homes, the
// homes their agent sent that are still waiting, and their feed (the home
// they just rated on their agent's link first, then what the people they
// follow did, woven with what's popular, new, near them and picked for them:
// lib/home-feed.ts); people to follow down the right, or for an agent, Top
// (the head of Popular). What an agent's clients do is in Notifications and
// Messages.
export default async function HomePage() {
  await connection();
  const [user, device, viewAs] = await Promise.all([getCurrentUser(), readDevice(), getViewAs()]);
  // Signed out: what Porchcard is. (The homes are at /browse.)
  if (!user) return <MarketingHome devMode={devLoginEnabled} />;
  const found = await getPublicIdentity(user, device);
  // Someone with a name and no public page yet (they signed up before
  // everyone was given one at sign-in): theirs is made now, so their home has
  // a feed and they can be found and followed.
  const visitor = found.visitor ?? (user.role && user.full_name.trim() ? await ensureAccountVisitor(user) : null);

  const visitorId = visitor?.id ?? null;
  const profileHref = visitorId ? `/people/${visitorId}` : "/people/me";
  // Once this page is on its way, it's been seen: next time, "new" starts
  // here. (Not while an admin is looking as them: that's not them looking.)
  if (visitorId && !viewAs) {
    after(async () => {
      await markHomeSeen(visitorId);
    });
  }

  const agent = user.role === "agent";
  const me = {
    // Their page's id where they have one: what picks the scene at the top of their card.
    id: visitorId ?? user.id,
    // As their own page calls them: an agent by their whole name, anyone else
    // by their first. Never by their email: with no name yet it's '' (their
    // card asks for one, and a heart or a comment asks for it first, as it
    // does for anyone new).
    name: agent ? user.full_name.trim() : firstName(user),
    photo: visitorId ? photoUrl(visitorId, photoVersion(user.photo_data_url)) : user.photo_data_url,
  };
  const noFollows = { followers: 0, following: 0 };

  // The same reads for everyone; an agent's clients besides.
  const [banner, everyone, links, suggestions, follows, book] = await Promise.all([
    getBanner(visitorId),
    getHomeFeed(user, visitorId),
    getMyLinks(user.id),
    suggestPeopleFor({ visitorId, accountId: user.id, agent }, PEOPLE_SHOWN),
    // (Their own numbers, to them: all of them. None yet for someone with no page.)
    visitorId ? getFollowCounts(visitorId, visitorId) : noFollows,
    agent ? getClientBook(user.id) : null,
  ]);
  // In an agent's Following, whoever is their own client says so by their name.
  const clientIds = new Set((book?.clients ?? []).flatMap((client) => (client.profileId ? [client.profileId] : [])));
  const marked = (who: FeedWho): FeedWho => (who.profileId && clientIds.has(who.profileId) ? { ...who, client: true } : who);
  const feed = clientIds.size
    ? everyone.map((entry) =>
        entry.kind === "post"
          ? { ...entry, who: marked(entry.who) }
          : {
              ...entry,
              why: { ...entry.why, who: entry.why.who.map(marked) },
              said: entry.said.map((quote) => ({ ...quote, who: marked(quote.who) })),
            },
      )
    : everyone;
  const [publicTakes, counts, top] = await Promise.all([
    myReactions(visitorId, feedKeys(feed)),
    // Under each card: how many liked it and how many comments it has.
    feedCounts(feedKeys(feed)),
    // Beside an agent's feed: the head of Popular. (What their clients do is
    // in Notifications and Messages.)
    book ? getTop({ visitorId, accountId: user.id, agent }) : null,
  ]);
  // Their hearts start out as they are in public. (What they decided on their
  // agent's link is said on the home leading the feed, not shown as a public
  // heart: a tap here is public, and a link's verdict changes on the link.)
  const mine = publicTakes;
  return (
    <Home
      firstName={firstName(user)}
      me={{ ...me, banner }}
      follows={follows}
      profileHref={profileHref}
      links={links}
      suggestions={suggestions}
      feed={feed}
      mine={mine}
      counts={counts}
      agent={
        book && top
          ? {
              book,
              brokerage: user.brokerage,
              brandColor: user.brand_color,
              listings: listingWords(kindOf(user)).Many,
              top,
            }
          : undefined
      }
    />
  );
}
