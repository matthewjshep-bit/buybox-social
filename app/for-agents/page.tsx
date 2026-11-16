import { Heart, MessageCircle, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { becomeAgent } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/auth";
import { button } from "@/lib/ui";

export const metadata = {
  title: "For agents · Porchcard",
  description: "Send clients a few homes as a link. See what they like and pass on, in their own words.",
};

const STEPS = [
  { icon: Send, title: "Pick and send", text: "Choose a few homes and text the link from your own phone." },
  {
    icon: Heart,
    title: "They like or pass",
    text: "One tap per home. No app, no password.",
  },
  {
    icon: MessageCircle,
    title: "Talk it through",
    text: "See what they like, and add their partner.",
  },
];

export default async function ForAgentsPage() {
  const user = await getCurrentUser();
  const start = button({ kind: "primary", size: "lg" });
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">For agents</p>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
            Know what your clients think of every home.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-stone-700">
            Send a few homes as one link. See what each client likes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!user ? (
              <Link href="/login?as=agent" className={start}>
                Start free
              </Link>
            ) : user.role === "agent" ? (
              <Link href="/dashboard" className={start}>
                Go to Clients
              </Link>
            ) : (
              // Signed in as a buyer: one tap to an agent's account.
              <form action={becomeAgent}>
                <button type="submit" className={start}>
                  Set up my agent account
                </button>
              </form>
            )}
            <Link href="/reel" className={button({ kind: "secondary", size: "lg" })}>
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
        <h2 id="how-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
          How it works
        </h2>
        <div className="mt-3 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon aria-hidden className="text-brand" size={22} />
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-body text-stone-700">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
