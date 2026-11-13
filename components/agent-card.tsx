"use client";

import { ArrowDown, Bell, CalendarCheck, Check, Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ComponentProps } from "react";
import { FollowButton } from "@/app/people/[id]/client";
import type { AskResult } from "@/app/s/[token]/actions";
import type { LeaveResult } from "@/app/s/[token]/leave";
import { AgentAvatar } from "@/components/agent-avatar";
import { AccountMenu } from "@/components/header-nav";
import { PorchcardMark } from "@/components/porchcard-logo";
import { useThread } from "@/components/listing-thread";
import { Sheet } from "@/components/sheet";
import { phoneDigits } from "@/lib/contact";
import { agentFirstName, cn } from "@/lib/format";
import type { ShareAgent } from "@/lib/shares";
import { button, focusOnDark, pill } from "@/lib/ui";

// An agent's link is the agent's space: their name and face at the top, and
// one tap to text, call or email them about the home on screen.

export const looksLikeEmail = (value: string) => /^[^\s@?&#/]+@[^\s@?&#/]+\.[^\s@?&#/]+$/.test(value);

// Someone signed in, on a link that isn't their own to preview: they, and
// the bell, as the site's header has them, so the link leads on to the rest
// of Porchcard (their home, their page, what's new).
export type LinkAccount = Omit<ComponentProps<typeof AccountMenu>, "overlay">;

// What the Contact sheet offers someone signed in, beyond reaching the agent:
// the agent's own page and following them, and leaving a link they were added
// to by mistake. Each only where it applies.
export type ContactExtras = {
  // The agent's page (/people/<id>), once they have one.
  profile?: string | null;
  // Following the agent, by their page's id.
  follow?: { personId: string; following: boolean } | null;
  // Taking themselves off their own link.
  leave?: (() => Promise<LeaveResult>) | null;
};

// The home on screen, for "About 4127 Larkmoor Ave NE" and asking to see it.
export type HomeInView = { listingKey: string; address: string };

// Side by side, the white panel beside the home on screen: Contact rises from
// its foot, as More and Send do there. Otherwise (a phone's layout, or a
// welcome or end screen on screen) none, and it rises from the window's foot.
function panelBeside(listingKey: string | undefined) {
  if (!listingKey) return null;
  const home = document.querySelector<HTMLElement>(`[data-home="${CSS.escape(listingKey)}"]`);
  if (!home?.hasAttribute("data-split")) return null;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const box = home.getBoundingClientRect();
  if (home.clientWidth < 64 * rem || Math.abs(box.top) > box.height / 2) return null;
  return home.querySelector<HTMLElement>("[data-words]");
}

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
  preview,
  notes = null,
  account = null,
  extras,
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
  // The agent looking at their own link: "Viewing as Dana".
  preview?: string;
  // And writing their notes on it: who for, and the way back once done.
  notes?: { for: string; done: string } | null;
  // Someone signed in (never the agent previewing): their menu and the bell.
  account?: LinkAccount | null;
  extras?: ContactExtras;
}) {
  // What Contact rises from, worked out each time it's placed (as it opens,
  // and if the window changes size meanwhile).
  const listingKey = home?.listingKey;
  const panel = useMemo(
    () => ({
      get current() {
        return panelBeside(listingKey);
      },
    }),
    [listingKey],
  );
  return (
    <>
      {/* The sheet sits beside the header, not in it, so the header holds just what it shows. */}
      <header
        className={cn(
          // Clear of a notch, top and sides, like the site's own header.
          "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-white",
          // A shade only on a phone on its side, where the photo runs up under
          // it. Elsewhere it sits above the photo, and leaves all of it to tap.
          "short:bg-[linear-gradient(to_bottom,rgb(0_0_0/0.75),rgb(0_0_0/0.6)_55%,rgb(0_0_0/0.25)_80%,transparent)] short:pb-3",
        )}
      >
        {/* Side by side, edge to edge, as the site's header is: the logo over
            the photo's left edge, Contact over the white panel's right edge. */}
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6 split:max-w-none split:px-6">
          {/* Every agent colour is dark: over the photo, focus is white with a dark edge. */}
          <Link href="/" className={cn("flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl", focusOnDark)}>
            {/* Porchcard's card, in white over the photo; the agent is beside it. */}
            <PorchcardMark className="h-7 w-auto text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.45)]" />
            <span className="sr-only">Porchcard</span>
          </Link>
          <AgentAvatar agent={agent} size={36} decorative className="text-sm ring-1 ring-white/60" />
          <div className="min-w-0 flex-1 leading-tight [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
            <p className="truncate text-body font-semibold">{agent.full_name}</p>
            {/* Full white: over a bright photo, anything fainter falls short of easy reading. */}
            {agent.brokerage && <p className="truncate text-meta">{agent.brokerage}</p>}
            {/* The agent on their own link sees it just as the client does;
                that it's their preview is said for a screen reader only. */}
            {preview && (
              <p className="sr-only">Preview, {notes ? `your notes for ${notes.for}` : preview}</p>
            )}
          </div>
          {notes ? (
            // The agent needn't contact themselves: back to the link's page,
            // where it's sent.
            <Link
              href={notes.done}
              data-tour="done"
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-ink hover:bg-white/90",
                focusOnDark,
              )}
            >
              <Check aria-hidden size={16} />
              Done
            </Link>
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => onOpenChange(true)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur-md hover:bg-white/25",
                // Beside the bell and their own face, on a phone just the
                // icon (its name stays for screen readers), so the agent's
                // name still has room.
                account && "max-sm:w-11 max-sm:justify-center max-sm:px-0",
                focusOnDark,
              )}
            >
              <Phone aria-hidden size={16} />
              <span className={cn(account && "max-sm:sr-only")}>Contact</span>
            </button>
          )}
          {account && !notes && (
            <div className="flex shrink-0 items-center gap-0.5 text-sm font-medium">
              <Link
                href="/activity"
                className={cn(
                  "relative flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/15 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]",
                  focusOnDark,
                )}
              >
                <Bell aria-hidden size={18} className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.45)]" />
                <span className="sr-only">
                  Activity{account.unread > 0 && `, ${account.unread} new`}
                </span>
                {account.unread > 0 && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-tiny font-bold leading-[18px] text-white tabular-nums [text-shadow:none]"
                  >
                    {account.unread > 9 ? "9+" : account.unread}
                  </span>
                )}
              </Link>
              <AccountMenu {...account} overlay />
            </div>
          )}
        </div>
      </header>
      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
        anchor={panel}
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
            {...extras}
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
  profile = null,
  follow = null,
  leave = null,
}: {
  agent: ShareAgent;
  note: string;
  home: HomeInView | null;
  homesCount: number;
  whoCanSee: string;
  onAsk?: (listingKey: string) => Promise<AskResult>;
  onSeeHomes?: () => void;
} & ContactExtras) {
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
        {/* A person on Porchcard like anyone: their face and name go to their page. */}
        {profile ? (
          <Link href={profile} className="-m-1 flex min-w-0 items-center gap-4 rounded-2xl p-1 hover:bg-stone-50">
            <AgentAvatar agent={agent} size={64} decorative light className="text-xl" />
            <span className="min-w-0">
              <span className="block text-[17px] font-semibold leading-snug">{agent.full_name}</span>
              {agent.brokerage && <span className="block text-body text-muted">{agent.brokerage}</span>}
            </span>
          </Link>
        ) : (
          <>
            <AgentAvatar agent={agent} size={64} decorative light className="text-xl" />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold leading-snug">{agent.full_name}</p>
              {agent.brokerage && <p className="text-body text-muted">{agent.brokerage}</p>}
            </div>
          </>
        )}
      </div>
      {follow && (
        <div className="mt-3">
          <FollowButton small personId={follow.personId} name={first} following={follow.following} />
        </div>
      )}
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
      {leave && <LeaveLink first={first} leave={leave} className="mt-2" />}
    </div>
  );
}

// "Not for you? Leave this link": for someone the agent added to a link of
// their own, perhaps by mistake. It asks once more first, in a small dialog
// that starts on Cancel, so a stray tap or Enter never takes them off.
// Leaving takes them home.
export function LeaveLink({
  first,
  leave,
  className,
  onDark = false,
}: {
  first: string;
  leave: () => Promise<LeaveResult>;
  className?: string;
  // On the dark end screen, rather than a white sheet.
  onDark?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  const open = () => {
    setError(null);
    dialog.current?.showModal();
    cancel.current?.focus();
  };
  // (Not while it's leaving: the page is about to go home.)
  const close = () => {
    if (!pending) dialog.current?.close();
  };
  const go = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await leave();
      // Gone, it goes home; this only comes back when it couldn't.
      if (result?.error) setError(result.error);
    });
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        onClick={open}
        className={cn(
          "inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm",
          onDark ? cn("text-white/80 hover:text-white", focusOnDark) : "text-muted hover:text-ink",
          className,
        )}
      >
        Not for you? <span className="underline underline-offset-4">Leave this link</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-said`}
        data-light
        // Escape cancels, here and only here: not the sheet it may sit in.
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => opener.current?.focus({ preventScroll: true })}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-white p-0 text-left text-ink shadow-[0_12px_40px_rgb(0_0_0/0.3)] backdrop:bg-black/50"
      >
        <div className="p-5">
          <h2 id={`${id}-title`} className="text-[17px] font-semibold leading-snug">
            Leave this link?
          </h2>
          <p id={`${id}-said`} className="mt-1 text-body text-muted">
            {first} won&apos;t see your likes and comments on it any more.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button ref={cancel} type="button" onClick={close} className={button({ kind: "secondary" })}>
              Cancel
            </button>
            <button
              type="button"
              onClick={go}
              aria-disabled={pending}
              className={cn(button({ kind: "danger" }), pending && "opacity-60")}
            >
              {pending ? "Leaving…" : "Leave"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
