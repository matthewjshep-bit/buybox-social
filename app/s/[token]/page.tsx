import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { homeFacts } from "@/app/homes/[key]/preview";
import { LiveRefresh } from "@/components/live-refresh";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { isSampleListing } from "@/lib/listings/types";
import { NO_PHOTO_LIKES } from "@/lib/photos";
import { NO_REACTION } from "@/lib/reactions";
import { getParticipant, getShareByToken, getShareListings, getShareMembers, isPrivateTo } from "@/lib/shares";
import { headlineFromTimeline, type FeedPost } from "@/lib/feed";
import { getSharePhotoLikes, getShareTimelines, type TimelineReaction } from "@/lib/timeline";
import { addComment, askToSee, joinThread, likePhotoInShare, setCommentSharing, setReaction } from "./actions";
import { ShareEnd, ShareReel, ShareWelcome } from "./client";

type Props = { params: Promise<{ token: string }> };

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

export default async function SharePage({ params }: Props) {
  const { token } = await params;
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
  // The agent looking at their own link: never taken for the client.
  const agentViewing = viewer?.id === share.agent_id;
  // Someone's own link is them; otherwise it's whoever this device joined as.
  const me = person ?? (await getParticipant(share.id, device));
  const keys = listings.map((listing) => listing.ListingKey);
  const [timelines, photoLikes] = await Promise.all([
    getShareTimelines(share.id, listings, me?.id ?? null),
    getSharePhotoLikes(share.id, keys, me?.id ?? null),
  ]);
  // Your own reaction to a home is your line in its timeline.
  const mineFor = (key: string) =>
    timelines.get(key)?.find((item): item is TimelineReaction => item.kind === "reaction" && item.mine)?.state ??
    NO_REACTION;
  const agentName = agent.full_name || "Your agent";
  const count = listings.length;
  const greeting = `${person ? `${person.first_name}, I` : share.client_name ? `${share.client_name}, I` : "I"} picked ${
    count === 1 ? "this home" : `these ${count} homes`
  } for you`;
  // A link the agent made for one person, opened before anyone has said who
  // they are on it, is most likely theirs: the name prompt starts with it.
  const expected =
    !agentViewing &&
    !person &&
    !me &&
    members.length === 0 &&
    share.client_name &&
    !/[&,]| and /i.test(share.client_name)
      ? share.client_name
      : undefined;
  const agentFirst = agent.full_name.trim().split(/\s+/)[0] || "Your agent";
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
        item.kind === "reaction" && (item.state.reaction === "like" || item.photos.length > 0),
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
      // One home opens straight on it, so the agent's greeting and note are its caption.
      ...(count === 1 && { greeting, note: share.note || undefined }),
      members,
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
        myName={me?.first_name ?? null}
        prompt={`So ${agentName} and anyone else on this link know who's talking. No account or password needed.`}
        suggestedName={expected}
        nameHint={expected && `${agentFirst} sent this to ${expected}. Not ${expected}? Type your name.`}
        // Several homes start with a word from the agent over the first one's photo.
        intro={
          count > 1 ? (
            <ShareWelcome
              key="welcome"
              agent={agent}
              greeting={greeting}
              note={share.note}
              count={count}
              photo={listings[0].Media[0]}
              sample={listings.some(isSampleListing)}
              whoCanSee={whoCanSee}
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
