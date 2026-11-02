import { ListingDetail } from "@/components/listing-detail";
import { Modal } from "@/components/modal";

// Clicking a home on the homepage opens it here, over the homepage.
export default async function HomeModal({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const listingKey = decodeURIComponent(key);
  return (
    <Modal label="Home details">
      <ListingDetail listingKey={listingKey} />
    </Modal>
  );
}
