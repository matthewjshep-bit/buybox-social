"use client";

import { CalendarCheck, Home, Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { AskResult } from "@/app/s/[token]/actions";
import { AgentAvatar } from "@/components/agent-avatar";
import { useThread } from "@/components/listing-thread";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/format";
import type { ShareAgent } from "@/lib/shares";

// An agent's link is the agent's space: their name and face at the top, and
// one tap to text, call or email them about the home on screen.

export const phoneDigits = (value: string) => value.replace(/\D/g, "");

// "(206) 555-0142" for a US number; anything else as its digits.
export function formatPhone(value: string) {
  const digits = phoneDigits(value);
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (us.length !== 10) return digits;
  return `${digits.length === 11 ? "+1 " : ""}(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}

const looksLikeEmail = (value: string) => /^[^\s@?&#/]+@[^\s@?&#/]+\.[^\s@?&#/]+$/.test(value);

const agentFirstName = (agent: ShareAgent) => agent.full_name.trim().split(/\s+/)[0] || "your agent";

// The home on screen, for "About 4127 Larkmoor Ave NE" and asking to see it.
export type HomeInView = { listingKey: string; address: string };

// Across the top of every agent's link, in place of the site's own header, so
// the client stays in the agent's branded space. It sits inside the feed's
// name prompt, which "Ask to see it" may need.
export function ShareHeader({
  agent,
  note,
  home,
  whoCanSee,
  onAsk,
  heading,
}: {
  agent: ShareAgent;
  note: string;
  home: HomeInView | null;
  whoCanSee: string;
  onAsk: (listingKey: string) => Promise<AskResult>;
  // The link's greeting, when there's no welcome screen to carry it.
  heading?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* The sheet sits beside the header, not in it, so the header holds just what it shows. */}
      <header className="bg-linear-to-b from-black/55 via-black/25 to-transparent pb-6 pt-[env(safe-area-inset-top)] text-white">
        {/* C1: moves to the caption */}
        {heading && <h1 className="sr-only">{heading}</h1>}
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6">
          <Link href="/" className="flex size-11 shrink-0 items-center justify-center rounded-xl">
            <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-brand ring-1 ring-white/30">
              <Home size={18} />
            </span>
            <span className="sr-only">BuyBox Social</span>
          </Link>
          <AgentAvatar agent={agent} size={36} decorative className="text-sm ring-1 ring-white/60" />
          <div className="min-w-0 flex-1 leading-tight [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
            <p className="truncate text-[15px] font-semibold">{agent.full_name}</p>
            {agent.brokerage && <p className="truncate text-[13px] text-white/80">{agent.brokerage}</p>}
          </div>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur-md hover:bg-white/25"
          >
            <Phone aria-hidden size={16} />
            Contact
          </button>
        </div>
      </header>
      <Sheet open={open} onClose={() => setOpen(false)} label={`Contact ${agent.full_name}`} title={agent.full_name}>
        {/* Starts fresh for each home, and each time it opens. */}
        {open && (
          <AgentContact
            key={home?.listingKey ?? ""}
            agent={agent}
            note={note}
            home={home}
            whoCanSee={whoCanSee}
            onAsk={onAsk}
          />
        )}
      </Sheet>
    </>
  );
}

const action = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 font-semibold";

// Who the agent is and every way to reach them, only the ways they chose to show.
export function AgentContact({
  agent,
  note,
  home,
  whoCanSee,
  onAsk,
}: {
  agent: ShareAgent;
  note: string;
  home: HomeInView | null;
  whoCanSee: string;
  onAsk?: (listingKey: string) => Promise<AskResult>;
}) {
  const { ensureName } = useThread();
  const [said, setSaid] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = agentFirstName(agent);
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

  const ask = () => {
    if (!home || !onAsk) return;
    setSaid(null);
    startTransition(async () => {
      if (!(await ensureName())) return;
      const result = await onAsk(home.listingKey);
      setSaid(
        !result.ok
          ? result.error
          : result.already
            ? `Already asked. ${first} will be in touch.`
            : `Sent. ${first} will get back to you.`,
      );
    });
  };

  return (
    <div className="pb-2">
      <div className="flex flex-col items-center text-center">
        <AgentAvatar agent={agent} size={64} decorative light className="text-xl" />
        <p className="mt-3 text-[17px] font-semibold">{agent.full_name}</p>
        {agent.brokerage && <p className="text-[15px] text-stone-600">{agent.brokerage}</p>}
      </div>
      {note && (
        <p className="mt-4 whitespace-pre-line rounded-2xl bg-stone-50 p-4 text-[15px] leading-relaxed text-stone-800">
          {note}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2.5">
        {ways.map(({ href, Icon, label }, i) => (
          <a
            key={label}
            href={href}
            className={cn(action, i === 0 ? "bg-brand text-white" : "bg-stone-100 text-ink hover:bg-stone-200")}
          >
            <Icon aria-hidden size={18} />
            {label}
          </a>
        ))}
        {home && onAsk && (
          <button
            type="button"
            onClick={ask}
            disabled={pending}
            className={cn(action, "border border-brand text-brand hover:bg-brand/5 disabled:opacity-60")}
          >
            <CalendarCheck aria-hidden size={18} />
            Ask to see it
          </button>
        )}
        <p role="status" className="min-h-5 text-center text-sm font-medium text-stone-700 empty:min-h-0">
          {said}
        </p>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
        Or add a comment under the home. {first} sees every one. {whoCanSee}
      </p>
    </div>
  );
}
