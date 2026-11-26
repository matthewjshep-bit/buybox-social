import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { sectionTitle } from "@/lib/ui";
import { CopyButton } from "./copy-button";

// The few pieces the API's page (app/developers/page.tsx) is made of: a
// section, an endpoint, the fields a request takes, and a block of code.
// Nothing here runs in the browser but a code block's Copy button
// (copy-button.tsx): it's a page to read, and to copy from.

// A part of the page, with its own address (/developers#links) and its
// heading clear of the top of the screen when it's jumped to.
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-14 scroll-mt-6">
      <h2 id={`${id}-title`} className={sectionTitle}>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 text-body leading-relaxed text-stone-800">{children}</div>
    </section>
  );
}

// A group of endpoints under a section ("Clients", "Links").
export function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="mt-6 scroll-mt-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  );
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

// Each way of asking in a colour of its own, so a long list reads at a
// glance: reading in blue, making in green, changing in amber, removing in red.
const METHOD: Record<Method, string> = {
  GET: "bg-sky-100 text-sky-900",
  POST: "bg-emerald-100 text-emerald-900",
  PATCH: "bg-amber-100 text-amber-950",
  DELETE: "bg-red-100 text-red-900",
};

// Words in code (a field, a header, a path), in a line of words: in the
// code type, on a light grey, broken anywhere rather than pushing the page
// wider than a phone.
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] text-ink wrap-anywhere">
      {children}
    </code>
  );
}

// One endpoint: how it's asked for and where, what it does, then what it
// takes and an example of asking and of the answer (its children, in order).
export function Endpoint({
  id,
  method,
  path,
  children,
}: {
  id: string;
  method: Method;
  path: string;
  children: ReactNode;
}) {
  return (
    <article id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
      <h4 id={`${id}-title`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("rounded-md px-2 py-0.5 font-mono text-xs font-bold", METHOD[method])}>{method}</span>
        <code className="min-w-0 font-mono text-[15px] font-semibold text-ink wrap-anywhere">{path}</code>
      </h4>
      <div className="mt-3 flex min-w-0 flex-col gap-3 text-body leading-relaxed text-stone-800">{children}</div>
    </article>
  );
}

// What a request takes: each field's name, whether it must be sent, and what
// it is. A list rather than a table, so it reads on a phone.
export type Field = { name: string; required?: boolean; children: ReactNode };

export function Fields({ title = "Body", fields }: { title?: string; fields: Field[] }) {
  return (
    <div>
      <p className="text-meta font-semibold uppercase tracking-wide text-muted">{title}</p>
      <dl className="mt-2 flex flex-col divide-y divide-stone-200 rounded-xl ring-1 ring-stone-200">
        {fields.map((field) => (
          <div key={field.name} className="px-3 py-2.5">
            <dt className="flex flex-wrap items-baseline gap-2">
              <code className="font-mono text-[13px] font-semibold text-ink wrap-anywhere">{field.name}</code>
              <span className={cn("text-tiny font-semibold uppercase tracking-wide", field.required ? "text-red-800" : "text-muted")}>
                {field.required ? "Required" : "Optional"}
              </span>
            </dt>
            <dd className="mt-0.5 text-body text-stone-700">{field.children}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// A block of code to copy: on the dark ground, in the code type, its long
// lines scrolling sideways inside the block only (the page never does), and
// reachable by the keyboard so that scroll is too. A Copy button in its top
// corner, its first line kept clear of it.
export function Code({ label, children }: { label?: string; children: string }) {
  return (
    <div className="min-w-0">
      {label && <p className="mb-1.5 text-meta font-semibold uppercase tracking-wide text-muted">{label}</p>}
      <div className="relative">
        <pre
          tabIndex={0}
          className="max-w-full overflow-x-auto rounded-xl bg-stone-900 py-4 pl-4 pr-14 font-mono text-[13px] leading-relaxed text-stone-100"
        >
          <code>{children}</code>
        </pre>
        <CopyButton text={children} name={label ? `Copy ${label}` : "Copy"} />
      </div>
    </div>
  );
}

// An answer, written out as the API gives it.
export function Json({ label = "Answer", value }: { label?: string; value: unknown }) {
  return <Code label={label}>{JSON.stringify(value, null, 2)}</Code>;
}

// The curl for a request: the key from an environment variable (never typed
// into a command someone might paste somewhere), and a JSON body when there
// is one. Bodies here never hold a single quote, so they sit inside one.
export function curl(
  base: string,
  method: Method,
  path: string,
  { body, idempotent = false }: { body?: unknown; idempotent?: string | false } = {},
) {
  const lines = [`curl ${method === "GET" ? "" : `-X ${method} `}"${base}${path}"`, `  -H "Authorization: Bearer $PORCHCARD_KEY"`];
  if (body !== undefined) lines.push(`  -H "Content-Type: application/json"`);
  if (idempotent) lines.push(`  -H "Idempotency-Key: ${idempotent}"`);
  if (body !== undefined) lines.push(`  -d '${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}'`);
  return lines.join(" \\\n");
}
