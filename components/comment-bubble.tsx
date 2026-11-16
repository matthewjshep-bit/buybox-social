import { MapPin, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { MoreText } from "@/components/more-text";
import { Avatar } from "@/components/ui";

// Something said, as Facebook shows a comment: their face on the left, their
// name and words in a soft bubble beside it, and what it's about and how it
// went just under the bubble.
export function CommentBubble({
  name,
  face,
  photo,
  agent,
  spot,
  meta,
  children,
}: {
  // Who said it: plain, or a link to their page (and a badge beside it).
  name: ReactNode;
  face: string;
  photo?: string | null;
  agent: boolean;
  spot?: { name: string; fact: boolean } | null;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Avatar name={face} tone={agent ? "agent" : "person"} size={8} photo={photo} />
      <div className="min-w-0 max-w-full flex-1">
        <div className="w-fit max-w-full rounded-2xl bg-stone-100 px-3 py-2">
          <p className="flex flex-wrap items-center gap-x-1.5 text-meta font-semibold leading-5 text-ink">{name}</p>
          <MoreText className="text-body leading-snug text-ink">{children}</MoreText>
        </div>
        {(spot || meta) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 px-3 text-meta text-muted">
            {spot && (
              <span className="inline-flex items-center gap-1">
                {spot.fact ? <Tag aria-hidden size={12} /> : <MapPin aria-hidden size={12} />}
                {spot.name}
              </span>
            )}
            {spot && meta && <span aria-hidden>·</span>}
            {meta}
          </p>
        )}
      </div>
    </div>
  );
}
