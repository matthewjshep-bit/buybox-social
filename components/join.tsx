"use client";

import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CodeSignIn } from "@/components/code-sign-in";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import { button, card } from "@/lib/ui";

// For visitors who haven't signed up, the home page opens on what Porchcard
// is and a short form, shows a few homes, then asks them to sign up to
// keep going. Signed in, it's the feed, for as long as you scroll.

// The first screen: what this is, the form, and a way to look at homes first.
// It's a screen of the feed like any home, so a swipe anywhere on it goes on
// to the homes. On a short phone it tightens to fit; only on a phone on its
// side do the words scroll, starting under the header, before the next swipe
// goes on.
export function JoinIntro({ photo, devMode }: { photo?: ListingMedia; devMode: boolean }) {
  return (
    <div className="relative flex h-full flex-col pt-[calc(env(safe-area-inset-top)_+_4rem)] short:pt-[calc(env(safe-area-inset-top)_+_3.5rem)]">
      <Backdrop photo={photo} priority />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto my-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-3 sm:px-10 md:flex-row md:items-center md:justify-between md:gap-16 short:flex-row short:items-center short:justify-between short:gap-8 short:py-0">
          <div className="md:max-w-md short:min-w-0 short:flex-1">
            <h1 className="text-balance font-display text-4xl leading-[1.05] sm:text-5xl md:text-6xl max-md:compact:text-3xl short:text-3xl">
              The social way to shop for homes.
            </h1>
            <p className="mt-3 text-balance text-lg leading-snug text-white sm:text-xl md:mt-4 max-md:compact:mt-2 max-md:compact:text-base short:mt-2 short:text-base">
              Share listings with your clients and see exactly what they love.
            </p>
            {/* (The first to go where there's no room for it.) */}
            <p className="mt-3 leading-relaxed text-white/75 sm:text-base md:mt-4 max-md:compact:hidden short:hidden">
              React to every room, comment on every detail, and decide together.
            </p>
          </div>
          <SignUpForm devMode={devMode} className="w-full md:max-w-sm short:max-w-sm" />
        </div>
      </div>
      <SeeHomes />
    </div>
  );
}

// After the free homes: sign up to keep going. Inside the feed's last screen.
export function JoinGate({ photo, devMode }: { photo?: ListingMedia; devMode: boolean }) {
  return (
    <>
      <Backdrop photo={photo} blurred />
      <div className="relative w-full max-w-sm">
        <h2 className="text-balance font-display text-3xl leading-tight sm:text-4xl">There&apos;s plenty more to see</h2>
        <p className="mt-2 text-white/85">Sign up free to keep scrolling every home for sale.</p>
        <SignUpForm devMode={devMode} className="mt-6 text-left" />
      </div>
    </>
  );
}

// A home's photo behind the words, dark enough to read them over. Tinted, it
// takes on the brand colour (an agent's, on their links).
export function Backdrop({
  photo,
  priority,
  blurred,
  tinted,
}: {
  photo?: ListingMedia;
  priority?: boolean;
  blurred?: boolean;
  tinted?: boolean;
}) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-brand">
      {photo && (
        <Image
          src={photo.MediaURL}
          alt=""
          fill
          priority={priority}
          // Blurred, it's a wash of colour: a small copy is all it takes.
          sizes={blurred ? "64px" : "100vw"}
          className={cn("object-cover", blurred && "scale-110 blur-xl")}
        />
      )}
      <div
        className={cn(
          "absolute inset-0",
          tinted
            ? "bg-brand/70"
            : blurred
              ? "bg-black/60"
              : "bg-linear-to-b from-black/65 via-black/45 to-black/80 md:bg-linear-to-r md:from-black/75 md:via-black/45 md:to-black/30",
        )}
      />
      {/* Words sit low on a tinted photo: a little more shade there keeps them readable. */}
      {tinted && <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/45 to-transparent" />}
    </div>
  );
}

// Down to the first home, for anyone who'd rather tap than swipe, with the
// keyboard's place going along.
function SeeHomes() {
  const go = (from: HTMLElement) => {
    const reel = from.closest<HTMLElement>("[data-reel]");
    const first = reel?.querySelector<HTMLElement>('[data-panel="1"]');
    if (!reel || !first) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reel.scrollTo({ top: reel.clientHeight, behavior: still ? "auto" : "smooth" });
    if (!first.hasAttribute("tabindex")) first.setAttribute("tabindex", "-1");
    first.focus({ preventScroll: true });
  };
  return (
    <div className="relative flex shrink-0 items-center justify-center gap-3 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 short:pb-[max(0.5rem,env(safe-area-inset-bottom))] short:pt-0">
      <button
        type="button"
        onClick={(event) => go(event.currentTarget)}
        className={cn(button({ kind: "light" }), "shadow-lg")}
      >
        {/* It bounces three times, then rests. */}
        <ArrowDown
          aria-hidden
          size={18}
          className="animate-bounce [animation-iteration-count:3] motion-reduce:animate-none"
        />
        See homes
      </button>
      <p className="text-meta text-white/80">
        <span className="pointer-fine:hidden">or swipe up</span>
        <span className="hidden pointer-fine:inline">or scroll</span>
      </p>
    </div>
  );
}

function SignUpForm({ devMode, className }: { devMode: boolean; className?: string }) {
  const router = useRouter();
  return (
    // Light, over the dark reel: the brand focus ring inside it.
    <div data-light className={cn(card, "p-5 text-ink shadow-xl sm:p-6 compact:p-4", className)}>
      <CodeSignIn
        withName
        withPhone
        label="Sign up"
        submitLabel="Sign up free"
        note={devMode ? "Local demo, no email sent." : "Free, and no password. Signed up before? Use the same email."}
        // Signed in where they are: the page becomes their feed.
        onDone={() => router.refresh()}
      />
    </div>
  );
}

