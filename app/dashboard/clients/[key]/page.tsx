import { redirect } from "next/navigation";

// A client's page is their conversation in Messages now, by the same key.
export default async function ClientPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  redirect(`/messages/${encodeURIComponent(decodeURIComponent(key))}`);
}
