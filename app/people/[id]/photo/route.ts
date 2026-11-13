import { sql } from "@/lib/db";

// Someone's own photo, by their page's id, as a plain image: small, so it's
// served from the database as it is. Its address carries a version (`?v=`),
// so it can be kept as long as it lasts; a new photo has a new address.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const [row] = await sql<{ photo: string | null }[]>`
    select a.photo_data_url as photo
    from visitors v join accounts a on a.id = v.account_id
    where v.id = ${id}`;
  const data = row?.photo?.match(/^data:(image\/jpeg);base64,([A-Za-z0-9+/]+=*)$/);
  if (!data) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data[2], "base64"), {
    headers: { "Content-Type": data[1], "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
