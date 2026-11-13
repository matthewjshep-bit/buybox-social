import { commentParam, ListingDetail, photoParam } from "@/components/listing-detail";
import { Modal } from "@/components/modal";

// Opening a home from the map, someone's page or the activity bell shows it
// here, on a dark stage over that page (on the photo it was about, from
// `?photo=`, and with its comments open on one of them, from `?comment=`).
export default async function HomeModal({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  return (
    <Modal label="Home details" variant="stage">
      <div className="h-full">
        <ListingDetail
          listingKey={decodeURIComponent(key)}
          embedded
          photo={photoParam(query.photo)}
          comment={commentParam(query.comment)}
        />
      </div>
    </Modal>
  );
}
