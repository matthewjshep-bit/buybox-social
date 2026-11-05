"use client";

import { useState } from "react";
import { useThread } from "@/components/listing-thread";
import type { ListingMedia } from "@/lib/listings/types";
import { likeId, mediaKeyOf, type PhotoLikes } from "@/lib/photos";

// Your likes on things in a home's photos ("the kitchen"), shown at once, with
// counts that include them. When the server's copy changes, it wins.
export function usePhotoLikes(listingKey: string, likes: PhotoLikes) {
  const { actions, ensureName } = useThread();
  const [mine, setMine] = useState(() => new Set(likes.mine));
  const [base, setBase] = useState(likes.mine);
  if (JSON.stringify(likes.mine) !== JSON.stringify(base)) {
    setBase(likes.mine);
    setMine(new Set(likes.mine));
  }

  const isLiked = (photo: ListingMedia, tag: string) => mine.has(likeId(mediaKeyOf(photo), tag));
  const count = (photo: ListingMedia, tag: string) => {
    const id = likeId(mediaKeyOf(photo), tag);
    return (likes.counts[id] ?? 0) - (base.includes(id) ? 1 : 0) + (mine.has(id) ? 1 : 0);
  };

  const set = async (photo: ListingMedia, tag: string, liked: boolean) => {
    if (!actions.likePhoto || !(await ensureName())) return;
    const id = likeId(mediaKeyOf(photo), tag);
    const flip = (on: boolean) =>
      setMine((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    flip(liked);
    const result = await actions.likePhoto(listingKey, mediaKeyOf(photo), tag, liked);
    if (!result.ok) flip(!liked);
  };

  // Every tag anyone has liked in this photo, yours just now included.
  const likedTags = (photo: ListingMedia) => {
    const prefix = likeId(mediaKeyOf(photo), "");
    const ids = new Set([...Object.keys(likes.counts), ...mine]);
    return [...ids].filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
  };

  return {
    enabled: Boolean(actions.likePhoto),
    isLiked,
    count,
    set,
    likedTags,
    // Whether you'd liked anything in the photos when the page loaded, and now.
    hadAny: base.length > 0,
    hasAny: mine.size > 0,
  };
}
