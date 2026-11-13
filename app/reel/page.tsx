import type { ComponentProps } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FeedEnd } from "@/components/feed-end";
import { photoParam, PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { OrderedReel } from "@/components/ordered-reel";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel, REEL_PAGE } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { homesFrom } from "@/lib/reel-from";
import { getTaste } from "@/lib/taste";
import { loadOrderedReel } from "./actions";

export const metadata = { title: "Homes · Porchcard" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Homes full screen, one after another. From a feed (`?from=feed`, or someone's
// page by its id) with the home tapped (`&home=`): that feed's homes, in its
// order, opened on that one. Otherwise ("Browse homes"): every home, best
// matches for your taste first (or `?home=` first), for as long as you scroll.
export default async function ReelPage({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  const from = typeof params.from === "string" && params.from.length <= 64 ? params.from : null;
  const start = typeof params.home === "string" && params.home.length <= 100 ? params.home : null;
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor, name } = await getPublicIdentity(viewer, device);
  const taste = await getTaste(visitor?.id);
  const ordered = from ? await homesFrom(from) : null;

  if (!ordered) {
    // Signed out, the home page shows a few, then asks them to sign up.
    if (!viewer) redirect("/");
    // Opened on a home picked for them (from their feed), then the rest.
    const [picked] = start ? await getReel(viewer, device, taste, { only: [start], limit: 1 }) : [];
    const rest = await getReel(viewer, device, taste, picked ? { exclude: [picked.listing.ListingKey] } : {});
    const feed: ComponentProps<typeof ReelFeed> = {
      initial: picked ? [picked, ...rest] : rest,
      mode: "public",
      infinite: true,
      actions: publicReelActions,
      myName: name,
      prompt: PUBLIC_PROMPT,
      header: <SiteHeader overlay />,
      end: <FeedEnd taste={taste} account={viewer} visitorId={visitor?.id ?? null} />,
    };
    // An agent's share button sends the home to a client.
    return viewer.role === "agent" ? (
      <QuickSendReel {...feed} profileComplete={Boolean(viewer.full_name)} />
    ) : (
      <ReelFeed {...feed} />
    );
  }

  const keys = [...ordered.keys];
  if (start && !keys.includes(start)) keys.unshift(start);
  // Everything up to the one tapped, and a few after; the rest as you go.
  const first = keys.slice(0, (start ? keys.indexOf(start) : 0) + REEL_PAGE);
  const posts = first.length ? await getReel(viewer, device, taste, { only: first, limit: first.length }) : [];
  return (
    <OrderedReel
      query={new URLSearchParams({ from: from! }).toString()}
      start={start}
      back={ordered.back}
      siteHeader={<SiteHeader overlay />}
      sender={viewer?.role === "agent" ? { profileComplete: Boolean(viewer.full_name) } : null}
      initial={posts}
      mode="public"
      infinite={keys.length > first.length}
      loadMore={loadOrderedReel.bind(null, from!)}
      initialPhoto={photoParam(params.photo)}
      actions={publicReelActions}
      myName={name}
      prompt={PUBLIC_PROMPT}
    />
  );
}
