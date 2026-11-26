import { Send } from "lucide-react";
import Link from "next/link";
import { ThreadPane } from "@/components/messages/thread-pane";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { getThread, getThreads } from "@/lib/messages";
import { button } from "@/lib/ui";

// Messages with nothing picked: on a wide screen the newest conversation is
// open beside the list, as a phone's messages app opens on the last one
// (so the page is never blank); on a phone the list is the whole page
// (MessagesShell hides this). Nothing to show yet: what this is for, and the
// way to send homes, said once, in the middle of the pane (the list keeps
// only its title then, on a wide screen; a phone has the list's own).
export default async function MessagesPage() {
  const me = await requireUser();
  const [newest] = await getThreads(me);
  const view = newest ? await getThread(me, newest.key) : null;
  if (view) return <ThreadPane me={me} view={view} byDefault />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
      <span aria-hidden className="mb-4 flex size-16 items-center justify-center rounded-full bg-stone-100 text-stone-500">
        <Send size={28} />
      </span>
      <p className="text-balance text-lead font-semibold text-ink">No messages yet</p>
      <p className="mt-1 max-w-sm text-balance text-body text-stone-700">Homes you send, and homes sent to you, show up here.</p>
      <Link href="/send?aud=someone" className={cn("mt-5", button({ kind: "primary", size: "lg" }))}>
        Send homes
      </Link>
    </div>
  );
}
