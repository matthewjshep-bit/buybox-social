"use client";

import { Heart } from "lucide-react";
import { createContext, useContext } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { cn } from "@/lib/format";
import type { ShareAgent } from "@/lib/shares";
import type { TimelineComment, TimelineItem } from "@/lib/timeline";

// An agent's first pass on the homes they send: before (or after) the link
// goes out, they open it as their client sees it and like or write a note on
// anything, the price or a spot in a photo. Everyone on the link sees it as
// theirs: their face on what they picked out, their note on its card, and
// their take leading the line on the photo.

// On an agent's link: the agent, for their face beside their take; and, when
// it's the agent looking at their own link, who their notes are for and the
// way back to the dashboard once they're done.
export type LinkAgent = {
  agent: Pick<ShareAgent, "full_name" | "photo_data_url">;
  notes: { for: string; done: string } | null;
};

const LinkAgentContext = createContext<LinkAgent | null>(null);
export const LinkAgentProvider = LinkAgentContext.Provider;
export const useLinkAgent = () => useContext(LinkAgentContext);
// The agent on their own link, writing notes: who for.
export const useNotesMode = () => useContext(LinkAgentContext)?.notes ?? null;

const agentFirst = (agent: LinkAgent["agent"]) => agent.full_name.split(" ")[0] || "Your agent";

// Whether the agent liked one thing: a fact ("Price") or a spot in a photo.
export const agentLiked = (items: TimelineItem[], mediaKey: string, tag: string) =>
  items.some(
    (item) =>
      item.kind === "reaction" && item.isAgent && item.photos.some((p) => p.mediaKey === mediaKey && p.spot === tag),
  );

// The agent's notes on one thing.
export const agentNotesOn = (items: TimelineItem[], mediaKey: string, tag: string) =>
  items.filter(
    (item): item is TimelineComment =>
      item.kind === "comment" && item.isAgent && !item.parentId && item.spot?.mediaKey === mediaKey && item.spot.tag === tag,
  );

// Whether the agent liked or said anything about one thing.
export const agentMarked = (items: TimelineItem[], mediaKey: string, tag: string) =>
  agentLiked(items, mediaKey, tag) || agentNotesOn(items, mediaKey, tag).length > 0;

// The agent's face on a fact they liked or wrote about: small, at the chip's
// end, so what they picked out can be seen before anything is tapped.
export function AgentMark({ size = 18, className }: { size?: number; className?: string }) {
  const link = useLinkAgent();
  if (!link) return null;
  return (
    <AgentAvatar
      agent={link.agent}
      size={size}
      decorative
      light
      className={cn("text-[8px] ring-1 ring-white/70", className)}
    />
  );
}

// "Jordan's take", or "your agent's", for a screen reader beside a fact.
export function useAgentMarkWords() {
  const link = useLinkAgent();
  if (!link) return null;
  return link.notes ? "your note" : `with a note from ${agentFirst(link.agent)}, your agent`;
}

// At the top of a fact's or a spot's card: what the agent thought of it, in
// their own words, with their face. To the agent on their own link, their own
// notes, the way their client will read them.
export function AgentTake({ notes, liked }: { notes: TimelineComment[]; liked: boolean }) {
  const link = useLinkAgent();
  const mine = Boolean(link?.notes);
  // (The agent's own like shows on the Like button below.)
  if (!link || (notes.length === 0 && (mine || !liked))) return null;
  return (
    <div data-agent-take className="mt-1 rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-inset ring-stone-200/80">
      <p className="flex items-center gap-2 text-meta font-semibold text-stone-700">
        <AgentAvatar agent={link.agent} size={22} decorative light className="text-[9px]" />
        <span className="min-w-0 truncate">{mine ? "Your note" : `${agentFirst(link.agent)}, your agent`}</span>
        {liked && !mine && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-rose-700">
            <Heart aria-hidden size={12} className="fill-rose-500 text-rose-500" />
            Likes this
          </span>
        )}
      </p>
      {notes.map((note) => (
        <p key={note.id} className="mt-1.5 whitespace-pre-line text-sm leading-snug text-ink">
          {note.body}
        </p>
      ))}
    </div>
  );
}
