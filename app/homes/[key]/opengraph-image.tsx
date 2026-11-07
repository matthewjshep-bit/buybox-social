import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { loadPhoto, PREVIEW_SIZE, PREVIEW_TYPE, PreviewFrame, PreviewHome, previewImage } from "./preview";

export const alt = "A home on BuyBox Social";
export const size = PREVIEW_SIZE;
export const contentType = PREVIEW_TYPE;

// The picture shown when someone sends a home's own page: the home alone, with
// nothing of who has looked at it or what they said.
export default async function Image({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const [row] =
    key.length > 100
      ? []
      : await sql<{ data: Listing }[]>`select data from listings where listing_key = ${key}`;
  const listing = row?.data;
  const first = listing && [...listing.Media].sort((a, b) => a.Order - b.Order)[0];
  const photo = await loadPhoto(first?.MediaURL);

  return previewImage(
    <PreviewFrame photo={photo}>
      {listing ? (
        <PreviewHome listing={listing} />
      ) : (
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>BuyBox Social</div>
      )}
    </PreviewFrame>,
  );
}
