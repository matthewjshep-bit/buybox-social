"use client";

import { useRouter } from "next/navigation";
import { CodeSignIn } from "@/components/code-sign-in";

// Signing in (or up) on its own page: an email, then the code. Then back to
// where they came from, or home (an agent, to their dashboard).
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
        onDone={({ agent }) => {
          router.replace(next ?? (agent ? "/dashboard" : "/"));
          router.refresh();
        }}
      />
    </div>
  );
}
