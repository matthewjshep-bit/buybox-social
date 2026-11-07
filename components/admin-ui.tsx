import { ChevronLeft, ChevronRight, Mail, MessageSquareText, Phone, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_SIZE, type PersonStatus } from "@/lib/admin";
import { cn } from "@/lib/format";

// The admin pages' building blocks: the same few patterns everywhere, so
// each page reads the same way.

export function PageTitle({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {children && <p className="mt-1 text-stone-600">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-stone-500">{children}</p>;
}

const STATUS = {
  lead: { label: "Lead", className: "bg-amber-100 text-amber-900" },
  buyer: { label: "Buyer", className: "bg-sky-100 text-sky-900" },
  agent: { label: "Agent", className: "bg-ink text-white" },
} satisfies Record<PersonStatus, { label: string; className: string }>;

export const statusLabel = (status: PersonStatus) => STATUS[status].label;

export function StatusBadge({ status }: { status: PersonStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[status].className)}>
      {STATUS[status].label}
    </span>
  );
}

export function Stat({ label, value, note, href }: { label: string; value: number; note?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value.toLocaleString("en-US")}</p>
      {note && <p className="mt-0.5 text-xs text-stone-500">{note}</p>}
    </>
  );
  const className = "block rounded-2xl bg-white p-4 ring-1 ring-stone-200";
  return href ? (
    <Link href={href} className={cn(className, "hover:ring-stone-400")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700"
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

// One tap to call, text or email someone.
export function ContactLinks({ name, phone, email, compact = false }: { name: string; phone: string; email: string; compact?: boolean }) {
  const dial = phone.replace(/[^\d+]/g, "");
  const link = cn(
    "flex min-h-11 items-center gap-1.5 rounded-full font-semibold ring-1 ring-stone-300 hover:bg-stone-100",
    compact ? "px-3 text-xs" : "px-3.5 text-sm",
  );
  const who = name || email;
  return (
    <div className="flex flex-wrap gap-2">
      {dial && (
        <>
          <a href={`tel:${dial}`} className={link} aria-label={`Call ${who}`}>
            <Phone aria-hidden size={14} /> Call
          </a>
          <a href={`sms:${dial}`} className={link} aria-label={`Text ${who}`}>
            <MessageSquareText aria-hidden size={14} /> Text
          </a>
        </>
      )}
      <a href={`mailto:${email}`} className={link} aria-label={`Email ${who}`}>
        <Mail aria-hidden size={14} /> Email
      </a>
    </div>
  );
}

// A search box that keeps the page's other choices (filters, sort).
export function SearchBox({ q, placeholder, keep }: { q?: string; placeholder: string; keep: Record<string, string | undefined> }) {
  return (
    <form role="search" className="flex gap-2">
      {Object.entries(keep).map(([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />)}
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <Search aria-hidden size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-10 pr-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </label>
      <button type="submit" className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">
        Search
      </button>
    </form>
  );
}

// A row of choices that are links: the filters and sorts.
export function Chips({ label, items }: { label: string; items: { href: string; label: string; current: boolean; count?: number }[] }) {
  return (
    <nav aria-label={label} className="-mx-1 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium",
            item.current ? "bg-ink text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:ring-stone-500",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={cn("tabular-nums", item.current ? "text-white/70" : "text-stone-500")}>{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

// "1–50 of 312", and the way to the next fifty.
export function Pager({ page, total, href }: { page: number; total: number; href: (page: number) => string }) {
  if (total === 0) return null;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);
  const button = "flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold ring-1 ring-stone-300 hover:bg-white";
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-600">
      <p className="tabular-nums">
        {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </p>
      {total > PAGE_SIZE && (
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={href(page - 1)} className={button}>
              <ChevronLeft aria-hidden size={16} /> Previous
            </Link>
          )}
          {last < total && (
            <Link href={href(page + 1)} className={button}>
              Next <ChevronRight aria-hidden size={16} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// Builds a link to the same page with some of its choices changed.
export function hrefWith(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export const pageParam = (value: string | undefined) => Math.max(1, Math.floor(Number(value) || 1));

export const when = (date: Date | null) =>
  date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
