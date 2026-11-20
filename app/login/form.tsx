"use client";

import { useRouter } from "next/navigation";
import { CodeSignIn } from "@/components/code-sign-in";

// Signing in (or up) on its own page: an email, then the code. Then back to
// where they came from, or home (an agent, to their dashboard). Someone new
// here, or a buyer with no first name yet, goes through /welcome first.
export function LoginForm({ asAgent = false, next }: { asAgent?: boolean; next?: string }) {
  const router = useRouter();
  return (
    <div className="mt-6">
      <CodeSignIn
        asAgent={asAgent}
        // (Where the email's link lands too.)
        next={next ?? (asAgent ? "/dashboard" : "/")}
        autoFocus
        label={asAgent ? "Start free" : "Sign in"}
        onDone={({ agent, needsName, welcome }) => {
          // New here: what they are, and the rest, a step at a time.
          if (welcome || needsName) {
            const asked = new URLSearchParams({ ...(next && { next }), ...(asAgent && { as: "agent" }) });
            router.replace(`/welcome${asked.size ? `?${asked}` : ""}`);
          } else router.replace(next ?? (agent ? "/dashboard" : "/"));
          router.refresh();
        }}
      />
    </div>
  );
}
