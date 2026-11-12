"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";
import { testSignIn, type CodeState } from "./actions";

// For testing, while sign-in emails aren't set up (lib/test-sign-in.ts): tucked
// behind a button under the usual sign-in, any email and the test password.
export function TestSignIn({ asAgent = false, next }: { asAgent?: boolean; next?: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CodeState>({});
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(button({ kind: "ghost", flush: true }), "mt-8 text-sm text-stone-700")}
      >
        Testing? Sign in with the test password
      </button>
    );
  }

  const describedBy = (name: CodeState["field"]) => (state.field === name ? `${id}-error` : undefined);
  return (
    <form
      aria-label="Test sign-in"
      className="mt-8 rounded-2xl border border-dashed border-stone-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await testSignIn({
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            asAgent,
          });
          setState(result);
          if (result.done) {
            router.replace(next ?? (result.done.agent ? "/dashboard" : "/"));
            router.refresh();
          }
        });
      }}
    >
      <p className="text-sm text-stone-700">
        For testing: any email and the site&apos;s test password, no code. A new email gets a new account.
      </p>
      <label htmlFor={`${id}-email`} className="mt-3 block text-sm font-medium">
        Email
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        inputMode="email"
        required
        maxLength={254}
        autoComplete="username"
        autoFocus
        aria-invalid={state.field === "email" || undefined}
        aria-describedby={describedBy("email")}
        className={cn(field(), "mt-1")}
      />
      <label htmlFor={`${id}-password`} className="mt-2.5 block text-sm font-medium">
        Test password
      </label>
      <input
        id={`${id}-password`}
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-invalid={state.field === "password" || undefined}
        aria-describedby={describedBy("password")}
        className={cn(field(), "mt-1")}
      />
      {state.error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn(button({ kind: "primary", size: "lg", block: true }), "mt-4")}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
