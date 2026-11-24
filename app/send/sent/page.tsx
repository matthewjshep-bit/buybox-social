import { redirect } from "next/navigation";

// The homes someone sent are conversations in Messages now.
export default function SentPage() {
  redirect("/messages");
}
