"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, getViewAs } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isShareToken } from "@/lib/shares";

export type LeaveResult = { error: string };

// Someone an agent added to a link, signed in on their own link, takes
// themselves off it: the link stops working, and what they liked, passed on
// and said there goes with them (reactions, comments, photo likes and asks
// all cascade from their place on it). Only ever their own place, and only
// one the agent gave them: someone who joined a link by themselves has no
// link of their own to leave. The link's title follows the people still on
// it (the database renames it).
export async function leaveLink(token: string): Promise<LeaveResult> {
  if (typeof token !== "string" || !isShareToken(token)) return { error: "This link is no longer available." };
  const [account, viewing] = await Promise.all([getCurrentUser(), getViewAs()]);
  if (!account?.role) return { error: "Please sign in first." };
  // Looking as someone else is for seeing, never for doing this on their behalf.
  if (viewing) return { error: "You're viewing as someone else, so nothing here is changed." };
  const gone = await sql<{ id: string }[]>`
    delete from participants
    where token = ${token} and account_id = ${account.id} and invited_at is not null
    returning id`;
  if (gone.length === 0) return { error: "You're not on this link any more." };
  redirect("/");
}
