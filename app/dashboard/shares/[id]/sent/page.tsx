import { LinkReady } from "@/components/link-ready";
import { requireAgent } from "@/lib/auth";

export const metadata = { title: "Your link is ready · Porchcard" };

// The last step of sending homes: the link, ready to copy or send. Then on
// to the link's own page, or to send more.
export default async function LinkReadyPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  const { id } = await params;
  return <LinkReady ownerId={agent.id} id={id} done={`/dashboard/shares/${id}`} again="/dashboard/new" />;
}
