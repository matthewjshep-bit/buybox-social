import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { MarkThreadSeen } from "@/components/messages/mark-seen";
import { ThreadBody } from "@/components/messages/thread-body";
import { ThreadHeader } from "@/components/messages/thread-header";
import { firstName, requireUser } from "@/lib/auth";
import { getThread } from "@/lib/messages";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { getPublicIdentity } from "@/lib/public";
import { readDevice } from "@/lib/engagement";

// One conversation: every send and message in it, oldest first, each home
// with what's happened to it, and the box to write in at the foot.
export default async function ThreadPage({ params }: { params: Promise<{ key: string }> }) {
  const [me, { key: raw }, device] = await Promise.all([requireUser(), params, readDevice()]);
  const key = decodeURIComponent(raw);
  const [view, { visitor }] = await Promise.all([getThread(me, key), getPublicIdentity(me, device)]);
  if (!view) notFound();
  const { thread, items } = view;
  const agent = me.role === "agent";
  const sentByMe = items.filter((item) => item.kind === "homes" && item.mine);
  // Sending more homes to them: onto their newest link (an agent's builder
  // adds to it), or the steps for anyone else.
  const compose = agent
    ? sentByMe.length > 0
      ? `/dashboard/new?share=${sentByMe.at(-1)!.shareId}`
      : "/dashboard/new"
    : "/send";
  // The page about the newest link they sent in it: who's on it and their
  // links, what they want, the homes to add or take off.
  const newestSent = sentByMe.at(-1);
  const details = newestSent ? (agent ? `/dashboard/shares/${newestSent.shareId}` : `/send/${newestSent.shareId}`) : null;
  return (
    <>
      <LiveRefresh />
      <MarkThreadSeen threadKey={key} unread={thread.unread} />
      <ThreadHeader thread={thread} details={details} />
      <ThreadBody
        threadKey={key}
        items={items}
        me={{
          name: (agent ? me.full_name.trim() : firstName(me)) || me.email,
          photo: visitor ? photoUrl(visitor.id, photoVersion(me.photo_data_url)) : me.photo_data_url,
          agent,
        }}
        compose={compose}
      />
    </>
  );
}
