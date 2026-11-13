import { connection } from "next/server";
import { Modal } from "@/components/modal";
import { ReelView, type ReelParams } from "@/components/reel-view";

// A home tapped in the feed, on someone's page, or Browse homes: the homes on
// a dark stage over the page (nearly all the window; all of it on a phone),
// one after another, closed with its X, Escape, or a tap beside it, back to
// the page as it was.
export default async function ReelModal({ searchParams }: { searchParams: Promise<ReelParams> }) {
  await connection();
  return (
    <Modal label="Homes" variant="stage">
      <div className="h-full">
        <ReelView params={await searchParams} contained />
      </div>
    </Modal>
  );
}
