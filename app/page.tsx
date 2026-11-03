import { Heart, MessageCircle, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Feed } from "@/components/feed";
import { HomeGrid } from "@/components/home-grid";
import { getCurrentUser } from "@/lib/auth";
import { getHomeCards } from "@/lib/public";
import { parseFeedSort } from "@/lib/search-options";

const STEPS = [
  { icon: Send, title: "Pick and send", text: "Choose a few homes and text the link from your own phone." },
  { icon: Heart, title: "They react", text: "No app and no password. Like or dislike, and say what stands out, in a tap." },
  { icon: MessageCircle, title: "Talk it through", text: "See what they like and don't like, and bring their partner into the thread." },
];

// Signed in: the feed. Signed out: what BuyBox Social is, and an invitation to join.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const user = await getCurrentUser();
  if (user && !user.role) redirect("/welcome");
  if (user) return <Feed user={user} sort={parseFeedSort((await searchParams).sort)} />;

  const cards = await getHomeCards();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <section className="mt-4 grid items-center gap-8 md:grid-cols-2">
        <div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            See what people really think about a home.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-stone-700">
            Follow homes, react and comment, and see what other buyers are saying. Agents send clients
            a branded link and see how they feel, as easily as on a social post.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-block rounded-xl bg-brand px-6 py-3.5 font-semibold text-white"
            >
              Sign up free
            </Link>
            <Link
              href="/search"
              className="inline-block rounded-xl border border-stone-300 px-6 py-3.5 font-semibold"
            >
              Browse homes
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
      <section aria-labelledby="agents-title" className="mt-14">
        <h2 id="agents-title" className="text-sm font-semibold uppercase tracking-wide text-stone-600">
          For agents
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
      <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-2xl bg-brand p-6 text-white sm:flex-row sm:items-center">
        <div>
          <p className="font-display text-2xl">Get the live feed</p>
          <p className="text-white/90">
            Sign up to see every reaction and conversation as it happens, and join in under your name.
          </p>
        </div>
        <Link
          href="/login"
          className="shrink-0 rounded-xl bg-white px-6 py-3 font-semibold text-stone-900"
        >
          Sign up free
        </Link>
      </div>
      <HomeGrid cards={cards} />
    </main>
  );
}
