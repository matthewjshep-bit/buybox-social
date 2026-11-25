import { notFound } from "next/navigation";
import { ThreadPane } from "@/components/messages/thread-pane";
import { requireUser } from "@/lib/auth";
import { getThread } from "@/lib/messages";

// One conversation: every send and message in it, oldest first, each home
// with what's happened to it, and the box to write in at the foot.
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const [me, { key: raw }, query] = await Promise.all([requireUser(), params, searchParams]);
  const view = await getThread(me, decodeURIComponent(raw));
  if (!view) notFound();
  return <ThreadPane me={me} view={view} sent={typeof query.sent === "string" ? query.sent : null} />;
}
