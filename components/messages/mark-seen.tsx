"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markThreadSeen } from "@/app/messages/actions";

// Opening a conversation is having seen it: said to the server as it opens,
// and the list beside it drawn again without its "new" dot.
export function MarkThreadSeen({ threadKey, unread }: { threadKey: string; unread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    let gone = false;
    markThreadSeen(threadKey).then(() => {
      if (!gone) router.refresh();
    });
    return () => {
      gone = true;
    };
  }, [threadKey, unread, router]);
  return null;
}
