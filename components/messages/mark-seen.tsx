"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markThreadSeen } from "@/app/messages/actions";

// Opening a conversation is having seen it: said to the server as it opens,
// and the list beside it drawn again without its "new" dot. `whenWide`: it's
// the one Messages opens on by itself, which a phone doesn't show (the list
// is the page there), so only a wide screen counts as having seen it.
export function MarkThreadSeen({ threadKey, unread, whenWide = false }: { threadKey: string; unread: boolean; whenWide?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    let gone = false;
    const seen = () => {
      markThreadSeen(threadKey).then(() => {
        if (!gone) router.refresh();
      });
    };
    if (!whenWide) {
      seen();
      return () => {
        gone = true;
      };
    }
    // Wide now, or once it is (a tablet turned, a window widened).
    const wide = window.matchMedia("(min-width: 64rem)");
    if (wide.matches) {
      seen();
      return () => {
        gone = true;
      };
    }
    const onChange = () => {
      if (wide.matches) {
        wide.removeEventListener("change", onChange);
        seen();
      }
    };
    wide.addEventListener("change", onChange);
    return () => {
      gone = true;
      wide.removeEventListener("change", onChange);
    };
  }, [threadKey, unread, whenWide, router]);
  return null;
}
