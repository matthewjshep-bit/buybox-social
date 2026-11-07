import { ChevronLeft, ChevronRight, Mail, MessageSquareText, Phone, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, EmptyState, type BadgeTone } from "@/components/ui";
import { PAGE_SIZE, type PersonStatus } from "@/lib/admin";
import { cn } from "@/lib/format";
import { button, card, field } from "@/lib/ui";

// The admin pages' building blocks: the same few patterns everywhere, so
// each page reads the same way. (The card is the one every light page uses.)
export { Card } from "@/components/ui";

export function PageTitle({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {children && <p className="mt-1 text-muted">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

// An empty list inside a card, in a line.
export function Empty({ children }: { children: ReactNode }) {
  return <EmptyState compact title={children} />;
}

// A lead in stone (amber means a pass everywhere else), a buyer in blue, an
// agent in ink, as agents are marked across the site.
const STATUS = {
  lead: { label: "Lead", tone: "neutral" },
  buyer: { label: "Buyer", tone: "info" },
  agent: { label: "Agent", tone: "ink" },
} satisfies Record<PersonStatus, { label: string; tone: BadgeTone }>;

export const statusLabel = (status: PersonStatus) => STATUS[status].label;

export function StatusBadge({ status }: { status: PersonStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

export function Stat({ label, value, note, href }: { label: string; value: number; note?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value.toLocaleString("en-US")}</p>
      {note && <p className="mt-0.5 text-xs text-stone-500">{note}</p>}
    </>
  );
  const className = cn(card, "block p-4");
  return href ? (
    <Link href={href} className={cn(className, "hover:ring-stone-400")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// One tap to call, text or email someone.
export function ContactLinks({ name, phone, email }: { name: string; phone: string; email: string }) {
  const dial = phone.replace(/[^\d+]/g, "");
  const link = button({ kind: "secondary" });
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
          className={cn(field(), "pl-10")}
        />
      </label>
      {/* As tall as the box beside it, with no more width than its word needs. */}
      <button type="submit" className={button({ kind: "neutral" })}>
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
          className={button({ kind: item.current ? "neutral" : "secondary" })}
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
  const link = button({ kind: "secondary" });
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <p className="tabular-nums">
        {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </p>
      {total > PAGE_SIZE && (
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={href(page - 1)} className={link}>
              <ChevronLeft aria-hidden size={16} /> Previous
            </Link>
          )}
          {last < total && (
            <Link href={href(page + 1)} className={link}>
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
