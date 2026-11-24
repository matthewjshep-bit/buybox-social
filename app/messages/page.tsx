import { MessageCircle } from "lucide-react";

// Messages with nothing open: on a wide screen, the right-hand side says to
// pick one; on a phone the list is the whole page (MessagesShell hides this).
export default function MessagesPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-stone-600">
      <MessageCircle aria-hidden size={32} className="mb-2 text-stone-400" />
      <p className="text-body">Pick a conversation.</p>
    </div>
  );
}
