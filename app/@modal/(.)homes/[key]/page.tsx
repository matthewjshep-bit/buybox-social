import { ListingDetail, photoParam } from "@/components/listing-detail";
import { Modal } from "@/components/modal";

// Opening a home from the map, someone's page or the activity bell shows it
// here, over that page (on the photo it was about, from `?photo=`).
export default async function HomeModal({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  return (
    <Modal label="Home details">
      <div className="h-dvh sm:h-[min(52rem,calc(100dvh-4rem))]">
        <ListingDetail listingKey={decodeURIComponent(key)} embedded photo={photoParam(query.photo)} />
      </div>
    </Modal>
  );
}
