import type { ComponentProps } from "react";
import { redirect } from "next/navigation";
import { loadOrderedReel } from "@/app/reel/actions";
import { FeedEnd } from "@/components/feed-end";
import { commentParam, photoParam, PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { OrderedReel } from "@/components/ordered-reel";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel, REEL_PAGE } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { filtersOf, homesFrom } from "@/lib/reel-from";
import { getTaste } from "@/lib/taste";

export type ReelParams = Record<string, string | string[] | undefined>;

// Homes one after another, full screen or (opened from a feed or someone's
// page, `contained`) on a stage over it. From a feed (`?from=feed`, someone's
// page by its id with the page's filter, an agent's client or link, your
// picks: see homesFrom) with the home tapped (`&home=`): that feed's homes,
// in its order, opened on that one, each saying why it's there. Otherwise
// ("Browse homes"): every home, best matches for your taste first (or
// `?home=` first), as you scroll. `&comment=`: that home's comments open on
// that comment.
export async function ReelView({ params, contained = false }: { params: ReelParams; contained?: boolean }) {
  const from = typeof params.from === "string" && params.from.length <= 64 ? params.from : null;
  const start = typeof params.home === "string" && params.home.length <= 100 ? params.home : null;
  const comment = commentParam(params.comment);
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor, name } = await getPublicIdentity(viewer, device);
  const taste = await getTaste(visitor?.id);
  const ordered = from ? await homesFrom(from, filtersOf(params)) : null;

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
      contained,
      actions: publicReelActions,
      myName: name,
      prompt: PUBLIC_PROMPT,
      header: contained ? undefined : <SiteHeader overlay />,
      end: <FeedEnd taste={taste} account={viewer} visitorId={visitor?.id ?? null} />,
      // (Only about the home asked for, which leads.)
      initialComment: picked ? comment : undefined,
    };
    // An agent's share button sends the home to a client.
    return viewer.role === "agent" ? (
      <QuickSendReel {...feed} profileComplete={Boolean(viewer.full_name)} />
    ) : (
      <ReelFeed {...feed} />
    );
  }

  const keys = [...ordered.keys];
  // The home tapped leads when it isn't one of them (any more).
  if (start && !keys.includes(start)) keys.unshift(start);
  // Everything up to the one tapped, and a few after; the rest as you go.
  const first = keys.slice(0, (start ? keys.indexOf(start) : 0) + REEL_PAGE);
  const posts = first.length ? await getReel(viewer, device, taste, { only: first, limit: first.length }) : [];
  return (
    <OrderedReel
      query={ordered.query}
      start={start}
      back={ordered.back}
      siteHeader={<SiteHeader overlay />}
      contained={contained}
      sender={viewer?.role === "agent" ? { profileComplete: Boolean(viewer.full_name) } : null}
      initial={posts}
      mode="public"
      infinite={keys.length > first.length}
      loadMore={loadOrderedReel.bind(null, from!, ordered.filters)}
      initialPhoto={photoParam(params.photo)}
      initialComment={comment}
      // Worked out once, here, for every home in it; never in the address.
      context={{ ...ordered.context, keys }}
      actions={publicReelActions}
      myName={name}
      prompt={PUBLIC_PROMPT}
    />
  );
}
