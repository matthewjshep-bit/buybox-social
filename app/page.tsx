import { after, connection } from "next/server";
import { AgentHome } from "@/components/home/agent-home";
import { BuyerHome } from "@/components/home/buyer-home";
import { JoinGate, JoinIntro } from "@/components/join";
import { PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { getClientDays } from "@/lib/agent-feed";
import { devLoginEnabled, firstName, getCurrentUser, getViewAs } from "@/lib/auth";
import { getClients } from "@/lib/clients";
import { readDevice } from "@/lib/engagement";
import { getReel } from "@/lib/feed";
import {
  brandColorsOf,
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
import { getNeedsYou } from "@/lib/needs-you";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { getPublicIdentity } from "@/lib/public";
import { getTaste } from "@/lib/taste";

// How many homes someone sees before they're asked to sign up.
const FREE_HOMES = 3;
// Needs-you rows the page brings: five show, the rest fill in after a Done.
const NEEDS_READ = 15;
// People worth following: four along the top for someone with nobody yet,
// and three beside the stream.
const SUGGESTIONS = 7;

// The home page. Signed out: homes full screen, one after another, opening on
// what this is and a short sign-up form, then asking them to sign up to see
// the rest. Signed in, an agent's "Today" (what clients are waiting on them
// for, then what their clients did: AgentHome), or anyone else's home (their
// agent's homes, the people they follow, homes picked for them: BuyerHome).
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

  if (user.role === "agent") {
    // (No homes picked for an agent, nor people to follow: their home is
    // their clients, and it loads without the scan those take.)
    const [clients, needs, days, feed, seenAt] = await Promise.all([
      getClients(user.id),
      getNeedsYou(user.id, NEEDS_READ),
      getClientDays(user.id),
      getHomeFeed(user, visitorId),
      getHomeSeen(visitorId),
    ]);
    const mine = await myReactions(visitorId, feedKeys(feed));
    return (
      <AgentHome
        firstName={firstName(user)}
        me={{
          name: user.full_name.trim() || user.email,
          photo: visitorId ? photoUrl(visitorId, photoVersion(user.photo_data_url)) : user.photo_data_url,
        }}
        profileHref={profileHref}
        clients={clients}
        needs={needs}
        days={days}
        feed={feed}
        mine={mine}
        seenAt={seenAt}
        lens={lens}
      />
    );
  }

  const [feed, links, followed, seenAt, picks, suggestions] = await Promise.all([
    getHomeFeed(user, visitorId),
    getMyLinks(user.id),
    getFollowedFaces(visitorId),
    getHomeSeen(visitorId),
    getPicks(user, device, visitorId),
    suggestPeople(visitorId, SUGGESTIONS),
  ]);
  const [mine, brands] = await Promise.all([
    myReactions(visitorId, feedKeys(feed)),
    brandColorsOf(links.flatMap((link) => (link.agent.profileId ? [link.agent.profileId] : []))),
  ]);
  return (
    <BuyerHome
      firstName={firstName(user)}
      profileHref={profileHref}
      links={links}
      brands={brands}
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
