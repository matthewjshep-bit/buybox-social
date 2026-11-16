"use client";

import { useState } from "react";
import { commentInReel } from "@/app/homes/actions";
import { CommentBubble } from "@/components/comment-bubble";
import { InlineBox } from "./inline-box";

// Under a home in the feed, as Facebook has it: your face, and a box right
// there to say something about the home ("Write a comment…"), into its
// public conversation. Enter posts (Shift+Enter is a new line); what you
// said shows straight away, just above the box.
export function InlineComment({
  me,
  listingKey,
  address,
  agent = false,
}: {
  me: { name: string; photo: string | null };
  listingKey: string;
  address: string;
  agent?: boolean;
}) {
  const [posted, setPosted] = useState<string[]>([]);

  return (
    <div className="relative z-20 flex flex-col gap-2 px-3.5 pt-3">
      {posted.length > 0 && (
        <ul aria-label="What you said" className="flex flex-col gap-2">
          {posted.map((text, i) => (
            <li key={i}>
              <CommentBubble name="You" face={me.name} photo={me.photo} agent={agent}>
                {text}
              </CommentBubble>
            </li>
          ))}
        </ul>
      )}
      <InlineBox
        me={me}
        agent={agent}
        placeholder="Write a comment…"
        label={`Comment on ${address}`}
        sendLabel={["Post", "Posting"]}
        onSend={async (text) => {
          const result = await commentInReel(listingKey, text);
          if (!result.ok) return result.error;
          setPosted((now) => [...now, text]);
          return null;
        }}
      />
    </div>
  );
}
