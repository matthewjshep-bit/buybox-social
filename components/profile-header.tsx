import { Globe } from "lucide-react";
import Image from "next/image";
import { ShareMyPage } from "@/app/people/[id]/client";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";
import { sinceLabel } from "@/lib/profile";
import { card } from "@/lib/ui";

// The top of someone's page: a band from the photo they liked most, their
// initial, name, how long they've been looking and how much. Counts are plain
// words, not links: the filters below the header do the filtering.
export function ProfileHeader({
  name,
  isMe,
  agent = false,
  since,
  homes,
  counts,
  cover,
  showPassed = true,
}: {
  name: string;
  isMe: boolean;
  // An agent's face is ink, as everywhere.
  agent?: boolean;
  since: string;
  homes: number;
  counts: { liked: number; passed: number; comments: number };
  cover: string | null;
  showPassed?: boolean;
}) {
  return (
    <section aria-labelledby="profile-name" className={cn(card, "overflow-hidden")}>
      <div aria-hidden className="relative h-[120px] overflow-hidden bg-stone-200">
        {cover && (
          <>
            {/* Soft enough to sit behind the name, clear enough to read as a home. */}
            <Image src={cover} alt="" fill sizes="(min-width: 1024px) 360px, 600px" className="scale-110 object-cover blur-sm" />
            <span className="absolute inset-0 bg-black/15" />
          </>
        )}
      </div>
      <div className="px-4 pb-4">
        <Avatar name={name} tone={agent ? "agent" : "person"} size={18} className="relative -mt-9 ring-4 ring-white" />
        <h1 id="profile-name" className="mt-2 break-words font-display text-[30px] leading-tight">
          {isMe ? `${name} (you)` : name}
        </h1>
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
        {isMe && (
          <>
            <p className="mt-3 flex gap-1.5 text-meta leading-snug text-muted">
              <Globe aria-hidden size={14} className="mt-0.5 shrink-0" />
              Everyone can see this page. What you do on an agent&apos;s link never shows here.
            </p>
            <ShareMyPage name={name} />
          </>
        )}
      </div>
    </section>
  );
}
