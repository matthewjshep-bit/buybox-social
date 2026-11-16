import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureAccountVisitor } from "@/lib/public";

// Someone's own banner image, by their page's id, as a plain image: small, so
// it's served from the database as it is. Its address carries a version
// (`?v=`), so it can be kept as long as it lasts; a new image has a new address.
// `?source=1`: the image as they added it, before framing, for moving and
// resizing it. Theirs alone: only ever served to them.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const source = new URL(request.url).searchParams.has("source");
  if (source) {
    const account = await getCurrentUser();
    const me = account?.role ? await ensureAccountVisitor(account) : null;
    if (me?.id !== id) return new Response(null, { status: 404 });
  }
  const [row] = await sql<{ image: string | null }[]>`
    select ${source ? sql`coalesce(a.banner_source_data_url, a.banner_data_url)` : sql`a.banner_data_url`} as image
    from visitors v join accounts a on a.id = v.account_id
    where v.id = ${id}`;
  const data = row?.image?.match(/^data:(image\/jpeg);base64,([A-Za-z0-9+/]+=*)$/);
  if (!data) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data[2], "base64"), {
    headers: {
      "Content-Type": data[1],
      "Cache-Control": source ? "private, no-store" : "public, max-age=31536000, immutable",
    },
  });
}
