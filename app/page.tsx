import { Heart, MessageCircle, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { HomeGrid } from "@/components/home-grid";
import { getHomeCards } from "@/lib/public";

const STEPS = [
  { icon: Send, title: "Pick and send", text: "Choose a few homes and text the link from your own phone." },
  { icon: Heart, title: "They react", text: "No app and no password. Love, maybe or pass, in one tap." },
  { icon: MessageCircle, title: "Talk it through", text: "See what they like and don't like, and bring their partner into the thread." },
];

export default async function Home() {
  await connection();
  const cards = await getHomeCards();
  return (
    <main className="mx-auto max-w-5xl px-5 py-6">
      <nav className="flex items-center justify-between">
        <span className="font-display text-xl font-semibold">BuyBox Social</span>
        <Link href="/login" className="rounded-xl px-4 py-2.5 font-semibold text-brand">
          Agent sign in
        </Link>
      </nav>
      <section className="mt-10 grid items-center gap-8 md:grid-cols-2">
        <div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            Know how your clients really feel about a home.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-stone-700">
            Send a branded link to a few listings. Your clients and their family react and comment,
            as easily as on a social post.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-block rounded-xl bg-brand px-6 py-3.5 font-semibold text-white"
            >
              Send your first home
            </Link>
            <a
              href="#homes"
              className="inline-block rounded-xl border border-stone-300 px-6 py-3.5 font-semibold"
            >
              Browse homes
            </a>
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
      <section className="mt-14 grid gap-6 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon aria-hidden className="text-brand" size={22} />
            <h2 className="mt-2 font-semibold">{title}</h2>
            <p className="mt-1 text-[15px] text-stone-700">{text}</p>
          </div>
        ))}
      </section>
      <HomeGrid cards={cards} />
    </main>
  );
}
