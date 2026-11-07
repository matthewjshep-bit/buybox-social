import { ImageResponse } from "next/og";
import { loadPhoto, PreviewFrame, PreviewHome } from "@/app/homes/[key]/preview";
import { getShareByToken, getShareListings } from "@/lib/shares";

export const alt = "A home picked for you by your agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The picture shown in the text message when an agent sends a link: the home
// and who it's from, never who it's for or anything said on it.
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getShareByToken(token);
  const listings = found ? await getShareListings(found.share.id) : [];
  const listing = listings[0];
  const photo = await loadPhoto(listing?.Media[0]?.MediaURL);
  const agent = found?.agent;

  return new ImageResponse(
    <PreviewFrame photo={photo} color={agent?.brand_color}>
      {listing ? (
        listings.length > 1 ? (
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>{`${listings.length} homes picked for you`}</div>
        ) : (
          <PreviewHome listing={listing} />
        )
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
    </PreviewFrame>,
    size,
  );
}
