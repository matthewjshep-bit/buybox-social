import type { ComponentProps } from "react";
import { loadOrderedReel } from "@/app/reel/actions";
import { FeedEnd } from "@/components/feed-end";
import { JoinGate } from "@/components/join";
import { commentParam, photoParam, PUBLIC_PROMPT, publicReelActions } from "@/components/listing-detail";
import { OrderedReel } from "@/components/ordered-reel";
import { QuickSendReel } from "@/components/quick-send";
import { ReelFeed } from "@/components/reel";
import { SiteHeader } from "@/components/site-header";
import { devLoginEnabled, getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel, REEL_PAGE } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { filtersOf, homesFrom } from "@/lib/reel-from";
import { getTaste } from "@/lib/taste";

export type ReelParams = Record<string, string | string[] | undefined>;

// How many homes someone signed out sees before they're asked to sign up.
const FREE_HOMES = 3;

// Homes one after another, full screen or (opened from a feed or someone's
// page, `contained`) on a stage over it. From a feed (`?from=feed`, someone's
// page by its id with the page's filter, an agent's client or link, your
// picks: see homesFrom) with the home tapped (`&home=`): that feed's homes,
// in its order, opened on that one, each saying why it's there. Otherwise
// (Browse, at /browse): every home, best matches for your taste first (or
// `?home=` first), as you scroll. `&comment=`: that home's comments open on
// that comment.
export async function ReelView({ params, contained = false }: { params: ReelParams; contained?: boolean }) {
  const from = typeof params.from === "string" && params.from.length <= 64 ? params.from : null;
  const start = typeof params.home === "string" && params.home.length <= 100 ? params.home : null;
  const comment = commentParam(params.comment);
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor, name } = await getPublicIdentity(viewer, device);
  const [taste, ordered] = await Promise.all([
    getTaste(visitor?.id),
    from ? homesFrom(from, filtersOf(params)) : null,
  ]);

  if (!ordered) {
    // Signed out: a few homes, the first one straight away (they came to see
    // homes, not a form), then asking them to sign up to see the rest.
    if (!viewer) {
      const posts = await getReel(viewer, device, taste);
      const free = posts.slice(0, FREE_HOMES);
      // The next home waits, blurred, behind the sign-up.
      const next = (posts[FREE_HOMES] ?? free.at(-1))?.listing.Media[0];
      return (
        <ReelFeed
          // Signing up comes back to this page: their homes, not this one's state.
          key="guest"
          initial={free}
          mode="public"
          contained={contained}
          actions={publicReelActions}
          myName={name}
          prompt={PUBLIC_PROMPT}
          header={contained ? undefined : <SiteHeader overlay />}
          // How it works, the first time, on the first home.
          tour="home"
          end={<JoinGate photo={next} devMode={devLoginEnabled} />}
        />
      );
    }
    // Opened on a home picked for them (from their feed), then the rest.
    // (Read together: a home asked for that isn't there leaves nothing out.)
    const [[picked], rest] = await Promise.all([
      start ? getReel(viewer, device, taste, { only: [start], limit: 1 }) : [],
      getReel(viewer, device, taste, start ? { exclude: [start] } : {}),
    ]);
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
  const posts = first.length ? await getReel(viewer, device, taste, { only: first, limit: first.length, people: ordered.people, profiles: ordered.profiles, mine: ordered.mine, agent: ordered.agent, host: ordered.host }) : [];
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
