"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

// Messages, laid out the way a phone's are: the conversations down the left,
// the one that's open on the right, each scrolling on its own, the whole
// thing filling what's under the header. On a phone, one at a time: the
// list, or (at a conversation's own address) that conversation, with the
// way back at its top.
export function MessagesShell({ list, children }: { list: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname !== "/messages";
  return (
    <main
      data-messages
      className="mx-auto flex h-[calc(100dvh-3.5rem-1px)] max-w-[1140px] flex-col lg:grid lg:grid-cols-[min(24rem,36%)_minmax(0,1fr)]"
    >
      <section
        aria-label="Conversations"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white lg:flex-none lg:border-r lg:border-stone-200",
          inThread && "max-lg:hidden",
        )}
      >
        {list}
      </section>
      <section
        aria-label="Conversation"
        className={cn("flex min-h-0 flex-1 flex-col bg-white lg:flex-none", !inThread && "max-lg:hidden")}
      >
        {children}
      </section>
    </main>
  );
}
