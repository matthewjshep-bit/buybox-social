import { Globe, Images, Link2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddFirstName, PhotoControls, ShareMyPage } from "@/app/people/[id]/client";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/format";
import { sinceLabel } from "@/lib/profile";
import { button, card } from "@/lib/ui";

// The top of someone's page: a band from the photo they liked most, their
// initial, name, how long they've been looking and how much. Those counts are
// plain words, not links: the filters below the header do the filtering. Who
// follows them and whom they follow are links, to those lists, with Follow
// beside them. Your own page with no name yet says "Your page" and asks for one.
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
  counts,
  cover,
  showPassed = true,
  people,
  followsYou = false,
  follow,
  photo,
  client,
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
  counts: { liked: number; passed: number; comments: number };
  cover: string | null;
  showPassed?: boolean;
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
}) {
  return (
    <section aria-labelledby="profile-name" className={cn(card, "overflow-hidden")}>
      <div aria-hidden className="relative h-[120px] overflow-hidden bg-stone-200">
        {cover && (
          <>
            {/* Soft enough to sit behind the name, clear enough to read as a home. Blurred, a
                small photo looks the same as a big one, so a phone loads a small one. */}
            <Image src={cover} alt="" fill sizes="96px" className="scale-110 object-cover blur-sm" />
            <span className="absolute inset-0 bg-black/15" />
          </>
        )}
      </div>
      <div className="px-4 pb-4">
        <Avatar name={face} tone={agent ? "agent" : "person"} size={18} photo={photo} className="relative -mt-9 ring-4 ring-white" />
        {/* The keyboard comes here once you've said your name, as it changes. */}
        <h1 id="profile-name" tabIndex={-1} className="mt-2 break-words font-display text-[30px] leading-tight outline-none">
          {isMe ? (unnamed ? "Your page" : `${name} (you)`) : name}
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
        {isMe && <PhotoControls hasPhoto={Boolean(photo)} />}
        <p className="mt-1 text-body text-muted">
          Looking since {sinceLabel(since)}
          {homes > 0 && ` · ${homes} ${homes === 1 ? "home" : "homes"}`}
        </p>
        {/* Nothing yet says itself below; three zeros here would only repeat it. */}
        {counts.liked + (showPassed ? counts.passed : 0) + counts.comments > 0 && (
          <p className="mt-2 text-body text-stone-700">
            <strong className="font-semibold text-ink tabular-nums">{counts.liked}</strong> liked
            {showPassed && (
              <>
                {" · "}
                <strong className="font-semibold text-ink tabular-nums">{counts.passed}</strong> passed
              </>
            )}
            {" · "}
            <strong className="font-semibold text-ink tabular-nums">{counts.comments}</strong>{" "}
            {counts.comments === 1 ? "comment" : "comments"}
          </p>
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
              Everyone can see this page. What you do on an agent&apos;s link never shows here.
            </p>
            <ShareMyPage title={unnamed ? "My page on Porchcard" : `${name} on Porchcard`} />
          </>
        )}
      </div>
    </section>
  );
}
