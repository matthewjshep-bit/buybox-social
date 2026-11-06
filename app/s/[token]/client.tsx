"use client";

import { ArrowDown, Check, Share2 } from "lucide-react";
import Image from "next/image";
import { useState, type ComponentProps } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { ShareHeader } from "@/components/agent-card";
import { Backdrop } from "@/components/join";
import { ReelFeed } from "@/components/reel";
import type { ListingMedia } from "@/lib/listings/types";
import type { ShareAgent } from "@/lib/shares";
import type { AskResult } from "./actions";

type ReelProps = ComponentProps<typeof ReelFeed>;

// The agent's link: the homes, under the agent's own header. The header knows
// which home is on screen, so "Contact" can be about that one.
export function ShareReel({
  agent,
  note,
  heading,
  whoCanSee,
  askToSee,
  ...reel
}: Omit<ReelProps, "mode" | "header" | "onActiveChange"> & {
  agent: ShareAgent;
  note: string;
  // The greeting, when no welcome screen carries it.
  heading?: string;
  whoCanSee: string;
  askToSee: (listingKey: string) => Promise<AskResult>;
}) {
  const homes = reel.initial.map((post) => post.listing);
  // The home on screen, or the last one seen (from the end screen). Before any,
  // on a link of one home, that home.
  const [seen, setSeen] = useState<string | null>(homes.length === 1 ? homes[0].ListingKey : null);
  const home = homes.find((listing) => listing.ListingKey === seen);

  return (
    <ReelFeed
      {...reel}
      mode="share"
      onActiveChange={(key) => {
        if (key) setSeen(key);
      }}
      header={
        <ShareHeader
          agent={agent}
          note={note}
          home={home ? { listingKey: home.ListingKey, address: home.UnparsedAddress } : null}
          whoCanSee={whoCanSee}
          onAsk={askToSee}
          heading={heading}
        />
      }
    />
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
        <div
          aria-hidden
          className="relative mx-auto h-24 w-full max-w-2xl shrink-0 overflow-hidden rounded-t-3xl shadow-[0_-8px_30px_rgb(0_0_0/0.35)] sm:w-[calc(100%-5rem)] [@media(max-height:44rem)]:h-16"
        >
          <Image src={photo.MediaURL} alt="" fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" />
        </div>
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
  if (count === 0) return <p className="relative text-white/85">Ask {agentName} to send you more.</p>;
  return (
    <div className="w-full max-w-md">
      <h2 className="font-display text-3xl">
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
        onClick={(event) => {
          const reel = event.currentTarget.closest<HTMLElement>("[data-reel]");
          const first = reel?.querySelector<HTMLElement>('[data-panel="1"]');
          if (!reel || !first) return;
          const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          // Each screen is the feed's height; the first home is the second screen.
          reel.scrollTo({ top: reel.clientHeight, behavior: still ? "auto" : "smooth" });
          if (!first.hasAttribute("tabindex")) first.setAttribute("tabindex", "-1");
          first.focus({ preventScroll: true });
        }}
        className="flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-ink shadow-lg hover:bg-stone-100"
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
