import { redirect } from "next/navigation";

// The Clients page is Messages now: every home they sent, as conversations.
export default function ClientsPage() {
  redirect("/messages");
}
