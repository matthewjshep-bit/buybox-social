import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in or sign up · Porchcard" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; as?: string }>;
}) {
  const { error, as } = await searchParams;
  // From "For agents": signing up (or in) as an agent.
  const agent = as === "agent";
  if (await getCurrentUser()) redirect(agent ? "/for-agents" : "/");
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl">{agent ? "Start free as an agent" : "Sign in or sign up"}</h1>
      <p className="mt-2 text-stone-700">
        {agent ? "Send clients homes and see what they think of each one." : "For home buyers and agents."}{" "}
        {devLoginEnabled
          ? "Local demo mode: enter any email to sign in. No password or email is sent."
          : "We'll email you a link. No password to remember."}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          That sign-in link didn&apos;t work. Please request a new one, and open it in this browser.
        </p>
      )}
      <LoginForm devMode={devLoginEnabled} asAgent={agent} />
    </main>
  );
}
