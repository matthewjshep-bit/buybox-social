"use client";

import { ArrowDown, CalendarCheck, Check, Home, Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AskResult } from "@/app/s/[token]/actions";
import { AgentAvatar } from "@/components/agent-avatar";
import { useThread } from "@/components/listing-thread";
import { Sheet } from "@/components/sheet";
import { phoneDigits } from "@/lib/contact";
import { agentFirstName, cn } from "@/lib/format";
import type { ShareAgent } from "@/lib/shares";
import { button, focusOnDark, pill } from "@/lib/ui";

// An agent's link is the agent's space: their name and face at the top, and
// one tap to text, call or email them about the home on screen.

const looksLikeEmail = (value: string) => /^[^\s@?&#/]+@[^\s@?&#/]+\.[^\s@?&#/]+$/.test(value);

// The home on screen, for "About 4127 Larkmoor Ave NE" and asking to see it.
export type HomeInView = { listingKey: string; address: string };

// Across the top of every agent's link, in place of the site's own header, so
// the client stays in the agent's branded space. It sits inside the feed's
// name prompt, which "Ask to see it" may need. (On a link of one home, the
// agent's greeting and note are the home's caption, under its photo.)
export function ShareHeader({
  agent,
  note,
  home,
  homesCount,
  whoCanSee,
  onAsk,
  onSeeHomes,
  open,
  onOpenChange,
}: {
  agent: ShareAgent;
  note: string;
  home: HomeInView | null;
  homesCount: number;
  whoCanSee: string;
  onAsk: (listingKey: string) => Promise<AskResult>;
  // Down to the first home, from a welcome screen.
  onSeeHomes?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      {/* The sheet sits beside the header, not in it, so the header holds just what it shows. */}
      <header className="bg-linear-to-b from-black/65 via-black/35 to-transparent pb-6 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6">
          {/* Every agent colour is dark: over the photo, focus is white with a dark edge. */}
          <Link href="/" className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", focusOnDark)}>
            <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-brand ring-1 ring-white/30">
              <Home size={18} />
            </span>
            <span className="sr-only">BuyBox Social</span>
          </Link>
          <AgentAvatar agent={agent} size={36} decorative className="text-sm ring-1 ring-white/60" />
          <div className="min-w-0 flex-1 leading-tight [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
            <p className="truncate text-body font-semibold">{agent.full_name}</p>
            {/* Full white: over a bright photo, anything fainter falls short of easy reading. */}
            {agent.brokerage && <p className="truncate text-meta">{agent.brokerage}</p>}
          </div>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => onOpenChange(true)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur-md hover:bg-white/25",
              focusOnDark,
            )}
          >
            <Phone aria-hidden size={16} />
            Contact
          </button>
        </div>
      </header>
      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
        label={`Contact ${agent.full_name}`}
        // Their name heads the sheet for screen readers; on screen it's beside
        // their photo just below, rather than said twice.
        title={agent.full_name}
        titleHidden
      >
        {/* Starts fresh for each home, and each time it opens. */}
        {open && (
          <AgentContact
            key={home?.listingKey ?? ""}
            agent={agent}
            note={note}
            home={home}
            homesCount={homesCount}
            whoCanSee={whoCanSee}
            onAsk={onAsk}
            onSeeHomes={onSeeHomes}
          />
        )}
      </Sheet>
    </>
  );
}

// Each way to reach them, the first as the one to reach for.
const way = (first: boolean) => button({ kind: first ? "primary" : "secondary", size: "lg", block: true });

// Who the agent is and every way to reach them, only the ways they chose to show.
export function AgentContact({
  agent,
  note,
  home,
  homesCount,
  whoCanSee,
  onAsk,
  onSeeHomes,
}: {
  agent: ShareAgent;
  note: string;
  home: HomeInView | null;
  homesCount: number;
  whoCanSee: string;
  onAsk?: (listingKey: string) => Promise<AskResult>;
  onSeeHomes?: () => void;
}) {
  const { ensureName } = useThread();
  const [said, setSaid] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [pending, startTransition] = useTransition();
  const status = useRef<HTMLParagraphElement>(null);
  const first = agentFirstName(agent.full_name);
  const phone = phoneDigits(agent.contact_phone);
  const email = looksLikeEmail(agent.contact_email) ? agent.contact_email : "";
  const about = home ? `About ${home.address}` : "";
  // Built from the digits and a checked address only.
  const ways: { href: string; Icon: LucideIcon; label: string }[] = [];
  if (phone) {
    const body = about ? `?&body=${encodeURIComponent(`${about}: `)}` : "";
    ways.push({ href: `sms:${phone}${body}`, Icon: MessageSquare, label: `Text ${first}` });
    ways.push({ href: `tel:${phone}`, Icon: Phone, label: `Call ${first}` });
  }
  if (email) {
    const subject = about ? `?subject=${encodeURIComponent(about)}` : "";
    ways.push({ href: `mailto:${email}${subject}`, Icon: Mail, label: `Email ${first}` });
  }
  const canAsk = Boolean(home && onAsk);
  // Before any home is on screen there's none to ask about: the way to them instead.
  const seeHomes = !home && homesCount > 1 ? onSeeHomes : undefined;

  // The answer shows where the tap was, even on a short screen.
  useEffect(() => {
    if (said) status.current?.scrollIntoView({ block: "nearest" });
  }, [said]);

  const ask = async () => {
    // It stays focusable while it works, so the cursor isn't lost; a second press waits.
    if (!home || !onAsk || pending || asked) return;
    setSaid(null);
    if (!(await ensureName())) return;
    startTransition(async () => {
      const result = await onAsk(home.listingKey);
      if (!result.ok) return setSaid(result.error);
      setAsked(true);
      setSaid(result.already ? `Already asked. ${first} will be in touch.` : `Sent. ${first} will get back to you.`);
    });
  };

  return (
    <div className="pb-2">
      <div className="flex items-center gap-4 pr-10">
        <AgentAvatar agent={agent} size={64} decorative light className="text-xl" />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-snug">{agent.full_name}</p>
          {agent.brokerage && <p className="text-body text-muted">{agent.brokerage}</p>}
        </div>
      </div>
      {note && (
        <p className="mt-4 whitespace-pre-line rounded-2xl bg-stone-50 p-4 text-body leading-relaxed text-stone-800">
          {note}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2.5">
        {ways.map(({ href, Icon, label }, i) => (
          <a key={label} href={href} className={way(i === 0)}>
            <Icon aria-hidden size={18} />
            {label}
          </a>
        ))}
        {canAsk && (
          <button
            type="button"
            onClick={ask}
            aria-disabled={pending || asked}
            className={
              asked
                ? cn(pill("lg", { block: true }), "cursor-default bg-stone-100 text-stone-700")
                : cn(way(ways.length === 0), pending && "opacity-60")
            }
          >
            {asked ? <Check aria-hidden size={18} /> : <CalendarCheck aria-hidden size={18} />}
            {asked ? "Asked to see it" : "Ask to see it"}
          </button>
        )}
        {seeHomes && (
          <button type="button" onClick={seeHomes} className={way(ways.length === 0)}>
            <ArrowDown aria-hidden size={18} />
            {`See the ${homesCount} homes`}
          </button>
        )}
        <p ref={status} role="status" className="min-h-5 text-center text-sm font-medium text-stone-700 empty:min-h-0">
          {said}
        </p>
      </div>
      <p className="mt-2 text-meta leading-relaxed text-muted">
        {homesCount > 0 &&
          `${ways.length > 0 || canAsk ? "Or add" : "Add"} a comment under ${home ? "the home" : "any home"}. ${first} sees every one. `}
        {whoCanSee}
      </p>
    </div>
  );
}
