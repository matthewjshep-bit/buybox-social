import { LiveRefresh } from "@/components/live-refresh";
import { LinkReadyCard } from "@/components/messages/link-ready-card";
import { MarkThreadSeen } from "@/components/messages/mark-seen";
import { ThreadBody } from "@/components/messages/thread-body";
import { ThreadHeader } from "@/components/messages/thread-header";
import { firstName, type Account } from "@/lib/auth";
import type { ThreadView } from "@/lib/messages";
import { photoUrl, photoVersion } from "@/lib/person-photo";
import { getPublicIdentity } from "@/lib/public";
import { readDevice } from "@/lib/engagement";

// One conversation, whole: its head, every send and word in it oldest
// first, and the box to write in at the foot. The page for a conversation,
// and what Messages opens on when nothing's been picked yet (the newest).
export async function ThreadPane({
  me,
  view,
  // The one Messages opens on by itself, beside the list: seen only once
  // it's on the screen (not while a phone shows the list instead), and its
  // title under the page's own ("Messages").
  byDefault = false,
  // Homes just sent in it: the links to hand out, above the box.
  sent = null,
}: {
  me: Account;
  view: ThreadView;
  byDefault?: boolean;
  sent?: string | null;
}) {
  const { thread, items } = view;
  const { visitor } = await getPublicIdentity(me, await readDevice());
  const agent = me.role === "agent";
  const sentByMe = items.filter((item) => item.kind === "homes" && item.mine);
  // Sending them more: the box, with them already named (onto their newest link).
  const compose = `/send?to=${encodeURIComponent(thread.key)}`;
  // The page about the newest link they sent in it: who's on it and their
  // links, what they want, the homes to add or take off.
  const newestSent = sentByMe.at(-1);
  const details = newestSent ? (agent ? `/dashboard/shares/${newestSent.shareId}` : `/send/${newestSent.shareId}`) : null;
  return (
    <>
      <LiveRefresh />
      {/* Keyed by the conversation: were a newer one to take its place (the
          list refreshes on its own), the box starts over rather than keep a
          half-written word for the wrong person. */}
      <MarkThreadSeen key={`seen:${thread.key}`} threadKey={thread.key} unread={thread.unread} whenWide={byDefault} />
      <ThreadHeader thread={thread} details={details} level={byDefault ? 2 : 1} />
      <ThreadBody
        key={`body:${thread.key}`}
        threadKey={thread.key}
        items={items}
        group={thread.group}
        me={{
          name: (agent ? me.full_name.trim() : firstName(me)) || me.email,
          photo: visitor ? photoUrl(visitor.id, photoVersion(me.photo_data_url)) : me.photo_data_url,
          agent,
        }}
        compose={compose}
        notice={sent ? <LinkReadyCard ownerId={me.id} threadKey={thread.key} shareId={sent} /> : null}
      />
    </>
  );
}
