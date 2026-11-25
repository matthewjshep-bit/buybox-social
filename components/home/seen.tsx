"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { noteSeen } from "@/app/homes/actions";

// Notes which cards were in front of them: a card at least half on screen
// for a moment counts as seen (as LinkedIn counts a dwell), sent to the
// server a few at a time, and once more as they leave. Each card carries
// its name in `data-item` (a strip of several homes, all of theirs, apart by
// spaces). Nothing else here: the feed is just as it was.
export function Seen({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const noted = new Set<string>();
    const pending = new Set<string>();
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (pending.size === 0) return;
      const items = [...pending];
      pending.clear();
      void noteSeen(items).catch(() => {});
    };
    const queue = (items: string) => {
      for (const item of items.split(" ").filter(Boolean)) {
        if (noted.has(item)) continue;
        noted.add(item);
        pending.add(item);
      }
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 2000);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const item = (entry.target as HTMLElement).dataset.item;
          if (!item) continue;
          if (entry.isIntersecting) {
            if (!timers.has(entry.target)) timers.set(entry.target, setTimeout(() => queue(item), 1000));
          } else {
            clearTimeout(timers.get(entry.target));
            timers.delete(entry.target);
          }
        }
      },
      { threshold: 0.5 },
    );
    for (const card of el.querySelectorAll("[data-item]")) observer.observe(card);
    // Cards that come later (a refresh) are watched too.
    const watcher = new MutationObserver(() => {
      for (const card of el.querySelectorAll("[data-item]")) observer.observe(card);
    });
    watcher.observe(el, { childList: true, subtree: true });
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      observer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      for (const timer of timers.values()) clearTimeout(timer);
      clearTimeout(flushTimer);
      flush();
    };
  }, []);
  return <div ref={box}>{children}</div>;
}
