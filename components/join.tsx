"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CodeSignIn } from "@/components/code-sign-in";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import { card } from "@/lib/ui";

// Signing up, for visitors who haven't: the short form (on the home page's
// foot, and at the end of the homes) and the screen that ends the few homes
// someone signed out can browse. Browse itself opens straight on a home, with
// no form in front of it. Signed in, it's the feed, for as long as you scroll.

// After the free homes: sign up to keep going. Inside the feed's last screen.
export function JoinGate({ photo, devMode }: { photo?: ListingMedia; devMode: boolean }) {
  return (
    <>
      <Backdrop photo={photo} blurred />
      <div className="relative w-full max-w-sm">
        <h2 className="text-balance font-display text-3xl leading-tight sm:text-4xl">There&apos;s plenty more to see</h2>
        <p className="mt-2 text-white/85">Sign up free to keep going.</p>
        <SignUpForm devMode={devMode} className="mt-6 text-left" />
      </div>
    </>
  );
}

// A home's photo behind the words, dark enough to read them over. Tinted, it
// takes on the brand colour (the site's blue, on an agent's links), with a
// little shade under it so white words still read over a bright photo.
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
      {/* The site's blue is a mid tone: a little shade all over keeps white
          words readable, and more where they sit low on the photo. */}
      {tinted && <div className="absolute inset-0 bg-black/20" />}
      {tinted && <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/45 to-transparent" />}
    </div>
  );
}

export function SignUpForm({ devMode, className }: { devMode: boolean; className?: string }) {
  const router = useRouter();
  return (
    // Light, over the dark reel: the brand focus ring inside it.
    <div data-light className={cn(card, "p-5 text-ink shadow-xl sm:p-6 compact:p-4", className)}>
      <CodeSignIn
        withName
        withPhone
        label="Sign up"
        submitLabel="Sign up free"
        // (The same words as a link's sign-up sheet: someone back for more
        // learns this form signs them in too.)
        note={devMode ? "Local demo, no email sent." : "Free. No password. Signed up before? The same email works."}
        // Signed in where they are: the page becomes their feed. New here:
        // what they are first (a step at a time), then back here.
        onDone={({ welcome }) => {
          if (welcome) router.push(`/welcome?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          router.refresh();
        }}
      />
    </div>
  );
}

// The home page's "Sign up": down to the form at its foot (#start), gliding
// unless motion is reduced, and focus goes along. With a mouse, into its first
// box, ready to type; on a touch screen, to the form's heading (the next Tab,
// or swipe, is the first box), so no keyboard springs up mid-scroll. Without
// script it's the plain #start link.
export function SignUpJump({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a
      href="#start"
      className={className}
      onClick={(event) => {
        const start = document.getElementById("start");
        if (!start || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        start.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", "#start");
        const box = start.querySelector<HTMLInputElement>("form input");
        const to = matchMedia("(pointer: fine)").matches && box ? box : start.querySelector<HTMLElement>("h2[tabindex]");
        to?.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}
