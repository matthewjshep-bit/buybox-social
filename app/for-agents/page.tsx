import Link from "next/link";
import { becomeAgent } from "@/app/login/actions";
import { AGENT_HEADLINE, AgentFeatures, AgentPicture, Eyebrow } from "@/components/marketing-home";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { button, link } from "@/lib/ui";

export const metadata = {
  title: "For agents · Porchcard",
  description: "Send clients a few homes as a link. See what they like and pass on, in their own words.",
};

// The page for agents: the home page's pitch to them (the same headline, the
// same three lines, the same picture: components/marketing-home.tsx), and one
// thing to do, which depends on who's looking. Signed out: Start free, or see
// homes first. An agent: their dashboard. A buyer: their account becomes an
// agent's, said in so many words, with what changes and what stays.
export default async function ForAgentsPage() {
  const user = await getCurrentUser();
  const start = button({ kind: "primary", size: "lg" });
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 md:py-16">
      <section aria-labelledby="agents-title" className="grid items-center gap-14 md:grid-cols-2 md:gap-16">
        <div>
          <Eyebrow>For agents &amp; brokers</Eyebrow>
          <h1 id="agents-title" className="mt-3 text-balance font-display text-4xl leading-tight sm:text-5xl">
            {AGENT_HEADLINE}
          </h1>
          <AgentFeatures />
          <div className="mt-8 flex flex-wrap gap-3">
            {!user ? (
              <>
                <Link href="/login?as=agent" className={start}>
                  Start free
                </Link>
                {/* The homes themselves, for anyone who'd rather look first.
                    (Signed in, Browse is in the bar already.) */}
                <Link href="/browse" className={button({ kind: "secondary", size: "lg" })}>
                  See homes
                </Link>
              </>
            ) : user.role === "agent" ? (
              <Link href="/dashboard" className={start}>
                Go to your clients
              </Link>
            ) : (
              // Signed in as a buyer: one tap changes the account itself, and
              // there's no button back, so it says what it does and what it brings.
              <form action={becomeAgent}>
                <button type="submit" aria-describedby="become-agent-note" className={start}>
                  Make my account an agent&apos;s
                </button>
                <p id="become-agent-note" className="mt-3 max-w-sm text-body leading-relaxed text-stone-700">
                  You&apos;ll get a Clients page for the people you send homes to. Your likes and follows stay.
                </p>
              </form>
            )}
          </div>
          {/* For the agent whose CRM, Zapier or Make should do the sending:
              one quiet line, under the one thing the page asks. */}
          <p className="mt-6 text-meta text-muted">
            Use GoHighLevel, Zapier or Make?{" "}
            <Link href="/developers" className={cn(link, "hit-44")}>
              Connect them with the Porchcard API
            </Link>
          </p>
        </div>
        <AgentPicture />
      </section>
    </main>
  );
}
