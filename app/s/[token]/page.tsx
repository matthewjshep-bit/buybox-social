import { ArrowUp } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { LiveRefresh } from "@/components/live-refresh";
import { readDevice } from "@/lib/engagement";
import { isSampleListing } from "@/lib/listings/types";
import { NO_PHOTO_LIKES } from "@/lib/photos";
import { NO_REACTION } from "@/lib/reactions";
import { getParticipant, getShareByToken, getShareListings } from "@/lib/shares";
import { headlineFromTimeline, type FeedPost } from "@/lib/feed";
import { getSharePhotoLikes, getShareTimelines, type TimelineReaction } from "@/lib/timeline";
import { addComment, joinThread, likePhotoInShare, setCommentSharing, setReaction } from "./actions";
import { InviteButton } from "./client";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const found = await getShareByToken(token);
  if (!found) return { title: "Link not available", robots: { index: false } };
  const listings = await getShareListings(found.share.id);
  const title = `${found.agent.full_name || "Your agent"} picked ${
    listings.length === 1 ? listings[0].UnparsedAddress : `${listings.length} homes`
  } for you`;
  const description = "Take a look and tell me what you think.";
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
  const { share, agent } = found;

  const [listings, device] = await Promise.all([getShareListings(share.id), readDevice()]);
  const me = await getParticipant(share.id, device);
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
    };
  });

  return (
    <div style={{ "--brand": agent.brand_color } as React.CSSProperties}>
      <LiveRefresh />
      <ReelFeed
        initial={posts}
        mode="share"
        agentName={agentName}
        actions={{
          join: joinThread.bind(null, token),
          react: setReaction.bind(null, token),
          comment: addComment.bind(null, token),
          setSharing: setCommentSharing.bind(null, token),
          likePhoto: likePhotoInShare.bind(null, token),
        }}
        myName={me?.first_name ?? null}
        prompt={`So ${agentName} and anyone else on this link know who's talking. No account or password needed.`}
        header={<SiteHeader overlay />}
        intro={
          <div className="flex h-full flex-col justify-end bg-brand px-6 pb-14 pt-28 sm:px-10">
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-center gap-3">
                <AgentAvatar agent={agent} size={56} className="ring-2 ring-white/70" />
                <div className="min-w-0 leading-snug">
                  <p className="truncate font-semibold">{agentName}</p>
                  {agent.brokerage && <p className="truncate text-sm text-white/85">{agent.brokerage}</p>}
                </div>
              </div>
              <h1 className="mt-6 font-display text-4xl leading-tight sm:text-5xl">
                {share.client_name ? `${share.client_name}, I` : "I"} picked{" "}
                {count === 1 ? "this home" : `these ${count} homes`} for you
              </h1>
              {share.note && (
                <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-white/90">{share.note}</p>
              )}
              <p className="mt-10 flex items-center gap-2 font-semibold">
                <ArrowUp aria-hidden size={20} className="animate-bounce motion-reduce:animate-none" />
                Swipe up to see {count === 1 ? "it" : "them"}
              </p>
              <p className="mt-6 text-xs leading-relaxed text-white/75">
                Tap the heart on anything you like, even something in a photo.{" "}
                {listings.some(isSampleListing) && "Sample listings, fictional and not for sale. "}
                Anyone with this link can see and join this conversation.
              </p>
            </div>
          </div>
        }
        end={
          <div className="w-full max-w-md">
            <h2 className="font-display text-3xl">That&apos;s every home</h2>
            <p className="mt-2 text-white/85">
              {agentName} sees what you liked and said. Change your mind any time.
            </p>
            <div className="mt-8 rounded-2xl bg-white p-5 text-ink">
              <h3 className="font-semibold">Deciding with someone?</h3>
              <p className="mt-1 text-sm text-stone-600">
                Send them this link so you can all weigh in here, together with {agentName}.
              </p>
              <InviteButton token={token} />
            </div>
          </div>
        }
      />
    </div>
  );
}
