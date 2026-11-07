"use client";

import { ArrowDown, Check, Phone, Share2 } from "lucide-react";
import Image from "next/image";
import { createContext, useContext, useEffect, useState, type ComponentProps } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { agentFirstName, focusOnDark, ShareHeader } from "@/components/agent-card";
import { Backdrop } from "@/components/join";
import { ReelFeed } from "@/components/reel";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import type { ShareAgent } from "@/lib/shares";
import { recordOpen, type AskResult } from "./actions";

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

// Contact, from anywhere on the link (the end screen of an empty one).
const ContactAgent = createContext<{ open: () => void; first: string }>({ open: () => {}, first: "your agent" });

// The agent's link: the homes, under the agent's own header. The header knows
// which home is on screen, so "Contact" can be about that one.
export function ShareReel({
  token,
  agent,
  note,
  caption,
  whoCanSee,
  askToSee,
  ...reel
}: Omit<ReelProps, "mode" | "header" | "onActiveChange"> & {
  token: string;
  agent: ShareAgent;
  note: string;
  // The greeting and note, when no welcome screen carries them (one home).
  caption?: { heading: string; note: string };
  whoCanSee: string;
  askToSee: (listingKey: string) => Promise<AskResult>;
}) {
  const homes = reel.initial.map((post) => post.listing);
  // The home on screen, or the last one seen (from the end screen). Before any,
  // on a link of one home, that home.
  const [seen, setSeen] = useState<string | null>(homes.length === 1 ? homes[0].ListingKey : null);
  // A link of one home opens on it; one with several, on the welcome screen.
  const [onHome, setOnHome] = useState(!reel.intro && homes.length > 0);
  const [contact, setContact] = useState(false);
  const home = homes.find((listing) => listing.ListingKey === seen);

  // Lets the agent see the link was opened, once it's really on someone's
  // screen. Nothing shows for it here.
  useEffect(() => {
    recordOpen(token).catch(() => {});
  }, [token]);

  return (
    <ContactAgent.Provider value={{ open: () => setContact(true), first: agentFirstName(agent.full_name) }}>
      <ReelFeed
        {...reel}
        mode="share"
        onActiveChange={(key) => {
          setOnHome(Boolean(key));
          if (key) setSeen(key);
        }}
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
            caption={caption}
            showCaption={onHome}
            open={contact}
            onOpenChange={setContact}
          />
        }
      />
    </ContactAgent.Provider>
  );
}

// A link with several homes starts with a word from the agent, over the first
// home's photo, with that home peeking up from below. (Built here rather than
// on the server, like the end screen, so the feed is handed one element.)
export function ShareWelcome({
  agent,
  greeting,
  note,
  count,
  photo,
  sample,
  whoCanSee,
}: {
  agent: ShareAgent;
  greeting: string;
  note: string;
  count: number;
  photo?: ListingMedia;
  sample: boolean;
  whoCanSee: string;
}) {
  return (
    <div className="relative flex h-full flex-col">
      <Backdrop photo={photo} priority blurred tinted />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-10">
        <div className="mx-auto mt-auto w-full max-w-2xl pb-6 [@media(max-height:44rem)]:pb-4">
          {/* On a short screen the header above already says who it's from. */}
          <div className="mb-5 flex items-center gap-3 [@media(max-height:44rem)]:hidden">
            <AgentAvatar agent={agent} size={56} decorative className="text-lg ring-2 ring-white/70" />
            <div className="min-w-0 leading-snug">
              <p className="truncate font-semibold">{agent.full_name}</p>
              {agent.brokerage && <p className="truncate text-sm text-white/85">{agent.brokerage}</p>}
            </div>
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
          <p className="mt-6 text-xs leading-relaxed text-white/80 [@media(max-height:44rem)]:mt-4">
            Tap the heart on anything you like, even something in a photo.{" "}
            {sample && "Sample listings, fictional and not for sale. "}
            {whoCanSee}
          </p>
        </div>
      </div>
      {photo && (
        // A tap on the first home, peeking up, goes to it. The button above
        // does the same for keyboards and screen readers.
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={goToFirstHome}
          className="relative mx-auto block h-24 w-full max-w-2xl shrink-0 overflow-hidden rounded-t-3xl shadow-[0_-8px_30px_rgb(0_0_0/0.35)] sm:w-[calc(100%-5rem)] [@media(max-height:44rem)]:h-16"
        >
          <Image src={photo.MediaURL} alt="" fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" />
        </button>
      )}
    </div>
  );
}

// After the last home: who sees what was said, and (on a link anyone can
// join) a way to bring someone else in.
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
  if (count === 0) return <EmptyLink agentName={agentName} />;
  return (
    <div className="w-full max-w-md">
      <h2 className="text-balance font-display text-3xl">
        {count === 1 ? `That's the home ${agentName} picked` : "That's every home"}
      </h2>
      <p className="mt-2 text-white/85">
        {agentName} sees what you liked and said.{count > 1 && " Change your mind any time."}
      </p>
      {!personal ? (
        <div className="mt-8 rounded-2xl bg-white p-5 text-ink">
          <h3 className="font-semibold">Deciding with someone?</h3>
          <p className="mt-1 text-sm text-stone-600">
            Send them this link so you can all weigh in here, together with {agentName}.
          </p>
          <InviteButton token={token} />
        </div>
      ) : (
        count > 1 && (
          <div className="mt-8 rounded-2xl bg-white p-5 text-ink">
            <h3 className="font-semibold">Deciding with someone?</h3>
            <p className="mt-1 text-sm text-stone-600">
              Ask {agentName} to add them. They&apos;ll get their own link, so you each pick what you like and{" "}
              {agentName} can see where you agree.
            </p>
          </div>
        )
      )}
    </div>
  );
}

// On the welcome screen of a link with several homes: down to the first one,
// for anyone who'd rather tap than swipe. Focus goes with it.
function SeeHomes({ count }: { count: number }) {
  return (
    <div className="mt-8 inline-flex flex-col items-center gap-1.5 [@media(max-height:44rem)]:mt-6">
      <button
        type="button"
        onClick={goToFirstHome}
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-ink shadow-lg hover:bg-stone-100",
          focusOnDark,
        )}
      >
        <ArrowDown aria-hidden size={18} />
        {`See the ${count} homes`}
      </button>
      <p className="text-[13px] text-white/80">
        <span className="pointer-fine:hidden">or swipe up</span>
        <span className="hidden pointer-fine:inline">or scroll</span>
      </p>
    </div>
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
        className={cn(
          "mt-6 flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-ink hover:bg-stone-100",
          focusOnDark,
        )}
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

  const Icon = copied ? Check : Share2;
  return (
    <button
      type="button"
      onClick={invite}
      className="mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-brand px-5 font-semibold text-brand"
    >
      <Icon aria-hidden size={16} />
      {copied ? "Link copied" : "Invite someone"}
    </button>
  );
}
