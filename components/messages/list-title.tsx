"use client";

import { usePathname } from "next/navigation";

// "Messages" over the list: the page's own title on Messages itself, and a
// heading under the conversation's on a conversation's page (one h1 a page).
export function ListTitle() {
  const Title = usePathname() === "/messages" ? "h1" : "h2";
  return <Title className="text-xl font-semibold">Messages</Title>;
}
