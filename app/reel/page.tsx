import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ReelView, type ReelParams } from "@/components/reel-view";

export const metadata = { title: "Browse · Porchcard" };

// Homes full screen: what a feed's home opens by its own address (a link
// shared, the page reloaded). Opened from the feed itself, it's a pop-out
// over it instead: app/@modal/(.)reel. With no feed and no home asked for,
// this is just Browse, which has one address: /browse.
export default async function ReelPage({ searchParams }: { searchParams: Promise<ReelParams> }) {
  await connection();
  const params = await searchParams;
  if (typeof params.from !== "string" && typeof params.home !== "string") redirect("/browse");
  return <ReelView params={params} />;
}
