import { Eye, Flame, Heart, Lock, MessageCircle, Quote, Send } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { addPublicComment, joinPublic, setPublicReaction } from "@/app/homes/actions";
import { ListingFacts } from "@/components/listing-facts";
import { CommentThread, NameGate, ReactionBar } from "@/components/listing-thread";
import { LiveRefresh } from "@/components/live-refresh";
import { PhotoCarousel } from "@/components/photo-carousel";
import { ViewTracker } from "@/components/view-tracker";
import { readDevice } from "@/lib/engagement";
import { activeLabel, timeAgo } from "@/lib/format";
import { isSampleListing, type Listing } from "@/lib/listings/types";
import { getPublicListing, getVisitor, type Buzz, type Totals } from "@/lib/public";

// The public view of one listing, shown in the homepage pop-out and as a full page.
export async function ListingDetail({ listingKey }: { listingKey: string }) {
  const [data, device] = await Promise.all([getPublicListing(listingKey), readDevice()]);
  if (!data) notFound();
  const me = await getVisitor(device);
  const { listing } = data;

  return (
    <NameGate
      actions={{ join: joinPublic, react: setPublicReaction, comment: addPublicComment }}
      myName={me?.first_name ?? null}
      prompt="Your first name shows next to what you post, and anyone visiting can see it. No account or password needed."
    >
      <LiveRefresh />
      <ViewTracker listingKey={listing.ListingKey} />
      <article
        aria-label={listing.UnparsedAddress}
        className="md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      >
        <div>
          <PhotoCarousel media={listing.Media} address={listing.UnparsedAddress} priority />
          <div className="p-5 sm:p-6">
            <ListingFacts listing={listing} />
            <AgentCard listing={listing} />
          </div>
        </div>
        <section
          aria-label="What people think"
          className="border-t border-stone-200 bg-stone-50/70 p-5 sm:p-6 md:border-l md:border-t-0"
        >
          <h3 className="mb-3 pr-12 font-display text-xl">What people think</h3>
          <BuzzStrip buzz={data.buzz} publicTotals={data.publicTotals} privateTotals={data.privateTotals} />
          <div className="mt-4">
            <ReactionBar
              listingKey={listing.ListingKey}
              reactions={data.reactions.map((r) => ({
                name: r.name,
                reaction: r.reaction,
                mine: r.visitorId === me?.id,
              }))}
            />
          </div>
          <BuyerHighlights highlights={data.highlights} />
          <div className="mt-6">
            <CommentThread
              listingKey={listing.ListingKey}
              comments={data.comments.map((c) => ({
                id: c.id,
                name: c.name,
                isAgent: false,
                tag: c.tag,
                body: c.body,
                createdAt: c.createdAt,
                mine: c.visitorId === me?.id,
              }))}
            />
          </div>
          <p className="mt-4 flex gap-1.5 text-xs text-stone-600">
            <Lock aria-hidden size={13} className="mt-px shrink-0" />
            <span>
              Comments here are public. Buyers&apos; private chats with their agents stay private
              unless they choose to share.
              {isSampleListing(listing) && " Sample listing, not a real home for sale."}
            </span>
          </p>
        </section>
      </article>
    </NameGate>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200">
      {icon}
      {children}
    </li>
  );
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Activity from everywhere, private shares included, as counts only. Passes and
// maybes are left out on purpose: tastes differ, and this shouldn't warn anyone off.
function BuzzStrip({
  buzz,
  publicTotals,
  privateTotals,
}: {
  buzz: Buzz;
  publicTotals: Totals;
  privateTotals: Totals;
}) {
  const loves = publicTotals.loves + privateTotals.loves;
  const active = activeLabel(buzz.lastActivityAt);
  const chips = [
    active && (
      <Chip key="active" icon={<Flame aria-hidden size={15} className="text-orange-700" />}>
        {active}
      </Chip>
    ),
    buzz.views > 0 && (
      <Chip key="views" icon={<Eye aria-hidden size={15} />}>
        {count(buzz.views, "view")}
      </Chip>
    ),
    loves > 0 && (
      <Chip key="loves" icon={<Heart aria-hidden size={15} className="text-brand" fill="currentColor" />}>
        {count(loves, "love")}
      </Chip>
    ),
    buzz.sends > 0 && (
      <Chip key="sends" icon={<Send aria-hidden size={15} />}>
        Sent to {count(buzz.sends, "buyer")} by agents
      </Chip>
    ),
    privateTotals.comments > 0 && (
      <Chip key="private" icon={<MessageCircle aria-hidden size={15} />}>
        {count(privateTotals.comments, "comment")} in private chats
      </Chip>
    ),
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Activity" className="flex flex-wrap gap-2">
      {chips}
    </ul>
  );
}

function BuyerHighlights({
  highlights,
}: {
  highlights: { id: string; body: string; createdAt: string }[];
}) {
  if (highlights.length === 0) return null;
  return (
    <section aria-labelledby="highlights-title" className="mt-6">
      <h4 id="highlights-title" className="text-sm font-semibold">
        What buyers love
      </h4>
      <ul className="mt-3 flex flex-col gap-3">
        {highlights.map((h) => (
          <li key={h.id} className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <Quote aria-hidden size={16} className="text-brand" />
            <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed">{h.body}</p>
            <p className="mt-1.5 text-xs text-stone-600">
              A buyer, shared from a private chat · {timeAgo(h.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AgentCard({ listing }: { listing: Listing }) {
  const name = listing.ListAgentFullName;
  if (!name && !listing.ListOfficeName) return null;
  const initials = (name ?? listing.ListOfficeName ?? "")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="mt-6 flex items-center gap-3 rounded-xl border border-stone-200 p-3">
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-white"
      >
        {initials}
      </span>
      <div className="min-w-0 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Listing agent</p>
        {name && <p className="truncate text-base font-semibold">{name}</p>}
        {listing.ListOfficeName && <p className="truncate text-stone-700">{listing.ListOfficeName}</p>}
      </div>
    </div>
  );
}
