"use client";

import { useEffect } from "react";

// Notes the order the feed is in front of them in, for the pop-out to walk
// it the same way (lib/home-feed.ts FEED_ORDER): a cookie, for one visit.
// Written each time Home renders, so it's always the order on screen.
export function FeedOrder({ name, value, maxAge }: { name: string; value: string; maxAge: number }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
  }, [name, value, maxAge]);
  return null;
}
