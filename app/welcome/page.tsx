import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WelcomeForm } from "./form";

export const metadata = { title: "Welcome · BuyBox Social" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role) redirect("/");
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-display text-4xl">Welcome to BuyBox Social</h1>
      <p className="mt-2 text-stone-700">Two quick questions and you&apos;re in.</p>
      <WelcomeForm fullName={user.full_name} />
    </main>
  );
}
