import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentUser } from "@/lib/auth";
import { safeNext } from "./actions";
import { testSignInEnabled } from "@/lib/test-sign-in";
import { LoginForm } from "./form";
import { TestSignIn } from "./test-sign-in";

export const metadata = { title: "Sign in or sign up · Porchcard" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; as?: string; next?: string }>;
}) {
  const { error, as, next: asked } = await searchParams;
  // From "For agents": signing up (or in) as an agent.
  const agent = as === "agent";
  // Back to the page they came from, once signed in (only a page of this site).
  const next = (await safeNext(asked)) ?? undefined;
  if (await getCurrentUser()) redirect(next ?? (agent ? "/for-agents" : "/"));
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl">{agent ? "Start free as an agent" : "Sign in or sign up"}</h1>
      <p className="mt-2 text-stone-700">
        {agent ? "Send clients homes and see what they think of each one." : "For home buyers and agents."}{" "}
        {devLoginEnabled
          ? "Local demo mode: no email is sent, and the code shows on the page."
          : "We'll email you a code. No password to remember."}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          That sign-in link didn&apos;t work. Enter your email for a new code.
        </p>
      )}
      <LoginForm asAgent={agent} next={next} />
      {testSignInEnabled && <TestSignIn asAgent={agent} next={next} />}
    </main>
  );
}
