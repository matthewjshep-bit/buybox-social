import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MessagesShell } from "@/components/messages/shell";
import { ThreadList } from "@/components/messages/thread-list";
import { requireUser } from "@/lib/auth";
import { getThreads } from "@/lib/messages";

export const metadata: Metadata = { title: "Messages · Porchcard" };

// Messages: every home someone sent or was sent, as conversations
// (lib/messages.ts). The list down the left is the same on every page under
// here; the conversation that's open is the page.
export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const me = await requireUser();
  const threads = await getThreads(me);
  // Starting a conversation is sending homes: an agent's builder, or the steps for anyone else.
  const compose = me.role === "agent" ? "/dashboard/new" : "/send";
  return (
    <MessagesShell list={<ThreadList threads={threads} compose={compose} />}>{children}</MessagesShell>
  );
}
