import { connection } from "next/server";
import { ReelView, type ReelParams } from "@/components/reel-view";

export const metadata = { title: "Browse · Porchcard" };

// Browse, in the bar: every home full screen, best matches for your taste
// first, as a page like the bar's other places (the bar is still there, over
// the photos, so Search or Home is one tap away). A home opened from a feed,
// a profile or a client is /reel instead, a pop-out over where it was opened.
export default async function BrowsePage({ searchParams }: { searchParams: Promise<ReelParams> }) {
  await connection();
  return <ReelView params={await searchParams} />;
}
