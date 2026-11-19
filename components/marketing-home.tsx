import { DoorOpen, Heart, MessageCircle, Send, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignUpForm } from "@/components/join";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";
import { button, card, focusOnDark, glass, pill } from "@/lib/ui";

// The home page, signed out: what Porchcard is, at a glance. First the idea
// (a home with people's takes on it), then what it does for agents and
// brokers, then for buyers, then the sign-up. Two things to do at the top:
// Sign up, or see homes first. An agent's way in is a button of its own,
// where they're reading and again by the form (which makes a buyer's account).
// The pitch to agents is written once, here, and the page for agents
// (/for-agents) draws the same one.

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand">{children}</p>;
}

// A small soft dot where someone tapped, as on a home's photos.
function Spot({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn("absolute flex size-6 items-center justify-center", className)}>
      <span className="absolute size-6 animate-ping rounded-full bg-white/60 [animation-iteration-count:3]" />
      <span className="size-3.5 rounded-full bg-white ring-4 ring-white/40" />
    </span>
  );
}

// Someone's take, as a chip on a photo.
function Take({ who, what, className }: { who: string; what: string; className: string }) {
  return (
    <span
      aria-hidden
      className={cn(glass, "absolute flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-meta font-semibold shadow-lg", className)}
    >
      <Avatar name={who} size={6} />
      <Heart size={12} className="shrink-0 fill-rose-400 text-rose-400" />
      {what}
    </span>
  );
}

// A line of a conversation, as a card floating by the photo.
function Said({ who, agent = false, text, className }: { who: string; agent?: boolean; text: string; className?: string }) {
  return (
    <div aria-hidden className={cn(card, "flex items-start gap-2.5 p-3 shadow-xl", className)}>
      <Avatar name={who} tone={agent ? "agent" : "person"} size={8} />
      <p className="min-w-0 text-body leading-snug">
        <strong className="font-semibold">{who}</strong>
        {agent && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-tiny font-semibold text-stone-600">Agent</span>}
        <br />
        {text}
      </p>
    </div>
  );
}

// The idea in one picture: a home, what two people loved in it, and the talk about it.
function HeroPicture() {
  return (
    <div className="relative mx-auto w-full max-w-md pb-16 md:max-w-none md:pb-10">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-2xl">
        <Image
          src="/sample/tacoma-1.jpg"
          alt="A white farmhouse with a wraparound porch"
          fill
          priority
          sizes="(min-width: 768px) 480px, 100vw"
          className="object-cover"
        />
        <Spot className="left-[44%] top-[62%]" />
        <Spot className="left-[70%] top-[34%]" />
        <Take who="Nina" what="the porch" className="left-[18%] top-[70%]" />
        <Take who="Ben" what="the dormer windows" className="right-4 top-[22%]" />
      </div>
      <div className="absolute inset-x-3 bottom-0 flex flex-col gap-2 sm:inset-x-auto sm:-left-6 sm:w-72 md:-left-10">
        <Said who="Nina" text="That porch! Can we see it Saturday?" />
        <Said who="Jordan" agent text="Saturday at 10 works. I'll set it up." className="ml-8" />
      </div>
    </div>
  );
}

export function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-body leading-relaxed text-stone-700">{children}</span>
      </span>
    </li>
  );
}

// What agents are told, in one line and three: the same words on the home
// page and on the page for agents.
export const AGENT_HEADLINE = "Send a few homes. Learn exactly what they want.";

export function AgentFeatures() {
  return (
    <ul className="mt-8 flex flex-col gap-6">
      <Feature icon={<Send size={18} />} title="One link, your brand">
        Text it from your own phone.
      </Feature>
      <Feature icon={<Heart size={18} />} title="More than yes or no">
        See what they loved, and what put them off.
      </Feature>
      <Feature icon={<DoorOpen size={18} />} title="Know who’s ready">
        See who opened it and who wants a showing.
      </Feature>
    </ul>
  );
}

// For agents: the link their client opens, and what the agent sees back.
export function AgentPicture() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md md:max-w-none">
      <div className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-stone-700 shadow-2xl">
        <Image src="/sample/kirkland-1.jpg" alt="" fill sizes="(min-width: 768px) 520px, 100vw" className="scale-110 object-cover blur-md" />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/35 to-black/10" />
        <div className="absolute inset-x-0 top-0 p-6 text-white sm:p-8">
          <p className="flex items-center gap-2 text-meta font-semibold">
            <Avatar name="Jordan" tone="agent" size={7} className="ring-2 ring-white/70" />
            Jordan Rivera · Harbor &amp; Pine Realty
          </p>
          <p className="mt-3 max-w-xs text-balance font-display text-3xl leading-tight">Nina, I picked these 3 homes for you</p>
          <span className={cn(button({ kind: "light" }), "mt-4 pointer-events-none")}>See the 3 homes</span>
        </div>
      </div>
      <div className={cn(card, "relative -mt-16 ml-auto mr-3 w-[min(22rem,calc(100%-1.5rem))] p-4 shadow-xl sm:-mr-6")}>
        <div className="flex items-center gap-3">
          <Avatar name="Nina" size={10} />
          <div className="min-w-0">
            <p className="font-semibold">Nina</p>
            <p className="flex items-center gap-1.5 text-meta font-medium text-amber-900">
              <DoorOpen size={14} className="text-amber-700" /> Wants to see 4127 Larkmoor
            </p>
          </div>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-center">
          {[
            ["3", "liked"],
            ["0", "passed"],
            ["12 min", "looking"],
          ].map(([value, label]) => (
            <li key={label}>
              <span className="block font-semibold tabular-nums">{value}</span>
              <span className="block text-[12px] text-muted">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// For buyers: homes, and what people with their taste loved in each.
function BuyerPicture() {
  const tiles = [
    { src: "/sample/ravenna-3.jpg", alt: "A white kitchen with a marble island", who: "Maya", what: "the island", tall: true },
    { src: "/sample/gigharbor-3.jpg", alt: "A bright living room with tall windows", who: "Sam", what: "the light", tall: false },
    { src: "/sample/kirkland-4.jpg", alt: "A yellow armchair by a window", who: "Ava", what: "the reading nook", tall: false },
    { src: "/sample/bellevue-1.jpg", alt: "A modern house with glass walls at dusk", who: "Leo", what: "the glass walls", tall: true },
  ];
  return (
    <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3 md:max-w-none">
      {[tiles.slice(0, 2), tiles.slice(2)].map((column, c) => (
        <div key={c} className={cn("flex flex-col gap-3", c === 1 && "mt-10")}>
          {column.map((tile) => (
            <div
              key={tile.src}
              className={cn("relative overflow-hidden rounded-3xl shadow-lg", tile.tall ? "aspect-[3/4]" : "aspect-square")}
            >
              <Image src={tile.src} alt={tile.alt} fill sizes="(min-width: 768px) 260px, 50vw" className="object-cover" />
              <Take who={tile.who} what={tile.what} className="bottom-3 left-3 max-w-[calc(100%-1.5rem)]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MarketingHome({ devMode }: { devMode: boolean }) {
  return (
    <main className="overflow-x-clip">
      {/* What it is. */}
      <section aria-labelledby="hero-title" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 md:grid-cols-[1.05fr_1fr] md:gap-16 md:pt-16 lg:pb-28">
        <div>
          <h1 id="hero-title" className="text-balance font-display text-5xl leading-[1.04] sm:text-6xl lg:text-7xl">
            The social way to shop for homes.
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-stone-700 sm:text-xl">
            Agents send homes as one link. Buyers tap what they love.
          </p>
          {/* Sign up goes to the form at the foot; See homes, to the homes
              themselves, for anyone who'd rather look first. */}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#start" className={button({ kind: "primary", size: "lg" })}>
              Sign up
            </a>
            <Link href="/browse" className={button({ kind: "secondary", size: "lg" })}>
              See homes
            </Link>
          </div>
          <p className="mt-5 text-meta text-muted">No app. No password.</p>
        </div>
        <HeroPicture />
      </section>

      {/* For agents and brokers. */}
      <section id="agents" aria-labelledby="agents-title" className="scroll-mt-4 bg-white py-20 lg:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 md:grid-cols-2 md:gap-16">
          <div className="md:order-2">
            <Eyebrow>For agents &amp; brokers</Eyebrow>
            <h2 id="agents-title" className="mt-3 text-balance font-display text-4xl leading-tight sm:text-5xl">
              {AGENT_HEADLINE}
            </h2>

            <AgentFeatures />
            {/* An agent's account starts here, where they're reading: the
                form at the foot makes a buyer's. */}
            <Link href="/login?as=agent" className={cn(button({ kind: "primary", size: "lg" }), "mt-8")}>
              Start free as an agent
            </Link>
          </div>
          <AgentPicture />
        </div>
      </section>

      {/* For buyers. */}
      <section id="buyers" aria-labelledby="buyers-title" className="scroll-mt-4 py-20 lg:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 md:grid-cols-2 md:gap-16">
          <div>
            <Eyebrow>For buyers</Eyebrow>
            <h2 id="buyers-title" className="mt-3 text-balance font-display text-4xl leading-tight sm:text-5xl">
              Shop for homes together.
            </h2>

            <ul className="mt-8 flex flex-col gap-6">
              <Feature icon={<Heart size={18} />} title="Love the details">
                Tap the porch, the light, the kitchen.
              </Feature>
              <Feature icon={<MessageCircle size={18} />} title="Decide together">
                Talk it over with your partner and your agent.
              </Feature>
              <Feature icon={<Users size={18} />} title="Follow your kind of taste">
                See homes that people like you love.
              </Feature>
            </ul>
          </div>
          <BuyerPicture />
        </div>
      </section>

      {/* A way to start. */}
      <section id="start" aria-labelledby="start-title" className="scroll-mt-4 bg-brand px-5 py-20 text-white sm:px-8 lg:py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <h2 id="start-title" className="text-balance font-display text-4xl leading-tight sm:text-5xl">
              Start free.
            </h2>
          </div>
          <div className="w-full md:max-w-sm md:justify-self-end">
            <SignUpForm devMode={devMode} />
            {/* The form above makes a buyer's account; an agent's starts here:
                a button as wide as the form, edged in white on the brand's
                colour so the form stays the first thing. */}
            <Link
              href="/login?as=agent"
              className={cn(pill("lg", { block: true }), "mt-3 border-2 border-white text-white hover:bg-white/15", focusOnDark)}
            >
              I&apos;m an agent
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
