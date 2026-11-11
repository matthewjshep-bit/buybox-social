import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { appUrl, BRAND_COLORS, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";
import { PORCHCARD_LOGO_RATIO, porchcardLogoSvg } from "@/components/porchcard-logo";

const LOGO = `data:image/svg+xml;base64,${Buffer.from(porchcardLogoSvg("#ffffff")).toString("base64")}`;

// What a link preview (the picture and words a text message or chat shows for
// a link) says about a home. Only the listing: never who sent it, who it's
// for, or anything anyone said.

export const PREVIEW_SIZE = { width: 1200, height: 630 };
export const PREVIEW_TYPE = "image/jpeg";

// "3 bd · 2 ba · 1,850 sq ft", then "· Kirkland" when the city isn't shown
// elsewhere.
export function homeFacts(listing: Listing, { city = false } = {}) {
  return [
    Number.isFinite(listing.BedroomsTotal) && `${listing.BedroomsTotal} bd`,
    Number.isFinite(listing.BathroomsTotalInteger) && `${listing.BathroomsTotalInteger} ba`,
    listing.LivingArea > 0 && `${listing.LivingArea.toLocaleString("en-US")} sq ft`,
    city && listing.City,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Passed to the renderer as bytes, since it won't fetch from private addresses,
// and cut to the preview's own size first, so there's less to draw. A preview
// without the photo is better than no preview at all.
export async function loadPhoto(path: string | undefined) {
  if (!path) return null;
  try {
    const res = await fetch(new URL(path, appUrl()));
    if (!res.ok) return null;
    const { default: sharp } = await import("sharp");
    const bytes = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(PREVIEW_SIZE.width, PREVIEW_SIZE.height, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// The picture itself, as a JPEG. Drawn as a PNG, a photo comes to 1-2 MB,
// which a phone fetches over its data each time the link is pasted; as a JPEG
// it's a tenth of that. (next.config.ts lets it be kept for a day.)
export async function previewImage(element: ReactElement) {
  const png = Buffer.from(await new ImageResponse(element, PREVIEW_SIZE).arrayBuffer());
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp(png).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": PREVIEW_TYPE } });
}

// The home's photo, full bleed, darkened at the bottom under the words.
export function PreviewFrame({
  photo,
  color = BRAND_COLORS[0].value,
  children,
}: {
  photo: string | null;
  color?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: color,
        color: "white",
      }}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          width={PREVIEW_SIZE.width}
          height={PREVIEW_SIZE.height}
          style={{ position: "absolute", inset: 0, ...PREVIEW_SIZE, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "90px 48px 40px",
          display: "flex",
          flexDirection: "column",
          backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.7) 60%, rgba(0,0,0,0))",
        }}
      >
        {children}
      </div>
      {/* Porchcard's own logo, in white on the shade at the foot. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO}
        alt=""
        width={Math.round(40 * PORCHCARD_LOGO_RATIO)}
        height={40}
        style={{ position: "absolute", right: 48, bottom: 44 }}
      />
    </div>
  );
}

// One home: its price, then the facts, then where it is.
export function PreviewHome({ listing }: { listing: Listing }) {
  const facts = homeFacts(listing);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>{formatPrice(listing.ListPrice)}</div>
      {facts && <div style={{ display: "flex", fontSize: 34, marginTop: 2 }}>{facts}</div>}
      <div style={{ display: "flex", fontSize: 32, marginTop: 6, opacity: 0.9 }}>
        {`${listing.UnparsedAddress}, ${listing.City}`}
      </div>
    </div>
  );
}
