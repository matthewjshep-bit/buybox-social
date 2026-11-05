"use client";

import { useActionState } from "react";
import { requestSignIn, type LoginState } from "./actions";

export function LoginForm({ devMode, asAgent = false }: { devMode: boolean; asAgent?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestSignIn, {});

  if (state.sent) {
    return (
      <p role="status" className="mt-6 rounded-xl bg-white p-4 ring-1 ring-stone-200">
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
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 min-h-12 w-full rounded-xl bg-brand font-semibold text-white disabled:opacity-60"
      >
        {pending ? "One moment…" : devMode ? "Continue" : "Email me a link"}
      </button>
    </form>
  );
}
