"use client";

import { Briefcase, Home } from "lucide-react";
import { useActionState } from "react";
import { completeSignup, type WelcomeState } from "./actions";

const ROLES = [
  {
    value: "buyer",
    icon: Home,
    title: "I'm buying a home",
    text: "Follow homes, react and see what other buyers think.",
  },
  {
    value: "agent",
    icon: Briefcase,
    title: "I send homes to clients",
    text: "An agent, team or company. Send homes and see what each person likes about them.",
  },
] as const;

export function WelcomeForm({ fullName }: { fullName: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(completeSignup, {});
  return (
    <form action={action} className="mt-8 flex flex-col gap-6">
      <fieldset>
        <legend className="text-sm font-medium">Which describes you?</legend>
        <div className="mt-2 flex flex-col gap-3">
          {ROLES.map(({ value, icon: Icon, title, text }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200 has-[:checked]:ring-2 has-[:checked]:ring-brand"
            >
              <input type="radio" name="role" value={value} required className="mt-1 size-5 accent-[var(--brand)]" />
              <Icon aria-hidden size={22} className="mt-0.5 shrink-0 text-brand" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-stone-700">{text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="fullName" className="text-sm font-medium">
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={fullName}
          className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-sm text-stone-600">
          Your first name shows next to public likes and comments.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-60"
      >
        {pending ? "One moment…" : "Continue"}
      </button>
    </form>
  );
}
