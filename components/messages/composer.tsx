"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendMessage } from "@/app/messages/actions";
import { InlineBox } from "@/components/home/inline-box";

// What a message answers, when it's about one home: shown above the box
// ("Replying about 1204 Quillan", with a way to let go of it).
export type ReplyAbout = { shareId: string; listingKey: string; address: string };

// At the foot of a conversation: the box to write in (Enter sends), and a
// round + to send more homes. A message goes to the conversation, or, after
// Reply on a home, to that home's thread on the link.
export function Composer({
  threadKey,
  me,
  about,
  onClearAbout,
  compose,
}: {
  threadKey: string;
  me: { name: string; photo: string | null; agent: boolean };
  about: ReplyAbout | null;
  onClearAbout: () => void;
  // Where sending more homes starts.
  compose: string;
}) {
  const router = useRouter();
  return (
    <div className="shrink-0 border-t border-stone-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
      {about && (
        <p className="flex min-h-9 items-center justify-between gap-2 px-1 text-meta text-muted">
          <span className="min-w-0 truncate">
            Replying about <span className="font-semibold text-ink">{about.address.split(",")[0]}</span>
          </span>
          <button
            type="button"
            onClick={onClearAbout}
            aria-label="Reply to the conversation instead"
            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-stone-100 hit-44"
          >
            <X aria-hidden size={16} />
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <InlineBox
          key={about ? `${about.shareId}:${about.listingKey}` : "all"}
          me={me}
          agent={me.agent}
          // (A conversation's own box: your face beside it says nothing.)
          face={false}
          // (What it answers is said just above, once.)
          placeholder="Message…"
          label={about ? `Reply about ${about.address}` : "Message"}
          sendLabel={["Send", "Sending"]}
          autoFocus={Boolean(about)}
          className="min-w-0 flex-1"
          onSend={async (text) => {
            const result = await sendMessage(threadKey, text, about ? { shareId: about.shareId, listingKey: about.listingKey } : null);
            if (!result.ok) return result.error;
            onClearAbout();
            router.refresh();
            return null;
          }}
        />
        <Link
          href={compose}
          aria-label="Send homes"
          title="Send homes"
          className="mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink hover:bg-stone-200"
        >
          <Plus aria-hidden size={22} />
        </Link>
      </div>
    </div>
  );
}
