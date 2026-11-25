import { X } from "lucide-react";
import Link from "next/link";
import { SendLink } from "@/app/dashboard/shares/[id]/client";
import { sql } from "@/lib/db";
import { appUrl } from "@/lib/format";
import { threadHref } from "@/lib/messages";

// Just after sending homes to someone: their link, ready to text, share or
// copy, right in the conversation, for whoever isn't on Porchcard (anyone
// who is was told). Nobody named: the one link anyone can use. Only ever
// the sender's; gone with Done, or the next time the conversation opens.
export async function LinkReadyCard({ ownerId, threadKey, shareId }: { ownerId: string; threadKey: string; shareId: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return null;
  const [share] = await sql<{ token: string; homes: number; address: string | null; price: number | null }[]>`
    select s.token,
      (select count(*)::int from share_listings sl where sl.share_id = s.id and sl.removed_at is null) as homes,
      (select l.data->>'UnparsedAddress' from share_listings sl join listings l on l.listing_key = sl.listing_key
         where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as address,
      (select (l.data->>'ListPrice')::numeric from share_listings sl join listings l on l.listing_key = sl.listing_key
         where sl.share_id = s.id and sl.removed_at is null order by sl.position limit 1) as price
    from shares s where s.id = ${shareId} and s.agent_id = ${ownerId}`;
  if (!share) return null;
  const people = await sql<{ first_name: string; token: string; on_porchcard: boolean }[]>`
    select first_name, token, account_id is not null as on_porchcard from participants
    where share_id = ${shareId} and token is not null
    order by invited_at nulls last, position nulls last, created_at, first_name`;
  const toSend = people.filter((person) => !person.on_porchcard);
  const told = people.filter((person) => person.on_porchcard).map((person) => person.first_name.trim()).filter(Boolean);
  const home = share.address && share.price ? { address: share.address, price: Number(share.price) } : undefined;
  const title =
    people.length === 0 ? "Your link is ready" : toSend.length === 1 ? `${toSend[0].first_name.trim()}'s link is ready` : toSend.length > 1 ? "Their links are ready" : "Sent";
  return (
    <section aria-label="Links to send" className="shrink-0 border-t border-stone-200 bg-stone-50 px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-body font-semibold">{title}</h2>
        <Link
          href={threadHref(threadKey)}
          aria-label="Done"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-stone-200"
        >
          <X aria-hidden size={20} />
        </Link>
      </div>
      {told.length > 0 && (
        <p className="text-meta text-muted">
          We let {told.join(", ")} know on Porchcard.
        </p>
      )}
      {people.length === 0 && (
        <SendLink bare url={`${appUrl()}/s/${share.token}`} clientName="" count={share.homes} home={home} />
      )}
      {toSend.map((person) => {
        const name = person.first_name.trim();
        return (
          <SendLink
            key={person.token}
            bare
            url={`${appUrl()}/s/${person.token}`}
            clientName={name}
            count={share.homes}
            home={home}
            label={`${name}'s link`}
            who={name}
          />
        );
      })}
    </section>
  );
}
