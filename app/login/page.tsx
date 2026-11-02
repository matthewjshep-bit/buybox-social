import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentAgent } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in · BuyBox Social" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentAgent()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-display text-4xl">Agent sign in</h1>
      <p className="mt-2 text-stone-700">
        {devLoginEnabled
          ? "Local demo mode: enter any email to sign in. No password or email is sent."
          : "We'll email you a sign-in link. No password to remember."}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          That sign-in link didn&apos;t work. Please request a new one, and open it in this browser.
        </p>
      )}
      <LoginForm devMode={devLoginEnabled} />
    </main>
  );
}
