import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Compose, type ComposeTo } from "@/components/compose/compose";
import { firstName, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn } from "@/lib/format";
import { homeLiteOf } from "@/lib/home-lite";
import type { Listing } from "@/lib/listings/types";
import { getThread, getThreads } from "@/lib/messages";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { ensureAccountVisitor } from "@/lib/public";
import { backLink, pageColumn } from "@/lib/ui";

export const metadata = { title: "Send homes · Porchcard" };

// The box for saying something and sending homes, as a page of its own (from
// Messages' pencil, the + in a conversation, Send on a home). With ?home=,
// that home is already picked; with ?to= (a conversation) or ?share= (a link
// sent in one), it goes to that person, onto the link they have.
export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ home?: string; to?: string; share?: string; aud?: string }>;
}) {
  const me = await requireUser();
  const query = await searchParams;
  const visitor = await ensureAccountVisitor(me);
  const homeKey = typeof query.home === "string" && query.home.length <= 100 ? query.home : null;
  const [start, to] = await Promise.all([
    homeKey
      ? sql<{ data: Listing }[]>`
          select data from listings
          where listing_key = ${homeKey} and standard_status = 'Active'
            and (owner_account_id is null or owner_account_id = ${me.id} or coalesce((data->>'Hidden')::boolean, false) = false)`
      : Promise.resolve([]),
    whoFor(me, query),
  ]);
  const agent = me.role === "agent";
  return (
    <main className={pageColumn({ tray: true })}>
      <Link href="/messages" className={cn(backLink, "mb-2")}>
        <ArrowLeft aria-hidden size={18} /> Messages
      </Link>
      <Compose
        mode="page"
        me={{
          name: (agent ? me.full_name.trim() : firstName(me)) || me.email,
          photo: photoUrl(visitor.id, photoVersion(me.photo_data_url)),
          agent,
        }}
        peer={!agent}
        start={start.map((row) => homeLiteOf(row.data))}
        to={to}
        audience={query.aud === "someone" || homeKey ? "someone" : "everyone"}
      />
    </main>
  );
}

// Who it's for, when it opens from a conversation (?to=) or from a link
// sent in one (?share=): them, and the newest link the viewer sent them.
async function whoFor(me: Awaited<ReturnType<typeof requireUser>>, query: { to?: string; share?: string }): Promise<ComposeTo | null> {
  const key = typeof query.to === "string" && query.to.length <= 200 ? query.to : null;
  const shareId = typeof query.share === "string" && /^[0-9a-f-]{36}$/i.test(query.share) ? query.share : null;
  if (!key && !shareId) return null;
  const threads = await getThreads(me);
  const thread = key ? threads.find((t) => t.key === key) : threads.find((t) => shareId && t.shareIds.includes(shareId));
  // (A link several people sent the viewer has no one person to send to.)
  if (!thread || (thread.group && thread.direction === "received")) return null;
  const view = await getThread(me, thread.key);
  const mine = view?.items.filter((item) => item.kind === "homes" && item.mine) ?? [];
  const newest = shareId && mine.some((item) => item.shareId === shareId) ? shareId : (mine.at(-1)?.shareId ?? null);
  return { key: thread.key, name: thread.title, shareId: newest, nameless: thread.people.length === 0 };
}
