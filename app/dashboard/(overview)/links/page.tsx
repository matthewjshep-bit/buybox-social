import { redirect } from "next/navigation";

// Links are conversations in Messages now (a link to several people, or to
// nobody yet, is one of its own there).
export default function LinksPage() {
  redirect("/messages");
}
