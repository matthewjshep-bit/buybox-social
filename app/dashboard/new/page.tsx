import { redirect } from "next/navigation";

// Sending homes is one box for everyone now (/send): an agent's old address
// for it leads there, with the same home or link picked.
export default async function NewSharePage({ searchParams }: { searchParams: Promise<{ share?: string; home?: string }> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (typeof query.home === "string") params.set("home", query.home);
  if (typeof query.share === "string") params.set("share", query.share);
  redirect(params.size ? `/send?${params}` : "/send?aud=someone");
}
