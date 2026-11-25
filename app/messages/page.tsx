import { MessageCircle } from "lucide-react";
import { ThreadPane } from "@/components/messages/thread-pane";
import { requireUser } from "@/lib/auth";
import { getThread, getThreads } from "@/lib/messages";

// Messages with nothing picked: on a wide screen the newest conversation is
// open beside the list, as a phone's messages app opens on the last one
// (so the page is never blank); on a phone the list is the whole page
// (MessagesShell hides this). Nothing to show yet: a word on what this is.
export default async function MessagesPage() {
  const me = await requireUser();
  const [newest] = await getThreads(me);
  const view = newest ? await getThread(me, newest.key) : null;
  if (view) return <ThreadPane me={me} view={view} byDefault />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-stone-600">
      <MessageCircle aria-hidden size={32} className="mb-2 text-stone-400" />
      <p className="text-body">Homes you send, and homes sent to you, show up here.</p>
    </div>
  );
}
