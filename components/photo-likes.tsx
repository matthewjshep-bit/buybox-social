"use client";

import { useState } from "react";
import { useThread } from "@/components/listing-thread";
import type { ListingMedia } from "@/lib/listings/types";
import { likeId, mediaKeyOf, type PhotoLikes, type SpotReaction } from "@/lib/photos";

// A photo, or the media key of what stands in for one (the home's facts).
type Where = ListingMedia | string;
const keyOf = (where: Where) => (typeof where === "string" ? where : mediaKeyOf(where));

const reactionsOf = (likes: PhotoLikes) =>
  new Map<string, Exclude<SpotReaction, null>>([
    ...likes.mine.map((id) => [id, "like"] as const),
    ...likes.mineDisliked.map((id) => [id, "dislike"] as const),
  ]);

// Your likes and dislikes on things in a home's photos ("the kitchen") and its
// facts ("the price"), shown at once, with counts that include them. When the
// server's copy changes, it wins, unless you're still saving a change of your
// own (a copy from before it would undo it for a moment).
export function usePhotoLikes(listingKey: string, likes: PhotoLikes) {
  const { actions, ensureName } = useThread();
  const [mine, setMine] = useState(() => reactionsOf(likes));
  const [base, setBase] = useState(likes);
  // The last thing you liked or disliked here, and when: said at once in the
  // line above the price, until the page hears it back.
  const [last, setLast] = useState<{ mediaKey: string; tag: string; reaction: SpotReaction; at: string } | null>(null);
  const [saving, setSaving] = useState(0);
  if (JSON.stringify([likes.mine, likes.mineDisliked]) !== JSON.stringify([base.mine, base.mineDisliked])) {
    setBase(likes);
    if (saving === 0) setMine(reactionsOf(likes));
  }
  const was = reactionsOf(base);

  const reactionOf = (where: Where, tag: string): SpotReaction => mine.get(likeId(keyOf(where), tag)) ?? null;
  const isLiked = (where: Where, tag: string) => reactionOf(where, tag) === "like";
  // Everyone's, yours as it is now.
  const tally = (where: Where, tag: string, reaction: "like" | "dislike") => {
    const id = likeId(keyOf(where), tag);
    const counts = reaction === "like" ? likes.counts : likes.dislikes;
    return (counts[id] ?? 0) - (was.get(id) === reaction ? 1 : 0) + (mine.get(id) === reaction ? 1 : 0);
  };
  const count = (where: Where, tag: string) => tally(where, tag, "like");
  const dislikes = (where: Where, tag: string) => tally(where, tag, "dislike");

  const set = async (where: Where, tag: string, reaction: SpotReaction) => {
    if (!actions.likePhoto || !(await ensureName())) return;
    const id = likeId(keyOf(where), tag);
    const before = mine.get(id) ?? null;
    const put = (value: SpotReaction) =>
      setMine((current) => {
        const next = new Map(current);
        if (value) next.set(id, value);
        else next.delete(id);
        return next;
      });
    put(reaction);
    setLast({ mediaKey: keyOf(where), tag, reaction, at: new Date().toISOString() });
    setSaving((n) => n + 1);
    const result = await actions.likePhoto(listingKey, keyOf(where), tag, reaction).finally(() => setSaving((n) => n - 1));
    if (!result.ok) put(before);
  };

  // Every tag anyone has liked or disliked here, yours just now included.
  const likedTags = (where: Where) => {
    const prefix = likeId(keyOf(where), "");
    const ids = new Set([...Object.keys(likes.counts), ...Object.keys(likes.dislikes), ...mine.keys()]);
    return [...ids].filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
  };

  const anyLiked = (reactions: Map<string, string>) => [...reactions.values()].includes("like");
  return {
    enabled: Boolean(actions.likePhoto),
    reactionOf,
    isLiked,
    count,
    dislikes,
    set,
    likedTags,
    // Whether you'd liked anything in the photos when the page loaded, and now.
    hadAny: anyLiked(was),
    hasAny: anyLiked(mine),
    // What you just did, while the page's copy doesn't have it yet.
    unheard:
      last && reactionOf(last.mediaKey, last.tag) === last.reaction && was.get(likeId(last.mediaKey, last.tag)) !== last.reaction
        ? last
        : null,
  };
}
