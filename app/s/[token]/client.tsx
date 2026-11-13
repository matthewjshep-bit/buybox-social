"use client";

import { ArrowDown, Check, ChevronDown, Heart, Home, Mail, MessageSquare, Phone, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Toast } from "@/app/people/[id]/client";
import { AgentAvatar } from "@/components/agent-avatar";
import { LinkAgentProvider, type LinkAgent } from "@/components/agent-notes";
import { LeaveLink, looksLikeEmail, ShareHeader, type ContactExtras, type LinkAccount } from "@/components/agent-card";
import { Backdrop } from "@/components/join";
import { ReelFeed } from "@/components/reel";
import { phoneDigits } from "@/lib/contact";
import { agentFirstName, cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import type { ShareAgent } from "@/lib/shares";
import { button, card, focusOnDark } from "@/lib/ui";
import { recordHomeTime, recordOpen, type AskResult } from "./actions";

type ReelProps = ComponentProps<typeof ReelFeed>;

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

// A home on the link they liked, for the end screen's way back to it.
type LikedHome = { listingKey: string; address: string };

// Contact, and the rest of what the end screen offers, from anywhere on the
// link: the homes they liked (and the way back to each), asking the agent for
// more like them, and leaving a link that isn't theirs.
type LinkTools = {
  open: () => void;
  first: string;
  liked: LikedHome[];
  goToHome: (listingKey: string) => void;
  // "Ask Dana for more like these": a text or an email, ready to send, where
  // the agent shows a way; otherwise Contact.
  askHref: string | null;
  signedIn: boolean;
  // The agent looking at their own link: nothing here is for them.
  preview: boolean;
  leave: ContactExtras["leave"];
};
const ContactAgent = createContext<LinkTools>({
  open: () => {},
  first: "your agent",
  liked: [],
  goToHome: () => {},
  askHref: null,
  signedIn: false,
  preview: false,
  leave: null,
});

// "Hi Dana, could you send me more homes like 4127 Larkmoor Ave NE and 96
// Fernhollow Ln?", as a text where the agent shows a phone, or else an email.
// Built from the digits and a checked address only.
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
  note,
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
  note: string;
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
    liked,
    goToHome: (listingKey) => {
      setFocus((now) => ({ key: listingKey, n: (now?.n ?? 0) + 1 }));
      // Once the feed has started on its way there.
      requestAnimationFrame(() => focusHome(listingKey));
    },
    askHref: askForMoreHref(agent, first, liked),
    signedIn: Boolean(account),
    preview: Boolean(notes),
    leave: extras?.leave ?? null,
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
    (): LinkAgent => ({ agent: { full_name: agent.full_name, photo_data_url: agent.photo_data_url }, notes: notes ?? null }),
    [agent.full_name, agent.photo_data_url, notes],
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
            note={note}
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
// to the homes below, a button and a gently bobbing arrow at the foot. (Built
// here rather than on the server, like the end screen, so the feed is handed
// one element.)
export function ShareWelcome({
  agent,
  greeting,
  note,
  count,
  photo,
  sample,
  whoCanSee,
  profile = null,
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
}) {
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
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-10">
        <div className="mx-auto my-auto w-full max-w-2xl py-6 [@media(max-height:44rem)]:py-4">
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
            Tap the heart on anything you like, even something in a photo.{" "}
            {sample && "Sample listings, fictional and not for sale. "}
            {whoCanSee}
          </p>
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
        <span className="pointer-fine:hidden">Swipe up</span>
        <span className="hidden pointer-fine:inline">Scroll</span>
        <ChevronDown size={26} strokeWidth={2.25} className="animate-[nudge-down_1.6s_ease-in-out_infinite]" />
      </button>
    </div>
  );
}

// After the last home: who sees what was said, what to do next (back to the
// homes they liked, a word with the agent, more like them), and (on a link
// anyone can join) a way to bring someone else in.
export function ShareEnd({
  agentName,
  count,
  personal,
  token,
}: {
  agentName: string;
  count: number;
  // Someone's own link, which isn't one to pass on.
  personal: boolean;
  token: string;
}) {
  const tools = useContext(ContactAgent);
  if (count === 0) return <EmptyLink agentName={agentName} />;
  return (
    <div className="w-full max-w-md">
      <h2 className="text-balance font-display text-3xl">
        {count === 1 ? `That's the home ${agentName} picked` : "That's every home"}
      </h2>
      <p className="mt-2 text-white/85">
        {agentName} sees what you liked and said.{count > 1 && " Change your mind any time."}
      </p>
      {!tools.preview && <WhatsNext />}
      {!personal ? (
        <div data-light className={cn(card, "mt-8 p-5 text-ink")}>
          <h3 className="font-semibold">Deciding with someone?</h3>
          <p className="mt-1 text-sm text-muted">
            Send them this link so you can all weigh in here, together with {agentName}.
          </p>
          <InviteButton token={token} />
        </div>
      ) : (
        count > 1 && (
          <div data-light className={cn(card, "mt-8 p-5 text-ink")}>
            <h3 className="font-semibold">Deciding with someone?</h3>
            <p className="mt-1 text-sm text-muted">
              Ask {agentName} to add them. They&apos;ll get their own link, so you each pick what you like and{" "}
              {agentName} can see where you agree.
            </p>
          </div>
        )
      )}
      {tools.leave && !tools.preview && <LeaveLink first={tools.first} leave={tools.leave} onDark className="mt-6" />}
    </div>
  );
}

// The end of the link is never a dead end: the homes they liked, one tap back
// to each; a word with the agent; asking them for more like these; and, signed
// in, back to their own Porchcard home.
function WhatsNext() {
  const { open, first, liked, goToHome, askHref, signedIn } = useContext(ContactAgent);
  const id = useId();
  const ask = (
    <>
      {askHref?.startsWith("mailto:") ? <Mail aria-hidden size={18} /> : <Send aria-hidden size={18} />}
      Ask {first} for more like these
    </>
  );
  return (
    <section aria-labelledby={id} data-light className={cn(card, "mt-6 p-5 text-left text-ink")}>
      <h3 id={id} className="font-semibold">
        What&apos;s next
      </h3>
      {liked.length > 0 && (
        <>
          <p className="mt-1 text-sm text-muted">
            {liked.length === 1 ? "You liked 1 home" : `You liked ${liked.length} homes`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {liked.map((home) => (
              <li key={home.listingKey} className="min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => goToHome(home.listingKey)}
                  className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-stone-100 px-3.5 text-sm font-medium hover:bg-stone-200"
                >
                  <Heart aria-hidden size={14} className="shrink-0 fill-rose-600 text-rose-600" />
                  <span className="truncate">{home.address}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" aria-haspopup="dialog" onClick={open} className={button({ kind: "primary", block: true })}>
          <MessageSquare aria-hidden size={18} />
          Message {first}
        </button>
        {askHref ? (
          <a href={askHref} className={button({ kind: "secondary", block: true })}>
            {ask}
          </a>
        ) : (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={open}
            className={button({ kind: "secondary", block: true })}
          >
            {ask}
          </button>
        )}
        {signedIn && (
          <Link href="/" className={cn(button({ kind: "ghost", block: true }), "text-ink")}>
            <Home aria-hidden size={18} />
            Back to your Porchcard home
          </Link>
        )}
      </div>
    </section>
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
function EmptyLink({ agentName }: { agentName: string }) {
  const contact = useContext(ContactAgent);
  return (
    <div className="relative flex w-full max-w-md flex-col items-center">
      <h1 className="text-balance font-display text-3xl">There are no homes on this link right now</h1>
      <p className="mt-2 text-white/85">Ask {agentName} to send you more.</p>
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

function InviteButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const url = `${window.location.origin}/s/${token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Take a look at this home with me", url });
      } catch {
        // Closing the share sheet isn't an error.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Icon = copied ? Check : UserPlus;
  return (
    <button
      type="button"
      onClick={invite}
      className={cn(button({ kind: "primary" }), "mt-3")}
    >
      <Icon aria-hidden size={16} />
      {copied ? "Link copied" : "Invite someone"}
    </button>
  );
}
