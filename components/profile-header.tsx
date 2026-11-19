import { ExternalLink, Images, Lock, Pencil, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddFirstName, ShareMyPage } from "@/app/people/[id]/client";
import { Banner } from "@/components/banner";
import { Avatar, Badge, RoleChip } from "@/components/ui";
import { NO_BANNER, type BannerChoice } from "@/lib/banner";
import { cn } from "@/lib/format";
import { sinceLabel, type ProfileLink } from "@/lib/profile";
import { button, card } from "@/lib/ui";

// The top of someone's page: a band (theirs to choose: components/banner.tsx), their
// face, name, how long they've been looking, and what they say about
// themselves (an agent's links too). Who follows them and whom they follow are
// links, to those lists, with Follow beside them. On your own page, a pencil
// to edit it (your photo, your words, your links), on a page of its own. Your
// own page with no name yet says "Your profile" and asks for one.
// An agent on their own client's page sees that they are, with that client's
// homes and their link a tap away.
export function ProfileHeader({
  name,
  face = name,
  isMe,
  onLink = false,
  unnamed = false,
  agent = false,
  since,
  people,
  followsYou = false,
  follow,
  photo,
  client,
  bio = "",
  links = [],
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
  since: string;
  // Their followers and whom they follow: how many, and the page listing each.
  people?: { followers: number; following: number; href: string };
  // They follow whoever's looking.
  followsYou?: boolean;
  // Follow (on anyone's page but your own).
  follow?: ReactNode;
  // Their own photo, where they've added one.
  photo?: string | null;
  // To an agent, their own client: every home sent them (`homes`), and
  // their page among the agent's clients (`page`).
  client?: { homes: string; page: string };
  // What they say about themselves, an agent's links, and their brokerage.
  bio?: string;
  links?: ProfileLink[];
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
        {/* Their face over the banner's edge; beside it, the one or two things to do here. */}
        <div className="flex items-end justify-between gap-3">
          <Avatar
            name={face}
            tone={agent ? "agent" : "person"}
            size={28}
            photo={photo}
            className="relative -mt-10 ring-4 ring-white sm:-mt-14"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isMe ? (
              <>
                <Link href="/people/me/edit" className={button({ kind: "secondary" })}>
                  <Pencil aria-hidden size={16} /> Edit profile
                </Link>
                <ShareMyPage title={unnamed ? "My profile on Porchcard" : `${name} on Porchcard`} />
              </>
            ) : (
              follow
            )}
          </div>
        </div>
        {/* Their name, and beside it what they are here: an agent has a chip;
            someone simply looking has none. (Beside the heading, not in it, so
            the heading is just their name.) */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {/* The keyboard comes here once you've said your name, as it changes. */}
          <h1 id="profile-name" tabIndex={-1} className="min-w-0 break-words font-display text-[30px] leading-tight outline-none sm:text-[34px]">
            {isMe ? (unnamed ? "Your profile" : `${fullName || name} (you)`) : fullName || name}
          </h1>
          <RoleChip role={agent ? "agent" : null} />
        </div>
        {isMe && unnamed && <AddFirstName />}
        <p className="mt-1 text-body text-stone-700">
          {agent ? brokerage || "Real estate agent" : `Looking since ${sinceLabel(since)}`}
        </p>
        {client && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="ink">Your client</Badge>
            <Link href={client.homes} className={button({ kind: "secondary" })}>
              <Images aria-hidden size={16} /> See their homes
            </Link>
            <Link href={client.page} className={button({ kind: "ghost" })}>
              <Users aria-hidden size={16} /> Client page
            </Link>
          </div>
        )}
        {bio && (
          <p className="mt-3 max-w-2xl whitespace-pre-line break-words text-body leading-relaxed text-ink">{bio}</p>
        )}
        {links.length > 0 && (
          <ul aria-label={`${isMe ? "Your" : `${name}'s`} links`} className="-ml-1 mt-2 flex flex-wrap gap-x-4">
            {links.map((link) => (
              <li key={link.url} className="max-w-full">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-1 text-body font-semibold text-brand hover:underline"
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
            <Link href={`${people.href}/followers`} className="underline-offset-2 hover:underline">
              <strong className="font-semibold text-ink tabular-nums">{people.followers}</strong>{" "}
              {people.followers === 1 ? "follower" : "followers"}
            </Link>
            {" · "}
            <Link href={`${people.href}/following`} className="underline-offset-2 hover:underline">
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
