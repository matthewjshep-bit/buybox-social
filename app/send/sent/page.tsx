import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkRow, lookAlikes } from "@/components/client-list";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getClientBook } from "@/lib/clients";
import { cn } from "@/lib/format";
import { backLink, button, card, pageColumn, pageTitle } from "@/lib/ui";

export const metadata = { title: "Homes you sent · Porchcard" };

// Every link someone (not an agent) has made, newest first, so none is lost
// once its page is closed: who it's for, the homes on it and when it went,
// and one button (the link to copy while nobody has opened it, otherwise its
// page). Theirs alone. Of how it's gone, only whether it's been opened and
// how many comments are on it: nothing of when, how far anyone looked, or
// what they liked or passed on. (An agent's are on their dashboard, under
// Links.)
export default async function SentPage() {
  const me = await requireUser();
  if (me.role === "agent") redirect("/dashboard/links");
  // (Their links are the ones they're the sender of, as an agent's are.)
  const { links } = await getClientBook(me.id);
  const alike = lookAlikes(links);
  return (
    <main className={pageColumn()}>
      <LiveRefresh />
      <Link href="/send" className={backLink}>
        <ArrowLeft aria-hidden size={18} /> Send homes
      </Link>
      <h1 className={cn(pageTitle, "mt-2")}>Homes you sent</h1>
      {links.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nothing sent yet"
          className="mt-5"
          action={
            <Link href="/send" className={button({ kind: "primary", size: "lg" })}>
              <Send aria-hidden size={20} /> Send homes
            </Link>
          }
        />
      ) : (
        <ul aria-label="Homes you sent" className={cn(card, "mt-5 divide-y divide-stone-200")}>
          {links.map((link) => (
            <LinkRow
              key={link.shareId}
              // Its own page here, not an agent's dashboard.
              link={{ ...link, href: `/send/${link.shareId}` }}
              lead="who"
              timed={alike.has(link.shareId)}
              plain
            />
          ))}
        </ul>
      )}
    </main>
  );
}
