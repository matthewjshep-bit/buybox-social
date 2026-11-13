import { connection } from "next/server";
import { ReelView, type ReelParams } from "@/components/reel-view";

export const metadata = { title: "Homes · Porchcard" };

// Homes full screen: what a feed's home opens by its own address (a link
// shared, the page reloaded). Opened from the feed itself, it's a pop-out
// over it instead: app/@modal/(.)reel.
export default async function ReelPage({ searchParams }: { searchParams: Promise<ReelParams> }) {
  await connection();
  return <ReelView params={await searchParams} />;
}
