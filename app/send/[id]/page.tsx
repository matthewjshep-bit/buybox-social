import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkReady } from "@/components/link-ready";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { backLink, pageColumn } from "@/lib/ui";

export const metadata = { title: "Your link is ready · Porchcard" };

// A link someone (not an agent) made: ready to copy or send, and the way
// back into it to see what was said. Theirs alone. Back, and Done, go to
// every link they've made ("Homes you sent"), this one at the top when it's
// new. (An agent's has a page on their dashboard.)
export default async function OwnLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  if (me.role === "agent") redirect(`/dashboard/shares/${encodeURIComponent(id)}`);
  return (
    <main className={pageColumn()}>
      <Link href="/messages" className={cn(backLink, "mb-2")}>
        <ArrowLeft aria-hidden size={18} /> Messages
      </Link>
      <LinkReady ownerId={me.id} id={id} done="/messages" again="/send" open />
    </main>
  );
}
