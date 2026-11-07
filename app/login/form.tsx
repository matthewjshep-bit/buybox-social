"use client";

import { useActionState } from "react";
import { cn } from "@/lib/format";
import { button, card, field } from "@/lib/ui";
import { requestSignIn, type LoginState } from "./actions";

export function LoginForm({ devMode, asAgent = false }: { devMode: boolean; asAgent?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestSignIn, {});

  if (state.sent) {
    return (
      <p role="status" className={cn(card, "mt-6 p-4")}>
        Check your email for your sign-in link.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6">
      {asAgent && <input type="hidden" name="as" value="agent" />}
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "email-error" : undefined}
        className={cn(field(), "mt-1")}
      />
      {state.error && (
        <p id="email-error" role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn(button({ kind: "primary", size: "lg", block: true }), "mt-4")}
      >
        {pending ? "One moment…" : devMode ? "Continue" : "Email me a link"}
      </button>
    </form>
  );
}
