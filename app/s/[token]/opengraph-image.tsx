import { loadPhoto, PREVIEW_SIZE, PREVIEW_TYPE, PreviewFrame, PreviewHome, previewImage } from "@/app/homes/[key]/preview";
import { getShareByToken, getShareListings } from "@/lib/shares";

// Drawn fresh for each request (a day's keeping is up to whoever asks), so a
// home the agent adds or takes off shows the next day at the latest, never a
// picture kept for good.
export const dynamic = "force-dynamic";

// Read out in place of the picture, said the way the link's title says it:
// "3 homes picked for you by Jordan Rivera". Never who it's for.
export async function generateImageMetadata({ params }: { params: { token: string } }) {
  const found = await getShareByToken(params.token);
  const listings = found ? await getShareListings(found.share.id) : [];
  const by = found?.agent.full_name || "your agent";
  const alt =
    listings.length === 0
      ? "Porchcard"
      : `${listings.length === 1 ? listings[0].UnparsedAddress : `${listings.length} homes`} picked for you by ${by}`;
  return [{ id: "card", alt, size: PREVIEW_SIZE, contentType: PREVIEW_TYPE }];
}

// The picture shown in the text message when an agent sends a link: the home
// and who it's from, never who it's for or anything said on it.
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getShareByToken(token);
  const listings = found ? await getShareListings(found.share.id) : [];
  const listing = listings[0];
  const photo = await loadPhoto(listing?.Media[0]?.MediaURL);
  const agent = found?.agent;

  return previewImage(
    <PreviewFrame photo={photo} color={agent?.brand_color}>
      {listing ? (
        listings.length > 1 ? (
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>{`${listings.length} homes picked for you`}</div>
        ) : (
          <PreviewHome listing={listing} />
        )
      ) : (
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>Porchcard</div>
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
  );
}
