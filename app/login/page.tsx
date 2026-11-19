import Link from "next/link";
import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentUser, sitePath } from "@/lib/auth";
import { testSignInEnabled } from "@/lib/test-sign-in";
import { LoginForm } from "./form";
import { NameStep } from "./name-step";
import { TestSignIn } from "./test-sign-in";

export const metadata = { title: "Sign in or sign up · Porchcard" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; as?: string; next?: string }>;
}) {
  const { error, as, next: asked } = await searchParams;
  // From "For agents", or a button for agents on the home page: signing up
  // (or in) as an agent.
  const agent = as === "agent";
  // Back to the page they came from, once signed in (only a page of this site).
  const next = sitePath(asked) ?? undefined;
  const user = await getCurrentUser();
  // Signed in with only an email, so no first name yet (a buyer: an agent
  // gives their full name with their brand): asked here, the one thing on
  // the page, before going on. Whichever way they just signed in (the code,
  // the emailed link, the test password), this is where it leaves them.
  if (user && !agent && user.role !== "agent" && !user.full_name.trim()) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl">What&apos;s your first name?</h1>
        <p className="mt-2 text-stone-700">It shows beside your likes and comments.</p>
        {/* (Never back to this page: Skip would only come round again.) */}
        <NameStep next={next && !next.startsWith("/login") ? next : "/"} />
      </main>
    );
  }
  if (user) redirect(next ?? (agent ? "/for-agents" : "/"));
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl">{agent ? "Start free as an agent" : "Sign in or sign up"}</h1>
      <p className="mt-2 text-stone-700">
        {devLoginEnabled
          ? "Local demo mode: no email is sent, and the code shows on the page."
          : "We'll email you a code."}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          That sign-in link didn&apos;t work. Enter your email for a new code.
        </p>
      )}
      <LoginForm asAgent={agent} next={next} />
      {/* The way in decides the kind of account, so each form has a way to
          the other: someone here by mistake isn't made an agent (or a buyer)
          for want of one. Quiet, under the one thing to do. */}
      <Link
        href={agent ? (next ? `/login?next=${encodeURIComponent(next)}` : "/login") : "/login?as=agent"}
        className="mt-4 flex min-h-11 w-fit items-center text-sm font-semibold text-stone-700 underline underline-offset-4 hover:text-ink"
      >
        {agent ? "Not an agent?" : "I'm an agent"}
      </Link>
      {testSignInEnabled && <TestSignIn asAgent={agent} next={next} />}
    </main>
  );
}
