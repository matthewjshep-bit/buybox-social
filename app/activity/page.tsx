import { Bell, MessageCircle, Reply, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActivity, type ActivityItem } from "@/lib/activity";
import { readDevice } from "@/lib/engagement";
import { cn, timeAgo } from "@/lib/format";
import { getPublicIdentity } from "@/lib/public";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "Activity · BuyBox Social" };

const ICONS = { reply: Reply, comment_like: ThumbsUp, comment: MessageCircle };

function describe(item: ActivityItem) {
  if (item.kind === "reply") return <>replied to your comment on {item.address}</>;
  if (item.kind === "comment_like") return <>liked your comment on {item.address}</>;
  return <>commented on {item.address}, a home you liked</>;
}

export default async function ActivityPage() {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account, device);
  const items = visitor ? await getActivity(visitor.id) : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-3xl">Activity</h1>
      {visitor && <MarkSeen />}
      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
          <Bell aria-hidden size={28} className="mx-auto text-stone-500" />
          <p className="mt-2 font-semibold">Nothing yet</p>
          <p className="mt-1 text-stone-700">
            When someone replies to you, likes your comment, or talks about a home you liked, it shows up here.
          </p>
          <Link href="/" className="mt-4 inline-block font-semibold text-brand">
            React to today&apos;s picks
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={item.id}>
                <Link
                  href={`/homes/${encodeURIComponent(item.listingKey)}`}
                  scroll={false}
                  className={cn(
                    "flex gap-3 rounded-2xl p-4 ring-1 transition-colors",
                    item.unread ? "bg-white ring-brand/40" : "bg-white/60 ring-stone-200 hover:bg-white",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">
                      <span className="font-semibold">{item.who}</span> {describe(item)}
                      {item.unread && <span className="sr-only"> (new)</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-stone-700">&ldquo;{item.body}&rdquo;</span>
                    <time dateTime={item.at} className="mt-0.5 block text-xs text-stone-600">
                      {timeAgo(item.at)}
                    </time>
                  </span>
                  {item.unread && <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
