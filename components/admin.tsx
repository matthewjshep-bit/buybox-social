"use client";

import { Building2, LayoutGrid, MessageSquare, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useId, useState, useTransition } from "react";
import type { AdminFormState, PersonFormState } from "@/app/admin/actions";
import { cn } from "@/lib/format";

// The admin's interactive pieces. The pages themselves are server-rendered.

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/homes", label: "Homes", icon: Building2 },
  { href: "/admin/comments", label: "Comments", icon: MessageSquare },
];

// Only the owner sees who the admins are, and changes them.
const OWNER_NAV = [{ href: "/admin/team", label: "Admins", icon: ShieldCheck }];

// Down the side on a wide screen; a row of tabs across the top on a phone.
export function AdminNav({ superAdmin }: { superAdmin: boolean }) {
  const pathname = usePathname();
  const items = superAdmin ? [...NAV, ...OWNER_NAV] : NAV;
  return (
    <nav aria-label="Admin" className="shrink-0 md:w-48">
      <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-stone-500 md:block">Admin</p>
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-col md:px-0">
        {items.map(({ href, label, icon: Icon }) => {
          const current = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-medium",
                  current ? "bg-ink text-white" : "text-stone-700 hover:bg-stone-200/70",
                )}
              >
                <Icon aria-hidden size={17} className="max-sm:hidden" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// A button that asks once more before it does something that can't be undone.
export function ConfirmAction({
  action,
  label,
  confirm,
  className,
}: {
  action: () => Promise<void>;
  label: string;
  // What the second button says: "Delete comment".
  confirm: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={cn(
          "min-h-9 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50",
          className,
        )}
      >
        {label}
      </button>
    );
  }
  return (
    <span className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        autoFocus
        disabled={pending}
        onClick={() => start(async () => await action())}
        className="min-h-9 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "One moment…" : confirm}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsking(false)}
        className="min-h-9 rounded-lg px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
      >
        Cancel
      </button>
    </span>
  );
}

const input =
  "mt-1 h-11 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

// Fix someone's name or number, or make a buyer an agent (or back).
export function PersonForm({
  action,
  name,
  phone,
  role,
}: {
  action: (state: PersonFormState, form: FormData) => Promise<PersonFormState>;
  name: string;
  phone: string;
  // Undefined for a lead who never signed in: there's no account to give a role.
  role?: "buyer" | "agent" | null;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input id={`${id}-name`} name="name" required maxLength={80} defaultValue={name} className={input} />
      </div>
      <div>
        <label htmlFor={`${id}-phone`} className="text-sm font-medium">
          Phone
        </label>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          maxLength={30}
          defaultValue={phone}
          className={input}
        />
      </div>
      {role !== undefined && (
        <div>
          <label htmlFor={`${id}-role`} className="text-sm font-medium">
            Account type
          </label>
          <select id={`${id}-role`} name="role" defaultValue={role ?? ""} className={input}>
            {role === null && <option value="">Hasn&apos;t chosen yet</option>}
            <option value="buyer">Buyer</option>
            <option value="agent">Agent</option>
          </select>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.saved && !pending && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            Saved
          </p>
        )}
      </div>
    </form>
  );
}

// The owner gives someone admin access by their email. It applies whenever
// they sign in with it, whether or not they have an account yet.
export function AddAdminForm({ action }: { action: (state: AdminFormState, form: FormData) => Promise<AdminFormState> }) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <label htmlFor={`${id}-email`} className="text-sm font-medium">
        Their email
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={cn(input, "mt-0 min-w-0 flex-1 basis-60")}
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add admin"}
        </button>
      </div>
      {state.error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.added && !pending && (
        <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
          {state.added} is now an admin.
        </p>
      )}
    </form>
  );
}
