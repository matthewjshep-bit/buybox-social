import { ListingDetail } from "@/components/listing-detail";
import { Modal } from "@/components/modal";

// Opening a home from the map shows it here, over the map.
export default async function HomeModal({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <Modal label="Home details">
      <div className="h-dvh sm:h-[min(52rem,calc(100dvh-4rem))]">
        <ListingDetail listingKey={decodeURIComponent(key)} embedded />
      </div>
    </Modal>
  );
}
