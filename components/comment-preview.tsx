"use client";

import { Lock, MapPin } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import type { FeedPost } from "@/lib/feed";
import { cn, timeAgo } from "@/lib/format";
import type { TimelineComment } from "@/lib/timeline";

// The latest few comments on a home, under its photo, the way a post reads:
// who liked it, then a line or two of what each person said, and "View all"
// to read the rest. Every line opens the comments (on that comment). Just the
// comments themselves, as the home's thread already has them: a name, an
// agent's badge, the words and when. Never who reacted how, and no way to
// anyone's profile from here.

// How many comments show before "View all".
export const PREVIEW_MOST = 3;

export function CommentPreview({
  post,
  mode,
  likes,
  mineLiked = false,
  host,
  onOpen,
  className,
}: {
  post: FeedPost;
  // Whether the viewer is among the likes (said as "you", not counted as an other).
  mineLiked?: boolean;
  // An agent's own listing: their page id, so their words lead.
  host?: string;
  // Public pages, or an agent's private link (where who liked it can be named).
  mode: "public" | "share";
  agentName?: string;
  canReact?: boolean;
  // How many liked the home, as the page counts it just now (yours included
  // the moment you tap). Unset: as the post arrived.
  likes?: number;
  // The comments, on one of them (none: at the top).
  onOpen: (commentId?: string) => void;
  onCompose?: () => void;
  className?: string;
}) {
  const liked = likes ?? post.likes;
  const all = post.timeline.filter((item): item is TimelineComment => item.kind === "comment");
  // The agent's first (on a link, theirs are marked; on their own listing's
  // public page, theirs are the host's), then the newest.
  const leads = (comment: TimelineComment) => comment.isAgent || (Boolean(host) && comment.profileId === host);
  const top = all
    .filter((comment) => !comment.parentId)
    .sort((a, b) => Number(leads(b)) - Number(leads(a)) || b.at.localeCompare(a.at));
  const shown = top.slice(0, PREVIEW_MOST);
  // Nothing yet: said quietly, so the room under the photo reads as what it's for.
  if (liked <= 0 && all.length === 0)
    return (
      <div data-comment-list data-keep-clear role="group" aria-label="Latest comments" className={cn("flex flex-col text-white", className)}>
        <p className="py-1.5 text-body text-white/65">No comments yet.</p>
      </div>
    );
  return (
    <div data-comment-list data-keep-clear role="group" aria-label="Latest comments" className={cn("flex flex-col text-white", className)}>
      {liked > 0 && (
        <p className="py-1.5 text-body font-semibold leading-5">{likedLine(liked, mode === "share" ? post.likers : [], mineLiked)}</p>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((comment) => (
            <li key={comment.id}>
              <button
                type="button"
                onClick={() => onOpen(comment.id)}
                className="flex min-h-11 w-full items-start gap-2 rounded-lg py-1.5 text-left transition-colors hover:bg-white/[0.06]"
              >
                <Avatar
                  name={comment.name}
                  tone={comment.fromPrivateChat ? "anonymous" : comment.isAgent ? "agent" : "person"}
                  size={6}
                  className={cn("mt-0.5", comment.isAgent && "ring-1 ring-white/30")}
                />
                <p className="line-clamp-2 min-w-0 flex-1 text-body leading-5">
                  <b className="font-semibold">{comment.name}</b>
                  {comment.isAgent && (
                    <Badge tone="ink" small className="ml-1.5 align-[2px] ring-1 ring-white/25">
                      Agent
                    </Badge>
                  )}
                  {comment.fromPrivateChat && <Lock aria-hidden size={11} className="ml-1 inline align-[-1px] text-white/60" />}{" "}
                  {comment.spot && <MapPin aria-hidden size={12} className="inline align-[-1px] text-white/60" />}
                  {comment.spot && " "}
                  <span className="text-white/90">{comment.body}</span>{" "}
                  <span className="whitespace-nowrap text-meta text-white/65">
                    ·{" "}
                    <time dateTime={comment.at} suppressHydrationWarning>
                      {timeAgo(comment.at)}
                    </time>
                  </span>
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {all.length > shown.length && (
        <button
          type="button"
          onClick={() => onOpen()}
          className="flex min-h-11 items-center text-body text-white/70 transition-colors hover:text-white"
        >
          View all {all.length.toLocaleString("en-US")} {all.length === 1 ? "comment" : "comments"}
        </button>
      )}
    </div>
  );
}

// "3 likes"; on an agent's link, with names to give: "Liked by Jenny and 2
// others", "Liked by Jenny and you" (you're never one of the others).
function likedLine(likes: number, names: string[], mine: boolean) {
  const named = names.filter((name) => name).slice(0, 2);
  // (With nobody to name, a count, yours among them, as a post has.)
  if (named.length === 0) return `${likes.toLocaleString("en-US")} ${likes === 1 ? "like" : "likes"}`;
  const people = mine ? [...named, "you"] : named;
  const rest = Math.max(0, likes - named.length - (mine ? 1 : 0));
  if (rest > 0) return `Liked by ${people.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
  return `Liked by ${people.length > 2 ? `${people.slice(0, -1).join(", ")} and ${people.at(-1)}` : people.join(" and ")}`;
}
