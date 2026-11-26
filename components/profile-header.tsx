import { ExternalLink, Images, Lock, Mail, MapPin, MessageCircle, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddFirstName, ShareMyPage } from "@/app/people/[id]/client";
import { Banner } from "@/components/banner";
import { Avatar, Badge, RoleChip } from "@/components/ui";
import { NO_BANNER, type BannerChoice } from "@/lib/banner";
import { formatPhone } from "@/lib/contact";
import { cn } from "@/lib/format";
import { sinceLabel, type ProfileLink } from "@/lib/profile";
import { button, card, link as linkClass } from "@/lib/ui";
import type { Kind } from "@/lib/kinds";

// Under a pro's name, with no company given: what they do.
const PRO_LINE: Record<Kind, string> = {
  agent: "Real estate agent",
  investor: "Real estate investor",
  lender: "Lender",
  buyer: "Real estate agent",
};

// The top of someone's page: a band (theirs to choose: components/banner.tsx), their
// face, name, how long they've been looking, and what they say about
// themselves (an agent's links too). Who follows them and whom they follow are
// links, to those lists, with Follow beside them. On your own page, a pencil
// to edit it (your photo, your words, your links), on a page of its own. Your
// own page with no name yet says "Your profile" and asks for one.
// An agent on their own client's page sees that they are (beside the name),
// with Message beside Follow, as on Instagram: their conversation. All the
// client's homes are a link on "Between you and them" below (or, with no such
// card, a quiet link here).
export function ProfileHeader({
  name,
  face = name,
  isMe,
  onLink = false,
  unnamed = false,
  agent = false,
  kind,
  place = "",
  since,
  people,
  followsYou = false,
  follow,
  photo,
  client,
  bio = "",
  links = [],
  contact,
  brokerage = "",
  personId,
  brandColor = null,
  banner = NO_BANNER,
  fullName,
}: {
  name: string;
  // An agent's whole name, for the top of their own page: they're there by
  // profession. (Everyone else goes by their first name, here as everywhere.)
  fullName?: string;
  // What their initial is from, if not their name ("" for a plain figure).
  face?: string;
  isMe: boolean;
  // Your own page, and an agent has sent you homes on a link.
  onLink?: boolean;
  // Your own page, and you haven't said your first name yet.
  unnamed?: boolean;
  // An agent's face is ink, as everywhere.
  agent?: boolean;
  // What they are (lib/kinds.ts): the chip beside their name.
  kind?: Kind;
  // Where they said they are: "Seattle, WA".
  place?: string;
  since: string;
  // Their followers and whom they follow: how many, and the page listing each.
  people?: { followers: number; following: number; href: string };
  // They follow whoever's looking.
  followsYou?: boolean;
  // Follow (on anyone's page but your own).
  follow?: ReactNode;
  // Their own photo, where they've added one.
  photo?: string | null;
  // To an agent, their own client: their conversation (`page`), and every
  // home sent them (`homes`, only when the card below doesn't have it).
  client?: { homes?: string; page: string };
  // What they say about themselves, an agent's links, and their brokerage.
  bio?: string;
  links?: ProfileLink[];
  // An agent's phone (digits) and email for anyone who wants to reach them.
  contact?: { phone: string; email: string };
  brokerage?: string;
  // Whose page it is, and an agent's own colour, for the band at the top.
  personId: string;
  brandColor?: string | null;
  // The band at the top, as they chose it.
  banner?: BannerChoice;
}) {
  return (
    <section aria-labelledby="profile-name" className={cn(card, "overflow-hidden")}>
      {/* Their own image keeps the shape they framed it in, whatever the width, so what
          they placed is what shows; a drawn scene or a plain band is a fixed height. */}
      <div
        aria-hidden
        // (A faint line under it: a white banner, a logo on white, would otherwise run into the card.)
        className={cn(
          "overflow-hidden border-b border-stone-200",
          banner.style === "image" && banner.image ? "aspect-[10/3]" : "h-[120px] sm:h-44",
        )}
      >
        <Banner seed={personId} brand={brandColor} choice={banner} />
      </div>
      <div className="px-4 pb-5 sm:px-6">
        {/* Their face over the banner's edge; beside it, the one or two things to do here,
            always clear of the banner (and, should they wrap, never pulling the face down). */}
        <div className="flex items-start justify-between gap-3">
          <Avatar
            name={face}
            tone={agent ? "agent" : "person"}
            size={28}
            photo={photo}
            className="relative -mt-10 ring-4 ring-white sm:-mt-14"
          />
          <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
            {isMe ? (
              <>
                <Link href="/people/me/edit" className={button({ kind: "secondary" })}>
                  <Pencil aria-hidden size={16} /> Edit profile
                </Link>
                <ShareMyPage title={unnamed ? "My profile on Porchcard" : `${name} on Porchcard`} />
              </>
            ) : (
              <>
                {follow}
                {/* Their conversation: an icon on a phone (its name read out), a word above. */}
                {client && (
                  <Link href={client.page} className={cn(button({ kind: "secondary" }), "max-sm:w-11 max-sm:px-0")}>
                    <MessageCircle aria-hidden size={16} />
                    <span className="max-sm:sr-only">Message</span>
                    <span className="sr-only"> {name}</span>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
        {/* Their name, and beside it what they are here: an agent has a chip;
            someone simply looking has none. (Beside the heading, not in it, so
            the heading is just their name.) */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {/* The keyboard comes here once you've said your name, as it changes. */}
          <h1 id="profile-name" tabIndex={-1} className="min-w-0 break-words font-display text-[30px] leading-tight outline-none sm:text-[34px]">
            {/* (Said above already, "Your public profile": "(you)" is for screen readers.) */}
            {isMe && unnamed ? (
              "Your profile"
            ) : (
              <>
                {fullName || name}
                {isMe && <span className="sr-only"> (you)</span>}
              </>
            )}
          </h1>
          <RoleChip role={agent ? (kind ?? "agent") : null} />
          {client && <Badge tone="ink">Your client</Badge>}
        </div>
        {isMe && unnamed && <AddFirstName />}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-body text-stone-700">
          <span>{agent ? brokerage || PRO_LINE[kind ?? "agent"] : `Looking since ${sinceLabel(since)}`}</span>
          {place && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="text-stone-400">
                ·
              </span>
              <MapPin aria-hidden size={15} className="shrink-0 text-stone-500" />
              {place}
            </span>
          )}
        </p>
        {client?.homes && (
          <Link
            href={client.homes}
            className={cn(linkClass, "mt-1 inline-flex min-h-11 items-center gap-1.5 text-body")}
          >
            <Images aria-hidden size={16} /> See all of {name.split(" ")[0] || name}&apos;s homes
          </Link>
        )}
        {bio && (
          <p className="mt-3 max-w-2xl whitespace-pre-line break-words text-body leading-relaxed text-ink">{bio}</p>
        )}
        {/* How to reach an agent: their number rings them, their email writes
            to them. Each a fingertip tall. */}
        {contact && (contact.phone || contact.email) && (
          <ul aria-label={isMe ? "How to reach you" : `How to reach ${name}`} className="-ml-1 mt-2 flex flex-wrap gap-x-4">
            {contact.phone && (
              <li className="max-w-full">
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-1 text-body font-semibold text-ink hover:underline"
                >
                  <Phone aria-hidden size={16} className="shrink-0 text-stone-500" />
                  <span className="sr-only">Call </span>
                  {formatPhone(contact.phone)}
                </a>
              </li>
            )}
            {contact.email && (
              <li className="max-w-full">
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-1 text-body font-semibold text-ink hover:underline"
                >
                  <Mail aria-hidden size={16} className="shrink-0 text-stone-500" />
                  <span className="sr-only">Email </span>
                  <span className="truncate">{contact.email}</span>
                </a>
              </li>
            )}
          </ul>
        )}
        {links.length > 0 && (
          <ul aria-label={`${isMe ? "Your" : `${name}'s`} links`} className="-ml-1 mt-2 flex flex-wrap gap-x-4">
            {links.map((link) => (
              <li key={link.url} className="max-w-full">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-1 text-body font-semibold text-brand hover:underline"
                >
                  <ExternalLink aria-hidden size={14} className="shrink-0" />
                  <span className="truncate">{link.label || hostOf(link.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {people && (
          <p className="mt-3 text-body text-stone-700">
            {/* (Words in a line, each a fingertip's touch area without making the line taller.) */}
            <Link href={`${people.href}/followers`} className="rounded-sm underline-offset-2 hit-44 hover:underline">
              <strong className="font-semibold text-ink tabular-nums">{people.followers}</strong>{" "}
              {people.followers === 1 ? "follower" : "followers"}
            </Link>
            <span aria-hidden> · </span>
            <Link href={`${people.href}/following`} className="rounded-sm underline-offset-2 hit-44 hover:underline">
              <strong className="font-semibold text-ink tabular-nums">{people.following}</strong> following
            </Link>
            {followsYou && (
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">Follows you</span>
            )}
          </p>
        )}
        {/* (That it's public is said above the card. What isn't, only for
            someone on a link: it means nothing to anyone who's never had one.) */}
        {isMe && onLink && (
          <p className="mt-3 flex gap-1.5 text-meta leading-snug text-muted">
            <Lock aria-hidden size={14} className="mt-0.5 shrink-0" />
            Homes from your agent stay private.
          </p>
        )}
      </div>
    </section>
  );
}

// "harborandpine.com", for a link with no name of its own.
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
