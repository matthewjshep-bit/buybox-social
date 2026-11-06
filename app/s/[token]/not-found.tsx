import { Home } from "lucide-react";
import Link from "next/link";

// A link that was never sent, or has been taken back. Agents' links have no
// site header, so this one offers the way home itself.
export default function ShareNotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="font-display text-3xl">This link isn&apos;t available</h1>
      <p className="mt-2 text-stone-700">Ask whoever sent it to share a new one.</p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white"
      >
        <Home aria-hidden size={18} />
        Go to BuyBox Social
      </Link>
    </main>
  );
}
