import { sql } from "@/lib/db";

// A photo of a listing someone added themselves, by its id, as a plain image.
// It never changes (a new photo has a new id), so it can be kept for good.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const [row] = await sql<{ data_url: string }[]>`select data_url from listing_uploads where id = ${id}`;
  const data = row?.data_url.match(/^data:(image\/jpeg);base64,([A-Za-z0-9+/]+=*)$/);
  if (!data) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data[2], "base64"), {
    headers: { "Content-Type": data[1], "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
