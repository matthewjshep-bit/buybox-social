"use client";

import type { ReactNode } from "react";
import { commentInReel, deleteCommentInReel, editCommentInReel, joinPublic, likeCommentInReel, reactInStream } from "@/app/homes/actions";
import { NameGate } from "@/components/listing-thread";

// Around a feed of cards: the public conversation's actions (liking a home,
// commenting, liking a comment), and the sign-up sheet that rises the first
// time someone signed out tries one, as everywhere else. Each card's bar and
// its comments (FeedBar) work through it.
export function FeedGate({ myName, children }: { myName: string | null; children: ReactNode }) {
  return (
    <NameGate
      actions={{
        join: joinPublic,
        react: reactInStream,
        comment: commentInReel,
        editComment: editCommentInReel,
        deleteComment: deleteCommentInReel,
        likeComment: likeCommentInReel,
      }}
      myName={myName}
      prompt="Your first name shows publicly."
    >
      {children}
    </NameGate>
  );
}
