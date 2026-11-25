import { redirect } from "next/navigation";

// The old "Your link is ready" page: the link's own page has every link on it.
export default async function LinkReadyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/shares/${encodeURIComponent(id)}`);
}
