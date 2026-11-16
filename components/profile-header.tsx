import { ExternalLink, Globe, Images, Link2, Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddFirstName, ShareMyPage } from "@/app/people/[id]/client";
import { BannerArt } from "@/components/banner-art";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/format";
import { sinceLabel, type ProfileLink } from "@/lib/profile";
import { button, card } from "@/lib/ui";

// The band across the top of a page: a little scene of home (BannerArt),
// an agent's in their own brand colour; never grey.
function Banner({ personId, brandColor }: { personId: string; brandColor: string | null }) {
  return (
    <div aria-hidden className="h-[120px] overflow-hidden">
      <BannerArt seed={personId} brand={brandColor} />
    </div>
  );
}

// The top of someone's page: a band (see Banner), their
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
  unnamed = false,
  agent = false,
  since,
  homes,
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
}: {
  name: string;
  // What their initial is from, if not their name ("" for a plain figure).
  face?: string;
  isMe: boolean;
  // Your own page, and you haven't said your first name yet.
  unnamed?: boolean;
  // An agent's face is ink, as everywhere.
  agent?: boolean;
  since: string;
  homes: number;
  // Their followers and whom they follow: how many, and the page listing each.
  people?: { followers: number; following: number; href: string };
  // They follow whoever's looking.
  followsYou?: boolean;
  // Follow (on anyone's page but your own).
  follow?: ReactNode;
  // Their own photo, where they've added one.
  photo?: string | null;
  // To an agent, their own client: every home sent them (`homes`), and the
  // link they're on (`link`).
  client?: { homes: string; link: string };
  // What they say about themselves, an agent's links, and their brokerage.
  bio?: string;
  links?: ProfileLink[];
  brokerage?: string;
  // Whose page it is, and an agent's own colour, for the band at the top.
  personId: string;
  brandColor?: string | null;
}) {
  return (
    <section aria-labelledby="profile-name" className={cn(card, "overflow-hidden")}>
      <Banner personId={personId} brandColor={brandColor} />
      <div className="px-4 pb-4">
        <div className="flex items-end justify-between gap-3">
          <Avatar name={face} tone={agent ? "agent" : "person"} size={18} photo={photo} className="relative -mt-9 ring-4 ring-white" />
          {isMe && (
            <Link href="/people/me/edit" className={button({ kind: "secondary" })}>
              <Pencil aria-hidden size={16} /> Edit profile
            </Link>
          )}
        </div>
        {/* The keyboard comes here once you've said your name, as it changes. */}
        <h1 id="profile-name" tabIndex={-1} className="mt-2 break-words font-display text-[30px] leading-tight outline-none">
          {isMe ? (unnamed ? "Your profile" : `${name} (you)`) : name}
        </h1>
        {followsYou && (
          <p className="mt-1">
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">Follows you</span>
          </p>
        )}
        {client && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="ink">Your client</Badge>
            <Link href={client.homes} className={button({ kind: "secondary" })}>
              <Images aria-hidden size={16} /> See their homes
            </Link>
            <Link href={client.link} className={button({ kind: "ghost" })}>
              <Link2 aria-hidden size={16} /> Their link
            </Link>
          </div>
        )}
        {isMe && unnamed && <AddFirstName />}
        <p className="mt-1 text-body text-muted">
          {agent ? brokerage || "Real estate agent" : `Looking since ${sinceLabel(since)}`}
          {homes > 0 && ` · ${homes} ${homes === 1 ? "home" : "homes"}`}
        </p>
        {bio && <p className="mt-3 whitespace-pre-line break-words text-body leading-relaxed text-ink">{bio}</p>}
        {links.length > 0 && (
          <ul aria-label={`${isMe ? "Your" : `${name}'s`} links`} className="mt-2 flex flex-col">
            {links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="-ml-1 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-1 text-body font-semibold text-brand hover:underline"
                >
                  <ExternalLink aria-hidden size={14} className="shrink-0" />
                  <span className="truncate">{link.label || hostOf(link.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {(people || follow) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {people && (
              <p className="text-body text-stone-700">
                <Link href={`${people.href}/followers`} className="underline-offset-2 hover:underline">
                  <strong className="font-semibold text-ink tabular-nums">{people.followers}</strong>{" "}
                  {people.followers === 1 ? "follower" : "followers"}
                </Link>
                {" · "}
                <Link href={`${people.href}/following`} className="underline-offset-2 hover:underline">
                  <strong className="font-semibold text-ink tabular-nums">{people.following}</strong> following
                </Link>
              </p>
            )}
            {follow}
          </div>
        )}
        {isMe && (
          <>
            <p className="mt-3 flex gap-1.5 text-meta leading-snug text-muted">
              <Globe aria-hidden size={14} className="mt-0.5 shrink-0" />
              {agent ? "Public" : "Public. Agent links stay private."}
            </p>
            <ShareMyPage title={unnamed ? "My profile on Porchcard" : `${name} on Porchcard`} />
          </>
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
