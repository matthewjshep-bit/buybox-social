import { redirect } from "next/navigation";
import { LinkReady } from "@/components/link-ready";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Your link is ready · Porchcard" };

// A link someone (not an agent) made: ready to copy or send, and the way
// back into it to see what was said. Theirs alone. (An agent's has a page on
// their dashboard.)
export default async function OwnLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  if (me.role === "agent") redirect(`/dashboard/shares/${encodeURIComponent(id)}/sent`);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <LinkReady ownerId={me.id} id={id} done="/" again="/send" open />
    </main>
  );
}
