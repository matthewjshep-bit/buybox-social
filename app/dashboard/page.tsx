import { Heart, MessageCircle, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { timeAgo } from "@/lib/format";

type Row = {
  id: string;
  client_name: string;
  created_at: Date;
  addresses: string[];
  photo: string | null;
  reaction_count: number;
  comment_count: number;
};

// "1 home · 96 Fernhollow Ln", "3 homes · …": how many are on the link, then where.
const homesLine = (addresses: string[]) =>
  addresses.length === 0
    ? "No homes on it right now"
    : [`${addresses.length} ${addresses.length === 1 ? "home" : "homes"}`, ...addresses].join(" · ");

export default async function DashboardPage() {
  const agent = await requireAgent();
  if (!agent.full_name) redirect("/dashboard/profile");

  const shares = await sql<Row[]>`
    select s.id, s.client_name, s.created_at,
      (select coalesce(array_agg(l.data->>'UnparsedAddress' order by sl.position), '{}')
         from share_listings sl join listings l on l.listing_key = sl.listing_key
         where sl.share_id = s.id and sl.removed_at is null) as addresses,
      (select l.data->'Media'->0->>'MediaURL'
         from share_listings sl join listings l on l.listing_key = sl.listing_key
         where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as photo,
      (select count(*)::int from reactions r where r.share_id = s.id) as reaction_count,
      (select count(*)::int from comments c where c.share_id = s.id and c.agent_id is null) as comment_count
    from shares s
    where s.agent_id = ${agent.id}
    order by s.created_at desc`;

  return (
    <>
      <LiveRefresh />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Your shares</h1>
        <Link
          href="/dashboard/new"
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 font-semibold text-white"
        >
          <Plus aria-hidden size={18} /> New share
        </Link>
      </div>

      {shares.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          <h2 className="font-display text-xl">Send your first home</h2>
          <p className="mt-1 text-stone-700">
            Pick up to three homes, add a note, and text the link to your client.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {shares.map((share) => (
            <li key={share.id}>
              <Link
                href={`/dashboard/shares/${share.id}`}
                className="flex items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-stone-200 hover:ring-stone-400"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-stone-200">
                  {share.photo && (
                    <Image src={share.photo} alt="" fill sizes="80px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{share.client_name || "Unnamed client"}</p>
                  <p className="truncate text-sm text-stone-700">{homesLine(share.addresses)}</p>
                  <p className="mt-1 flex items-center gap-3 text-sm text-stone-700">
                    <span className="flex items-center gap-1">
                      <Heart aria-hidden size={14} /> {share.reaction_count}
                      <span className="sr-only">reactions</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle aria-hidden size={14} /> {share.comment_count}
                      <span className="sr-only">comments</span>
                    </span>
                    <span className="ml-auto text-xs text-stone-600">
                      {timeAgo(share.created_at.toISOString())}
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
