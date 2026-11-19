import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Modal } from "@/components/modal";
import { ReelView, type ReelParams } from "@/components/reel-view";

// A home tapped in the feed, on someone's page, or among a client's: the
// homes on a dark stage over the page (nearly all the window; all of it on a
// phone), one after another, closed with its X, Escape, or a tap beside it,
// back to the page as it was. (Browse, with no home asked for, is a page of
// its own: /browse.)
export default async function ReelModal({ searchParams }: { searchParams: Promise<ReelParams> }) {
  await connection();
  const params = await searchParams;
  if (typeof params.from !== "string" && typeof params.home !== "string") redirect("/browse");
  return (
    <Modal label="Homes">
      <div className="h-full">
        <ReelView params={params} contained />
      </div>
    </Modal>
  );
}
