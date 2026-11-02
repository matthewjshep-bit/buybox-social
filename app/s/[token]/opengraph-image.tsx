import { ImageResponse } from "next/og";
import { appUrl, formatPrice } from "@/lib/format";
import { getShareByToken, getShareListings } from "@/lib/shares";

export const alt = "A home picked for you by your agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Passed to the renderer as bytes, since it won't fetch from private addresses.
// A preview without the photo is better than no preview at all.
async function loadPhoto(path: string | undefined) {
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

// The picture shown in the text message when an agent sends a link.
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getShareByToken(token);
  const listings = found ? await getShareListings(found.share.id) : [];
  const listing = listings[0];
  const photo = await loadPhoto(listing?.Media[0]?.MediaURL);
  const agent = found?.agent;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: agent?.brand_color ?? "#1F5F5B",
        color: "white",
      }}
    >
      {photo && (
        <img
          src={photo}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }}
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
        {listing ? (
          <>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>
              {listings.length > 1 ? `${listings.length} homes picked for you` : formatPrice(listing.ListPrice)}
            </div>
            {listings.length === 1 && (
              <div style={{ display: "flex", fontSize: 32, marginTop: 4 }}>
                {`${listing.UnparsedAddress}, ${listing.City}`}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>BuyBox Social</div>
        )}
        {agent && (
          <div style={{ display: "flex", alignItems: "center", marginTop: 20, fontSize: 28 }}>
            {agent.photo_data_url && (
              <img
                src={agent.photo_data_url}
                alt=""
                width={64}
                height={64}
                style={{ borderRadius: 32, marginRight: 16, objectFit: "cover" }}
              />
            )}
            {`From ${agent.full_name || "your agent"}${agent.brokerage ? `, ${agent.brokerage}` : ""}`}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
