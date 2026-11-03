import { Heart, MessageCircle, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "For agents · BuyBox Social",
  description: "Send clients a few homes as a link. See what they like and pass on, in their own words.",
};

const STEPS = [
  { icon: Send, title: "Pick and send", text: "Choose a few homes and text the link from your own phone." },
  {
    icon: Heart,
    title: "They like or pass",
    text: "No app and no password. One tap per home, and they can say what stood out.",
  },
  {
    icon: MessageCircle,
    title: "Talk it through",
    text: "See what they like and pass on across every home you send, and bring their partner into the thread.",
  },
];

export default function ForAgentsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">For agents</p>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
            Know what your clients think of every home.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-stone-700">
            Send a branded link with a few homes. Your client likes or passes in a tap, says what stood
            out, and you see it all in one place, across every home you&apos;ve sent.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="inline-block rounded-xl bg-brand px-6 py-3.5 font-semibold text-white">
              Start free
            </Link>
            <Link href="/" className="inline-block rounded-xl border border-stone-300 bg-white px-6 py-3.5 font-semibold">
              See it as a buyer
            </Link>
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-lg">
          <Image
            src="/sample/ravenna-1.jpg"
            alt="White Craftsman home with a covered front porch"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 480px"
            className="object-cover"
          />
        </div>
      </section>
      <section aria-labelledby="how-title" className="mt-14">
        <h2 id="how-title" className="text-sm font-semibold uppercase tracking-wide text-stone-600">
          How it works
        </h2>
        <div className="mt-3 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon aria-hidden className="text-brand" size={22} />
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-[15px] text-stone-700">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
