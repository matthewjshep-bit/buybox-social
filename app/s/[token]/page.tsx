import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { homeFacts } from "@/app/homes/[key]/preview";
import type { LinkAccount } from "@/components/agent-card";
import { LiveRefresh } from "@/components/live-refresh";
import { countUnreadActivity } from "@/lib/activity";
import { getCurrentUser, getViewAs, isAdmin, type Account } from "@/lib/auth";
import { sql } from "@/lib/db";
import { agentFirstName } from "@/lib/format";
import { readDevice } from "@/lib/engagement";
import { isSampleListing } from "@/lib/listings/types";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { NO_PHOTO_LIKES } from "@/lib/photos";
import { getPublicIdentity } from "@/lib/public";
import { NO_REACTION } from "@/lib/reactions";
import {
  accountParticipant,
  getParticipant,
  getShareByToken,
  getShareListings,
  getShareMembers,
  isPrivateTo,
} from "@/lib/shares";
import { headlineFromTimeline, type FeedPost } from "@/lib/feed";
import { eventsFromTimeline } from "@/lib/ticker";
import { getSharePhotoLikes, getShareTimelines, type TimelineReaction } from "@/lib/timeline";
import { addComment, askToSee, joinThread, likePhotoInShare, setCommentSharing, setReaction } from "./actions";
import { ShareEnd, ShareReel, ShareWelcome } from "./client";
import { leaveLink } from "./leave";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Someone signed in, as the site's header has them: their page, their face,
// and how much is new on the bell.
async function linkAccount(
  viewer: Account,
  device: string | undefined,
): Promise<{ visitorId: string | null; menu: LinkAccount }> {
  const { visitor } = await getPublicIdentity(viewer, device);
  const [unread, admin] = await Promise.all([visitor ? countUnreadActivity(visitor.id) : 0, isAdmin(viewer)]);
  const menu: LinkAccount = {
    profile: visitor ? `/people/${visitor.id}` : "/people/me",
    photo: visitor ? photoUrl(visitor.id, photoVersion(viewer.photo_data_url)) : viewer.photo_data_url,
    initial: (viewer.full_name.trim() || viewer.email)[0]?.toUpperCase() ?? "",
    name: viewer.full_name.trim(),
    // Their own, to themselves only, as the site's header shows it.
    email: viewer.email,
    agent: viewer.role === "agent",
    admin,
    unread,
  };
  return { visitorId: visitor?.id ?? null, menu };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const found = await getShareByToken(token);
  if (!found) return { title: "Link not available", robots: { index: false } };
  const listings = await getShareListings(found.share.id);
  const title = `${found.agent.full_name || "Your agent"} picked ${
    listings.length === 1 ? listings[0].UnparsedAddress : `${listings.length} homes`
  } for you`;
  // The home's facts, for one; never the client's name, the note or anything said.
  const facts = listings.length === 1 ? homeFacts(listings[0], { city: true }) : "";
  const description = `${facts ? `${facts}. ` : ""}Take a look and tell me what you think.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const found = await getShareByToken(token);
  if (!found) notFound();
  const { share, agent, person } = found;

  const [listings, device, members, viewer, alone] = await Promise.all([
    getShareListings(share.id),
    readDevice(),
    getShareMembers(share.id),
    getCurrentUser(),
    // Only you and the agent read what's said here: worked out here, never
    // guessed from who has joined, since the package's own link may be out.
    person ? isPrivateTo(share.id, person.id) : false,
  ]);
  // The agent looking at their own link (Preview, on the client's page): never
  // taken for the client. The header says so. What they like or write here
  // is their own first pass, for everyone on the link (actions.ts).
  const agentViewing = viewer?.id === share.agent_id;
  const client = person?.first_name || share.client_name || "your client";
  const preview = agentViewing ? `Viewing as ${client}` : undefined;
  // Someone's own link is them; otherwise whoever's signed in, by their place
  // on it, or whoever this browser joined as before signing in. (The agent is
  // never anyone on it, even on someone's own link.)
  const me = agentViewing
    ? null
    : (person ??
      (viewer?.role ? await accountParticipant(found, viewer.id, { claim: false }) : null) ??
      (await getParticipant(share.id, device)));
  const keys = listings.map((listing) => listing.ListingKey);
  // Straight to a home, from a notification about it: `?home=` (one of this
  // link's), its photo (`?photo=`, from 0), and a comment on it (`?comment=`).
  const homeParam = one(query.home);
  const opensOn = homeParam && keys.includes(homeParam) ? homeParam : undefined;
  const photoParam = one(query.photo);
  const initialPhoto = opensOn && photoParam && /^\d{1,3}$/.test(photoParam) ? Number(photoParam) : undefined;
  const commentParam = one(query.comment);
  const initialComment = opensOn && commentParam && UUID.test(commentParam) ? commentParam : undefined;

  // Signed in (never the agent on their own link): their menu and the bell in
  // the agent's header, following the agent from Contact, and, on a link the
  // agent made for them, a way off it.
  const signedIn = viewer?.role && !agentViewing ? viewer : null;
  const [timelines, photoLikes, account, agentProfile, viewing, mine, quickInvitee] = await Promise.all([
    getShareTimelines(share.id, listings, me?.id ?? null),
    getSharePhotoLikes(share.id, keys, me?.id ?? null, { agent: agentViewing }),
    signedIn ? linkAccount(signedIn, device) : null,
    // The agent is a person on Porchcard too, once they have a page; and
    // whether whoever's signed in follows them.
    sql<{ id: string; following: boolean }[]>`
      select v.id, exists (
        select 1 from follows f join visitors me on me.id = f.follower_id
        where f.followed_id = v.id and me.account_id = ${signedIn?.id ?? null}
      ) as following
      from visitors v where v.account_id = ${share.agent_id}`.then(([row]) => row ?? null),
    signedIn ? getViewAs() : null,
    signedIn && person
      ? sql<{ account_id: string | null; invited_at: Date | null }[]>`
          select account_id, invited_at from participants where id = ${person.id}`.then(([row]) => row ?? null)
      : null,
    // A quick Send named for someone: its one person, put there by the agent
    // and not yet signed in on it.
    !agentViewing && !person && !me
      ? sql<{ first_name: string; account_id: string | null; invited_at: Date | null }[]>`
          select first_name, account_id, invited_at from participants where share_id = ${share.id} limit 2`.then(
          (rows) => (rows.length === 1 && rows[0].account_id === null && rows[0].invited_at !== null ? rows[0].first_name : null),
        )
      : null,
  ]);
  // Only their own place on their own link, one the agent made for them; and
  // never while someone's only looking as them.
  const canLeave = Boolean(signedIn && mine && mine.account_id === signedIn.id && mine.invited_at !== null && !viewing);
  // Your own reaction to a home is your line in its timeline.
  const mineFor = (key: string) =>
    timelines.get(key)?.find((item): item is TimelineReaction => item.kind === "reaction" && item.mine)?.state ??
    NO_REACTION;
  const agentName = agent.full_name || "Your agent";
  const count = listings.length;
  // The welcome screen's headline: the agent's own words, or the standard line.
  const greeting =
    share.headline ||
    `${person ? `${person.first_name}, I` : share.client_name ? `${share.client_name}, I` : "I"} picked ${
      count === 1 ? "this home" : `these ${count} homes`
    } for you`;
  // A link the agent made for one person, opened before anyone has said who
  // they are on it, is most likely theirs: the name prompt starts with it.
  // That's the one person the agent put on a quick Send, or (on a link with
  // nobody on it yet) the one name it was made for.
  const expected =
    quickInvitee ??
    (!agentViewing &&
    !person &&
    !me &&
    members.length === 0 &&
    share.client_name &&
    !/[&,]| and /i.test(share.client_name)
      ? share.client_name
      : undefined);
  const agentFirst = agentFirstName(agent.full_name, "Your agent");
  // Who else can open this link. Someone's own link opens as them, so it's theirs alone.
  const whoCanSee = person
    ? `This link is just for you, ${person.first_name}. Ask ${agentName} if someone else should see ${count > 1 ? "these" : "it"}.`
    : "Anyone with this link can see and join this conversation.";

  // Each home as a post in the feed, from this link's own conversation only.
  const posts: FeedPost[] = listings.map((listing) => {
    const timeline = timelines.get(listing.ListingKey) ?? [];
    // Everyone here who liked the home, or anything in its photos.
    const likes = timeline.filter(
      (item): item is TimelineReaction =>
        item.kind === "reaction" && !item.isAgent && (item.state.reaction === "like" || item.photos.length > 0),
    );
    return {
      listing,
      headline: headlineFromTimeline(timeline),
      likes: likes.length,
      likers: likes.filter((item) => !item.mine).map((item) => item.name),
      dislikes: 0,
      aspects: { liked: {}, disliked: {} },
      publicComments: 0,
      privateComments: 0,
      timeline,
      photoLikes: photoLikes.get(listing.ListingKey) ?? NO_PHOTO_LIKES,
      mine: mineFor(listing.ListingKey),
      buzz: { sends: 0, views: 0, lastActivityAt: null, trending: false },
      reasons: [],
      members,
      // The agent on their own link: what they said there is theirs, so the
      // line above the price says "You", as it does for anyone's own.
      ...(agentViewing && { events: eventsFromTimeline(timeline, { agentViewing }) }),
    };
  });

  return (
    <div style={{ "--brand": agent.brand_color } as React.CSSProperties}>
      <LiveRefresh />
      <ShareReel
        token={token}
        initial={posts}
        agent={agent}
        note={share.note}
        whoCanSee={whoCanSee}
        askToSee={askToSee.bind(null, token)}
        focus={opensOn ? { key: opensOn, n: 0 } : null}
        initialPhoto={initialPhoto}
        initialComment={initialComment}
        account={account?.menu ?? null}
        extras={{
          // Signed in, the agent's page and following them (signed out, Contact
          // stays about reaching them).
          profile: account && agentProfile ? `/people/${agentProfile.id}` : null,
          follow:
            account && agentProfile && account.visitorId !== agentProfile.id
              ? { personId: agentProfile.id, following: agentProfile.following }
              : null,
          leave: canLeave ? leaveLink.bind(null, token) : null,
        }}
        preview={preview}
        notes={agentViewing ? { for: client, done: `/dashboard/shares/${share.id}` } : undefined}
        // (No name: the feed says "your agent".)
        agentName={agent.full_name || undefined}
        // A personal link opens as its owner, so it isn't one to pass around.
        canInvite={!person}
        alone={alone}
        actions={{
          join: joinThread.bind(null, token),
          react: setReaction.bind(null, token),
          comment: addComment.bind(null, token),
          setSharing: setCommentSharing.bind(null, token),
          likePhoto: likePhotoInShare.bind(null, token),
        }}
        // (The agent's own look is never asked a name: nothing there is saved.)
        myName={agentViewing ? agentFirstName(agent.full_name, "You") : (me?.first_name ?? null)}
        prompt={`So ${agentName} and anyone else on this link know who's talking.`}
        // Their name already, on their own link (or on one sent to just them).
        suggestedName={person?.first_name ?? expected}
        nameHint={expected && `${agentFirst} sent this to ${expected}. Not ${expected}? Type your name.`}
        // Every link starts with a word from the agent over the first home's
        // photo, then the homes below it.
        intro={
          count > 0 ? (
            <ShareWelcome
              key="welcome"
              agent={agent}
              greeting={greeting}
              note={share.note}
              count={count}
              photo={listings[0].Media[0]}
              sample={listings.some(isSampleListing)}
              whoCanSee={whoCanSee}
              profile={agentProfile ? `/people/${agentProfile.id}` : null}
            />
          ) : undefined
        }
        // Keyed: the feed sets it among its own children, and a screen that
        // streams in later can't otherwise show React it was written in place.
        end={<ShareEnd key="end" agentName={agentName} count={count} personal={!!person} token={token} />}
      />
    </div>
  );
}
