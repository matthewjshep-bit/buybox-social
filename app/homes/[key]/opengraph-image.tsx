import { ImageResponse } from "next/og";
import { sql } from "@/lib/db";
import type { Listing } from "@/lib/listings/types";
import { loadPhoto, PreviewFrame, PreviewHome } from "./preview";

export const alt = "A home on BuyBox Social";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

  return new ImageResponse(
    <PreviewFrame photo={photo}>
      {listing ? (
        <PreviewHome listing={listing} />
      ) : (
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>BuyBox Social</div>
      )}
    </PreviewFrame>,
    size,
  );
}
