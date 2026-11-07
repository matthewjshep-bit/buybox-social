import type { ReactNode } from "react";
import { appUrl, BRAND_COLORS, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/listings/types";

// What a link preview (the picture and words a text message or chat shows for
// a link) says about a home. Only the listing: never who sent it, who it's
// for, or anything anyone said.

export const PREVIEW_SIZE = { width: 1200, height: 630 };

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

// Passed to the renderer as bytes, since it won't fetch from private addresses.
// A preview without the photo is better than no preview at all.
export async function loadPhoto(path: string | undefined) {
  if (!path) return null;
  try {
    const res = await fetch(new URL(path, appUrl()));
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${bytes}`;
  } catch {
    return null;
  }
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
