"use client";

import { ArrowDown, ChevronDown, Heart, Phone, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  useTransition,
} from "react";
import { Toast } from "@/app/people/[id]/client";
import { AgentAvatar } from "@/components/agent-avatar";
import { LinkAgentProvider, type LinkAgent } from "@/components/agent-notes";
import { looksLikeEmail, ShareHeader, type ContactExtras, type LinkAccount } from "@/components/agent-card";
import { Backdrop } from "@/components/join";
import type { MapHome } from "@/components/listing-map";
import { useThread } from "@/components/listing-thread";
import { ReelFeed, useEndHomes } from "@/components/reel";
import { HomeThumb } from "@/components/ui";
import { phoneDigits } from "@/lib/contact";
import { agentFirstName, cn, formatPrice } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import type { ShareAgent } from "@/lib/shares";
import { button, focusOnDark } from "@/lib/ui";
import { recordHomeTime, recordOpen, reuseTake, type AskResult } from "./actions";

type ReelProps = ComponentProps<typeof ReelFeed>;

// Wide enough for the map beside the welcome's words (Tailwind's lg).
const WIDE = "(min-width: 64rem)";

// The map draws with WebGL in the browser, so it never renders on the server.
const ListingMap = dynamic(() => import("@/components/listing-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-white/10" />,
});

// Down to the first home, and focus with it: from the welcome screen, or from
// Contact before any home has been seen. A link's page has the one feed.
function goToFirstHome() {
  const reel = document.querySelector<HTMLElement>("[data-reel]");
  const first = reel?.querySelector<HTMLElement>('[data-panel="1"]');
  if (!reel || !first) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Each screen is the feed's height; the first home is the second screen.
  reel.scrollTo({ top: reel.clientHeight, behavior: still ? "auto" : "smooth" });
  if (!first.hasAttribute("tabindex")) first.setAttribute("tabindex", "-1");
  first.focus({ preventScroll: true });
}

// How long after the last new photo the count of photos seen goes to the agent.
const SEEN_AFTER_MS = 1500;
// Time on a home stops counting this long after they last touched the page.
const IDLE_MS = 2 * 60 * 1000;
// How often the time spent on each home goes to the agent while it's open.
const REPORT_TIME_MS = 30 * 1000;

// The photos this phone has looked at on a link, kept between visits so a
// second look adds to the first. (Just this browser's own note.)
function seenBefore(token: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(`buybox:seen:${token}`) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((photo): photo is string => typeof photo === "string") : []);
  } catch {
    return new Set();
  }
}

function keepSeen(token: string, seen: Set<string>) {
  try {
    localStorage.setItem(`buybox:seen:${token}`, JSON.stringify([...seen]));
  } catch {
    // Private windows may not keep it: this visit still counts.
  }
}

// Brings a home on the link into view, the way a pin on the map does (the
// feed's `focus`), and the keyboard with it, once it's there.
function focusHome(listingKey: string) {
  const home = document.querySelector<HTMLElement>(`[data-reel] [data-home="${CSS.escape(listingKey)}"]`);
  if (!home) return;
  if (!home.hasAttribute("tabindex")) home.setAttribute("tabindex", "-1");
  home.focus({ preventScroll: true });
}

// A home on the link they liked, for asking the agent for more like it.
type LikedHome = { listingKey: string; address: string };

// Contact, and the way back to a home, from anywhere on the link (the welcome
// screen's map, the end screen's homes).
type LinkTools = {
  open: () => void;
  first: string;
  goToHome: (listingKey: string) => void;
  // Signed in to Porchcard (as the page last loaded).
  signedIn: boolean;
  // The agent looking at their own link: nothing here is for them.
  preview: boolean;
};
const ContactAgent = createContext<LinkTools>({
  open: () => {},
  first: "your agent",
  goToHome: () => {},
  signedIn: false,
  preview: false,
});

// "Hi Dana, could you send me more homes like 4127 Larkmoor Ave NE and 96
// Fernhollow Ln?", as a text where the agent shows a phone, or else an email;
// a row in Contact. Built from the digits and a checked address only.
function askForMoreHref(agent: ShareAgent, first: string, liked: LikedHome[]) {
  const like = liked.length > 0 ? liked.slice(0, 2).map((home) => home.address).join(" and ") : "the ones on my link";
  const body = `Hi ${first}, could you send me more homes like ${like}?`;
  const phone = phoneDigits(agent.contact_phone);
  if (phone) return `sms:${phone}?&body=${encodeURIComponent(body)}`;
  if (looksLikeEmail(agent.contact_email)) {
    return `mailto:${agent.contact_email}?subject=${encodeURIComponent("More homes like these")}&body=${encodeURIComponent(body)}`;
  }
  return null;
}

// The agent's link: the homes, under the agent's own header. The header knows
// which home is on screen, so "Contact" can be about that one.
export function ShareReel({
  token,
  agent,
  whoCanSee,
  askToSee,
  preview,
  notes,
  focus: opensOn = null,
  initialComment,
  account = null,
  extras,
  ...reel
}: Omit<ReelProps, "mode" | "header" | "onActiveChange" | "onPhotoSeen"> & {
  token: string;
  agent: ShareAgent;
  whoCanSee: string;
  askToSee: (listingKey: string) => Promise<AskResult>;
  // The agent's own look at their link, said in the header ("Viewing as Dana").
  preview?: string;
  // The agent on their own link: their first pass, who it's for, and the way
  // back to the dashboard.
  notes?: LinkAgent["notes"];
  // Someone signed in: their menu and the bell, in the agent's header.
  account?: LinkAccount | null;
  // What Contact offers them beyond reaching the agent.
  extras?: ContactExtras;
  // From a notification about a comment: the home it opens on (`focus`)
  // opens on its comments, at that one.
  initialComment?: string;
}) {
  const homes = reel.initial.map((post) => post.listing);
  // The home it opens on (from a notification, `?home=`), then any picked on
  // the end screen: the feed goes to each.
  const [focus, setFocus] = useState(opensOn);
  // The home on screen, or the last one seen (from the end screen). Before any,
  // on a link of one home, that home.
  const [seen, setSeen] = useState<string | null>(
    opensOn?.key ?? (homes.length === 1 ? homes[0].ListingKey : null),
  );
  const [contact, setContact] = useState(false);
  const home = homes.find((listing) => listing.ListingKey === seen);
  const first = agentFirstName(agent.full_name);
  // The homes they liked here, in the link's order (the page reloads with
  // each heart, so this keeps up).
  const liked = useMemo(
    () =>
      reel.initial
        .filter((post) => post.mine.reaction === "like")
        .map((post) => ({ listingKey: post.listing.ListingKey, address: post.listing.UnparsedAddress })),
    [reel.initial],
  );
  const tools: LinkTools = {
    open: () => setContact(true),
    first,
    goToHome: (listingKey) => {
      setFocus((now) => ({ key: listingKey, n: (now?.n ?? 0) + 1 }));
      // Once the feed has started on its way there.
      requestAnimationFrame(() => focusHome(listingKey));
    },
    signedIn: Boolean(account),
    preview: Boolean(notes),
  };

  // The photos this browser has looked at, of the homes on the link now (a
  // home taken off it since doesn't count), and how many the agent has heard of.
  const looked = useRef<Set<string> | null>(null);
  const told = useRef(0);
  const shown = useRef(false);
  const seenTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onLink = useRef(homes);
  useLayoutEffect(() => {
    onLink.current = homes;
  });
  const seenCount = () => {
    looked.current ??= seenBefore(token);
    let n = 0;
    for (const photo of looked.current) {
      const at = photo.lastIndexOf(":");
      const home = onLink.current.find((listing) => listing.ListingKey === photo.slice(0, at));
      if (home && Number(photo.slice(at + 1)) < home.Media.length) n++;
    }
    return n;
  };
  // Where they spend their time, for the agent: how long each home is on screen
  // while the page is in front of them and they're using it (a phone left
  // lying on a home stops counting after a while), and how many of each home's
  // photos they've looked at. Said every half-minute, and when the page is put
  // away or closed.
  const onScreen = useRef<string | null>(homes.length === 1 ? homes[0].ListingKey : null);
  const timing = useRef({ since: 0, lastUse: 0, spent: new Map<string, number>(), photosTold: new Map<string, number>() });
  const bankTime = useRef(() => {});
  const tellTime = useRef(() => {});
  useLayoutEffect(() => {
    bankTime.current = () => {
      const t = timing.current;
      const now = Date.now();
      if (t.since && onScreen.current && shown.current) {
        const until = Math.min(now, t.lastUse + IDLE_MS);
        if (until > t.since) t.spent.set(onScreen.current, (t.spent.get(onScreen.current) ?? 0) + until - t.since);
      }
      t.since = document.visibilityState === "visible" ? now : 0;
    };
    tellTime.current = () => {
      if (!shown.current) return;
      bankTime.current();
      const t = timing.current;
      looked.current ??= seenBefore(token);
      const report = onLink.current.flatMap((listing) => {
        const key = listing.ListingKey;
        const seconds = Math.floor((t.spent.get(key) ?? 0) / 1000);
        let photos = 0;
        for (const photo of looked.current!) {
          const at = photo.lastIndexOf(":");
          if (photo.slice(0, at) === key && Number(photo.slice(at + 1)) < listing.Media.length) photos++;
        }
        const morePhotos = photos > (t.photosTold.get(key) ?? 0);
        if (seconds < 1 && !morePhotos) return [];
        // What's sent is taken off; the part of a second left keeps counting.
        t.spent.set(key, (t.spent.get(key) ?? 0) - seconds * 1000);
        t.photosTold.set(key, photos);
        return [{ listingKey: key, seconds, photos }];
      });
      if (report.length) recordHomeTime(token, report).catch(() => {});
    };
  });
  useEffect(() => {
    const used = () => {
      const now = Date.now();
      // Back after a while away: the time away doesn't count.
      if (now - timing.current.lastUse > IDLE_MS) bankTime.current();
      timing.current.lastUse = now;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") tellTime.current();
      else if (shown.current) timing.current.since = timing.current.lastUse = Date.now();
    };
    const now = () => tellTime.current();
    const every = setInterval(now, REPORT_TIME_MS);
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const event of events) document.addEventListener(event, used, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", now);
    return () => {
      clearInterval(every);
      for (const event of events) document.removeEventListener(event, used, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", now);
      now();
    };
  }, []);

  // Tells the agent how many photos have been looked at, if that's more than
  // they know. Only once the page has been on screen.
  const tellSeen = useRef(() => {});
  useLayoutEffect(() => {
    tellSeen.current = () => {
      clearTimeout(seenTimer.current);
      if (!shown.current) return;
      const count = seenCount();
      if (count <= told.current) return;
      told.current = count;
      recordOpen(token, count).catch(() => {});
    };
  });

  // Lets the agent see the link was opened, once it's really on someone's
  // screen: a page loaded out of sight (a preview, a tab opened behind) waits
  // until it's shown. With it goes how many photos this browser had already
  // looked at here. Nothing shows for it here.
  useEffect(() => {
    const record = () => {
      if (document.visibilityState !== "visible") return false;
      shown.current = true;
      timing.current.since = timing.current.lastUse = Date.now();
      const count = seenCount();
      told.current = Math.max(told.current, count);
      recordOpen(token, count || undefined).catch(() => {});
      return true;
    };
    if (record()) return;
    const onShow = () => {
      if (record()) document.removeEventListener("visibilitychange", onShow);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
    // (Once per link: what it counts is read from refs.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // And how many of the link's photos have been looked at: a moment after the
  // last one settles, so swiping through sends one count, not many; at once
  // if the page is put away or closed first.
  useEffect(() => {
    const now = () => tellSeen.current();
    const onChange = () => {
      if (document.visibilityState === "hidden") now();
    };
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("pagehide", now);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", now);
      now();
    };
  }, []);
  const photoSeen = (listingKey: string, index: number) => {
    looked.current ??= seenBefore(token);
    const photo = `${listingKey}:${index}`;
    if (!looked.current.has(photo)) {
      looked.current.add(photo);
      keepSeen(token, looked.current);
    }
    clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(() => tellSeen.current(), SEEN_AFTER_MS);
  };

  const linkAgent = useMemo(
    (): LinkAgent => ({
      agent: { full_name: agent.full_name, photo_data_url: agent.photo_data_url, is_agent: agent.is_agent },
      notes: notes ?? null,
    }),
    [agent.full_name, agent.photo_data_url, agent.is_agent, notes],
  );

  return (
    <ContactAgent.Provider value={tools}>
      <LinkAgentProvider value={linkAgent}>
      <ReelFeed
        {...reel}
        mode="share"
        focus={focus}
        // (Only when there's one to open on.)
        {...(initialComment && { initialComment })}
        tour={notes ? "notes" : "link"}
        {...(notes?.step && { introLabel: "Add your feedback" })}
        onActiveChange={(key) => {
          // The time on the home that was on screen counts up to now.
          bankTime.current();
          onScreen.current = key ?? null;
          if (key) setSeen(key);
        }}
        onPhotoSeen={photoSeen}
        header={
          <ShareHeader
            agent={agent}
            home={home ? { listingKey: home.ListingKey, address: home.UnparsedAddress } : null}
            homesCount={homes.length}
            whoCanSee={whoCanSee}
            onAsk={askToSee}
            onSeeHomes={() => {
              setContact(false);
              // Once the sheet has closed and given focus back.
              requestAnimationFrame(goToFirstHome);
            }}
            open={contact}
            onOpenChange={setContact}
            preview={preview}
            notes={notes ?? null}
            account={account}
            extras={extras}
            askMore={askForMoreHref(agent, first, liked)}
          />
        }
      />
      </LinkAgentProvider>
      {/* Where following the agent says if it didn't work. */}
      {extras?.follow && <Toast />}
    </ContactAgent.Provider>
  );
}

// Every link starts with a word from the agent, on a blurred wash of the
// first home's photo: who it's from, their headline and note, and the way on
// to the homes below, a button and a gently bobbing arrow at the foot. On a
// wide screen, beside it, a map of where the homes are, each a pin that goes
// straight to that home. (Built here rather than on the server, like the end
// screen, so the feed is handed one element.)
export function ShareWelcome({
  agent,
  greeting,
  note,
  count,
  photo,
  sample,
  whoCanSee,
  profile = null,
  homes = [],
}: {
  agent: ShareAgent;
  greeting: string;
  note: string;
  count: number;
  photo?: ListingMedia;
  sample: boolean;
  whoCanSee: string;
  // The agent's own page, once they have one: their face and name go there.
  profile?: string | null;
  // The homes on the link that have a place on the map, in the link's order.
  homes?: MapHome[];
}) {
  const { goToHome } = useContext(ContactAgent);
  const [hovered, setHovered] = useState<string | null>(null);
  // Only on a wide screen is there room beside the words: a phone never
  // loads the map at all.
  const wide = useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", changed);
      return () => query.removeEventListener("change", changed);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const mapped = wide && homes.length > 0;
  const who = (
    <>
      <AgentAvatar agent={agent} size={72} sizes="size-14 sm:size-18" decorative className="text-lg ring-2 ring-white/70 sm:text-xl" />
      <span className="min-w-0 leading-snug">
        <span className="block truncate font-semibold">{agent.full_name}</span>
        {agent.brokerage && <span className="block truncate text-sm text-white/85">{agent.brokerage}</span>}
      </span>
    </>
  );
  return (
    <div className="relative flex h-full flex-col">
      <Backdrop photo={photo} priority blurred tinted />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-10">
        <div
          className={cn(
            "mx-auto my-auto w-full max-w-2xl py-6 [@media(max-height:44rem)]:py-4",
            mapped && "lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12",
          )}
        >
          <div className="min-w-0">
          {/* On a short screen the header above already says who it's from. */}
          <div className="mb-5 flex [@media(max-height:44rem)]:hidden">
            {profile ? (
              <Link
                href={profile}
                className={cn("-m-1.5 flex min-w-0 items-center gap-3 rounded-2xl p-1.5 hover:bg-white/10", focusOnDark)}
              >
                {who}
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-3">{who}</div>
            )}
          </div>
          <h1 className="text-balance font-display text-4xl leading-tight sm:text-5xl [@media(max-height:44rem)]:text-3xl">
            {greeting}
          </h1>
          {note && (
            <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-white/90 [@media(max-height:44rem)]:text-base">
              {note}
            </p>
          )}
          <SeeHomes count={count} />
          <p className="mt-6 text-pretty text-xs leading-relaxed text-white/80 [@media(max-height:44rem)]:mt-4">
            {sample && "Sample listings, not for sale. "}
            {whoCanSee}
          </p>
          </div>
          {/* Where they are: each pin goes to that home. On a wide screen
              only, where it sits beside the words rather than in the way of
              a swipe. */}
          {mapped && (
            <section
              aria-label={count === 1 ? "Where the home is" : `Where the ${count} homes are`}
              className="relative h-[min(36rem,70vh)] overflow-hidden rounded-3xl bg-stone-200 text-ink shadow-2xl ring-1 ring-white/30"
            >
              <ListingMap
                homes={homes}
                activeKey={null}
                hoveredKey={hovered}
                onHover={setHovered}
                onSelect={goToHome}
                // The wheel over the map scrolls on down to the homes, as it
                // does anywhere else on this screen; the buttons zoom it.
                cooperative
              />
            </section>
          )}
        </div>
      </div>
      {/* The homes are below: an arrow at the foot, bobbing, to say so. A tap
          on it goes there too (the button above does the same for keyboards
          and screen readers). */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={goToFirstHome}
        className="relative mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] flex shrink-0 flex-col items-center gap-0.5 rounded-full px-4 pt-1 text-meta font-medium text-white/80 transition-colors hover:text-white"
      >

        <ChevronDown size={26} strokeWidth={2.25} className="animate-[nudge-down_1.6s_ease-in-out_infinite]" />
      </button>
    </div>
  );
}

// The last step of sending homes, said plainly before the homes: add your
// feedback (a like or a comment on each), or skip it. And where they've given
// their feedback on these homes for someone else, one tap brings it here.
export function ThoughtsIntro({
  token,
  photo,
  count,
  client,
  done,
  earlier,
}: {
  token: string;
  photo?: ListingMedia;
  count: number;
  // Who the link is for ("" on one anyone can join).
  client: string;
  // Where Skip goes: the link, ready to copy.
  done: string;
  // How many of these homes they've given feedback on before, on another link.
  earlier: number;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="relative flex h-full flex-col">
      <Backdrop photo={photo} priority blurred tinted />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-10">
        <div className="mx-auto my-auto flex w-full max-w-md flex-col items-center py-6 text-center">
          <p className="text-meta font-semibold uppercase tracking-wider text-white/85">Step 3 of 3</p>
          <h1 className="mt-2 text-balance font-display text-4xl leading-tight sm:text-5xl">Add your feedback</h1>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-white/90">
            Like or comment on {count === 1 ? "the home" : "the homes"}
            {client ? `, so ${client} sees what you think` : ""}. Or skip this step.
          </p>
          <button type="button" onClick={goToFirstHome} className={cn(button({ kind: "light", size: "lg" }), "mt-8 w-full max-w-xs shadow-lg")}>
            Add feedback
          </button>
          <Link href={done} className={cn(button({ kind: "glass", size: "lg" }), "mt-3 w-full max-w-xs")}>
            Skip this step
          </Link>
          {earlier > 0 && (
            <div className="mt-8 w-full rounded-2xl bg-black/45 p-4 ring-1 ring-white/15 backdrop-blur-md">
              <p className="text-pretty text-body leading-snug">
                {count === 1
                  ? "You've already given feedback on this home, on another link."
                  : `You've already given feedback on ${earlier} of these homes, on other links.`}
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => void (await reuseTake(token)))}
                className={cn(button({ kind: "light" }), "mt-3 disabled:opacity-60")}
              >
                {pending ? "Adding…" : "Use the same feedback"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// After the last home, one thing to do. While a home is still unrated: the
// homes, small, each with its heart and X. Once every home is rated: who sees
// what was said, and one way on. Signed out, that's signing up (to keep what
// they liked and get more like it); signed in, more homes like these. (The
// agent, looking at their own link, sees the homes as their client will.)
// Reaching the agent, asking for more and leaving the link are all in Contact,
// in the header; bringing someone in is under More.
export function ShareEnd({
  agentName,
  count,
  onProfile = false,
}: {
  agentName: string;
  count: number;
  // What they do here shows on their own profile too, so the screen says so.
  onProfile?: boolean;
}) {
  const tools = useContext(ContactAgent);
  const end = useEndHomes();
  // `canReact` turns true the moment they've joined, before the page knows
  // they're signed in: the way on changes with it, with no reload.
  const { canReact, ensureName } = useThread();
  const [joining, setJoining] = useState(false);
  if (count === 0) return <EmptyLink />;
  const homes = end?.homes ?? [];
  // Still something they haven't said yes or no to: the screen asks.
  const asking = !tools.preview && homes.some((home) => !home.reaction);
  const signedOut = !canReact && !tools.signedIn;
  // On a phone, three homes sit in one row so the whole screen fits without
  // a scroll; the heart and the X draw in a little to keep clear of each other.
  const three = homes.length === 3;
  const signUp = async () => {
    if (joining) return;
    setJoining(true);
    try {
      await ensureName();
    } finally {
      setJoining(false);
    }
  };
  return (
    <div className="flex w-full flex-col items-center">
      <h2 className="text-balance font-display text-3xl">{asking ? "What did you think?" : "That's all"}</h2>
      <p className="mt-2 max-w-sm text-balance text-white/85">
        {tools.preview
          ? "Here they can like or pass on each home."
          : asking
            ? "Tap the heart or the X on each home."
            : `${agentName} sees your likes and comments.${onProfile ? " They show on your profile too." : ""}`}
      </p>
      {/* Every home on the link, small: a heart and an X on each, saying what
          they made of it already, a tap from saying it now (or changing their
          mind). The photo goes back to that home. (The agent, looking at their
          own link, sees it as their client will; the buttons there are the
          client's to tap.) */}
      {end && homes.length > 0 && (
        <ul
          aria-label="The homes"
          className={cn(
            "mt-6 grid w-full gap-3 text-left",
            homes.length === 1
              ? "max-w-xs grid-cols-1"
              : homes.length === 2
                ? "max-w-xl grid-cols-2"
                : three
                  ? "max-w-3xl grid-cols-3"
                  : "max-w-3xl grid-cols-2 sm:grid-cols-3",
          )}
        >
          {homes.map((home) => (
            <li key={home.key} className="min-w-0">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => tools.goToHome(home.key)}
                  aria-label={`See ${home.address}`}
                  className={cn("block w-full rounded-2xl", focusOnDark)}
                >
                  <HomeThumb
                    src={home.photo}
                    sizes={three ? "(min-width: 640px) 256px, 33vw" : "(min-width: 640px) 256px, 50vw"}
                    className="aspect-[4/3] w-full rounded-2xl"
                  />
                </button>
                <button
                  type="button"
                  aria-label={`${home.address}: pass`}
                  aria-pressed={home.reaction === "dislike"}
                  onClick={() => end.choose(home.key, "dislike")}
                  className={cn(
                    "absolute bottom-2 left-2 flex size-11 items-center justify-center rounded-full ring-1 ring-white/25 backdrop-blur-md transition-colors",
                    three && "max-sm:bottom-1 max-sm:left-1",
                    home.reaction === "dislike" ? "bg-amber-600 text-white" : "bg-black/50 text-white hover:bg-black/70",
                    focusOnDark,
                  )}
                >
                  <X aria-hidden size={22} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  aria-label={`${home.address}: like`}
                  aria-pressed={home.reaction === "like"}
                  onClick={() => end.choose(home.key, "like")}
                  className={cn(
                    "absolute bottom-2 right-2 flex size-11 items-center justify-center rounded-full ring-1 ring-white/25 backdrop-blur-md transition-colors",
                    three && "max-sm:bottom-1 max-sm:right-1",
                    home.reaction === "like" ? "bg-rose-600 text-white" : "bg-black/50 text-white hover:bg-black/70",
                    focusOnDark,
                  )}
                >
                  <Heart aria-hidden size={22} strokeWidth={2.5} className={home.reaction === "like" ? "fill-white" : undefined} />
                </button>
              </div>
              <p className="mt-1.5 truncate font-display text-lg leading-tight">{formatPrice(home.price)}</p>
              <p className="truncate text-sm text-white/80">{home.address}</p>
            </li>
          ))}
        </ul>
      )}
      {/* Everything rated: the one way on. White, the strongest thing on the
          brand-tinted photo (a brand button would sink into it). */}
      {!tools.preview && !asking && (
        <div className="mt-6 flex w-full max-w-sm flex-col items-center">
          {signedOut ? (
            <>
              <p className="text-balance text-white/90">Save what you liked and get more homes like them. Free, no password.</p>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={signUp}
                aria-disabled={joining}
                className={cn(button({ kind: "light", size: "lg", block: true }), "mt-3 shadow-lg", joining && "opacity-60")}
              >
                Sign up to save your picks
              </button>
            </>
          ) : (
            <Link href="/" className={cn(button({ kind: "light", size: "lg", block: true }), "shadow-lg")}>
              See more homes like these
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// On the welcome screen: down to the first home, for anyone who'd rather tap
// than swipe. Focus goes with it.
function SeeHomes({ count }: { count: number }) {
  return (
    <button
      type="button"
      onClick={goToFirstHome}
      className={cn(button({ kind: "light", size: "lg" }), "mt-8 shadow-lg [@media(max-height:44rem)]:mt-6")}
    >
      <ArrowDown aria-hidden size={18} />
      {count === 1 ? "See the home" : `See the ${count} homes`}
    </button>
  );
}

// Every home has been taken off the link: says so, and how to reach the agent.
function EmptyLink() {
  const contact = useContext(ContactAgent);
  return (
    <div className="relative flex w-full max-w-md flex-col items-center">
      <h1 className="text-balance font-display text-3xl">No homes here right now</h1>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={contact.open}
        className={cn(button({ kind: "light", size: "lg" }), "mt-6")}
      >
        <Phone aria-hidden size={18} />
        Contact {contact.first}
      </button>
    </div>
  );
}
