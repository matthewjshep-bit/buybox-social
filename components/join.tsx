"use client";

import { ArrowUp, ChevronDown, MailCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useId, type ComponentProps } from "react";
import { signUp, type SignUpField, type SignUpState } from "@/app/login/actions";
import { cn } from "@/lib/format";
import type { ListingMedia } from "@/lib/listings/types";
import { button, card, field } from "@/lib/ui";

// For visitors who haven't signed up, the home page opens on what BuyBox
// Social is and a short form, shows a few homes, then asks them to sign up to
// keep going. Signed in, it's the feed, for as long as you scroll.

// The first screen: what this is, the form, and a nudge to look at homes first.
export function JoinIntro({ photo, devMode }: { photo?: ListingMedia; devMode: boolean }) {
  return (
    <div className="relative flex h-full flex-col overflow-y-auto overscroll-contain">
      <Backdrop photo={photo} priority />
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-5 pb-4 pt-[calc(env(safe-area-inset-top)_+_4.25rem)] sm:px-10 md:flex-row md:items-center md:justify-between md:gap-16">
        <div className="md:max-w-md">
          <h1 className="text-balance font-display text-4xl leading-[1.05] sm:text-5xl md:text-6xl">
            Every home for sale, one swipe at a time.
          </h1>
          <p className="mt-3 leading-relaxed text-white/85 sm:text-lg md:mt-4">
            Heart what you love, see what other buyers think, and your matches get sharper as you go.
          </p>
        </div>
        <SignUpForm devMode={devMode} className="w-full md:max-w-sm" />
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
          sizes={blurred ? "256px" : "100vw"}
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

// "Swipe up": takes you to the first home, for anyone who'd rather tap.
function SeeHomes() {
  return (
    <button
      type="button"
      onClick={(event) => {
        const reel = event.currentTarget.closest<HTMLElement>("[data-reel]");
        reel?.scrollTo({ top: reel.clientHeight, behavior: "smooth" });
      }}
      className="relative mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 font-semibold hover:bg-white/10"
    >
      {/* Phones swipe up; a mouse or trackpad scrolls down. It bounces three times, then rests. */}
      <ArrowUp
        aria-hidden
        size={20}
        className="animate-bounce [animation-iteration-count:3] motion-reduce:animate-none pointer-fine:hidden"
      />
      <ChevronDown
        aria-hidden
        size={20}
        className="hidden animate-bounce [animation-iteration-count:3] motion-reduce:animate-none pointer-fine:block"
      />
      <span className="pointer-fine:hidden">Swipe up to see homes</span>
      <span className="hidden pointer-fine:inline">Scroll to see homes</span>
    </button>
  );
}

function SignUpForm({ devMode, className }: { devMode: boolean; className?: string }) {
  const id = useId();
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUp, {});

  if (state.sent) {
    return (
      <div role="status" data-light className={cn(card, "p-6 text-ink shadow-xl", className)}>
        <MailCheck aria-hidden size={28} className="text-brand" />
        <p className="mt-3 text-lg font-semibold">Check your email</p>
        <p className="mt-1 text-stone-700">
          We sent a sign-in link to <span className="font-semibold">{state.email}</span>. Open it on this device to
          finish signing up.
        </p>
      </div>
    );
  }

  const fieldProps = (name: SignUpField) => ({
    id: `${id}-${name}`,
    name,
    required: true,
    defaultValue: state.values?.[name],
    "aria-invalid": state.field === name || undefined,
    "aria-describedby": state.field === name ? `${id}-error` : undefined,
  });

  return (
    // After a mistake, what was typed comes back (each field's default).
    <form
      action={action}
      aria-label="Sign up"
      // Light, over the dark reel: the brand focus ring inside it.
      data-light
      className={cn(card, "p-5 text-ink shadow-xl sm:p-6", className)}
    >
      <div className="flex flex-col gap-2.5">
        <Field label="Name" {...fieldProps("fullName")} maxLength={80} autoComplete="name" />
        <Field label="Phone" {...fieldProps("phone")} type="tel" inputMode="tel" maxLength={30} autoComplete="tel" />
        <Field label="Email" {...fieldProps("email")} type="email" autoComplete="email" />
      </div>
      {state.error && (
        <p id={`${id}-error`} role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn(button({ kind: "primary", size: "lg", block: true }), "mt-4")}
      >
        {pending ? "One moment…" : "Sign up free"}
      </button>
      <p className="mt-3 text-center text-sm text-muted">
        {devMode ? "Local demo, no email sent." : "No password needed."}{" "}
        <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
          Have an account? Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({ label, id, ...input }: { label: string; id: string } & ComponentProps<"input">) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className={cn(field(), "mt-1")}
      />
    </div>
  );
}
