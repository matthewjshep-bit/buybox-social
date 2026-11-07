import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import {
  commentInReel,
  joinPublic,
  likeCommentInReel,
  likePhotoInStream,
  reactInStream,
} from "@/app/homes/actions";
import { FeedEnd } from "@/components/feed-end";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { getTaste } from "@/lib/taste";

export const PUBLIC_PROMPT =
  "Your first name shows next to what you like and say, and anyone visiting can see it. No account or password needed.";

// The actions behind the public feed. It reloads only the home you're talking
// about, so these save without reloading the page.
export const publicReelActions = {
  join: joinPublic,
  react: reactInStream,
  comment: commentInReel,
  likeComment: likeCommentInReel,
  likePhoto: likePhotoInStream,
};

// `?photo=` in a home's address, as a photo to open on (from 0): links from
// someone's page and the activity bell open on the photo they're about.
export const photoParam = (value: string | string[] | undefined) => {
  const n = typeof value === "string" && /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) ? n : undefined;
};

// One home, full screen, as the first of the feed: a shared link opens on it
// and keeps going. In the map's pop-out, just that home. `photo`: the photo
// it opens on.
export async function ListingDetail({
  listingKey,
  embedded = false,
  photo,
}: {
  listingKey: string;
  embedded?: boolean;
  photo?: number;
}) {
  if (listingKey.length > 100) notFound();
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor, name } = await getPublicIdentity(viewer, device);
  const taste = await getTaste(visitor?.id);
  const [home] = await getReel(viewer, device, taste, { only: [listingKey], limit: 1 });
  if (!home) notFound();
  const rest = embedded ? [] : await getReel(viewer, device, taste, { exclude: [listingKey] });

  const feed: ComponentProps<typeof ReelFeed> = {
    initial: [home, ...rest],
    mode: "public",
    infinite: !embedded,
    embedded,
    actions: publicReelActions,
    myName: name,
    prompt: PUBLIC_PROMPT,
    header: embedded ? undefined : <SiteHeader overlay />,
    end: embedded ? undefined : <FeedEnd taste={taste} account={viewer} visitorId={visitor?.id ?? null} />,
    initialPhoto: photo,
  };
  // An agent's share button sends the home to a client.
  return viewer?.role === "agent" ? (
    <QuickSendReel {...feed} profileComplete={Boolean(viewer.full_name)} />
  ) : (
    <ReelFeed {...feed} />
  );
}
