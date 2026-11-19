"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { button, card, field, sectionTitle } from "@/lib/ui";

// One row of a list that can be looked through: `text` is what it's found by
// (a client's name; who a link is for, and its first home), `node` its <li>,
// drawn on the server.
export type FindRow = { id: string; text: string; node: ReactNode };

// Rows under one heading ("Waiting for you"), or with no heading, a plain
// list called `label`. `first`: how many show before "Show all 14".
export type FindGroup = {
  title?: string;
  label?: string;
  tone?: "attention";
  rows: FindRow[];
  first?: number;
};

// The Clients page's groups (and the Links page's list), with one box above
// them once there are too many to look down (`find`): "Find a client". Typing
// in it leaves only the rows that match, and only the headings that still
// have one. Nothing is asked of the server: everyone is on the page already.
export function FindClient({
  label,
  none,
  find,
  groups,
}: {
  label: string;
  // What to say when nothing matches: "No client by that name."
  none: string;
  find: boolean;
  groups: FindGroup[];
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  // The groups shown whole, after "Show all".
  const [whole, setWhole] = useState<ReadonlySet<number>>(new Set());
  const q = find ? typed.trim().toLowerCase() : "";
  const found = groups.map((group) => (q ? group.rows.filter((row) => row.text.toLowerCase().includes(q)) : group.rows));
  const matches = found.reduce((sum, rows) => sum + rows.length, 0);

  return (
    <>
      {find && (
        <div className="mt-6">
          <label htmlFor={id} className="mb-1 block px-1 text-sm font-semibold">
            {label}
          </label>
          <input
            id={id}
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            className={field()}
          />
          <p role="status" className="sr-only">
            {q && (matches === 0 ? none : `${matches} found`)}
          </p>
        </div>
      )}
      {q && matches === 0 && <p className={cn(card, "mt-6 p-6 text-center text-lg text-stone-700")}>{none}</p>}
      {groups.map((group, i) => {
        const rows = found[i];
        if (rows.length === 0) return null;
        // (A search shows every match; "Show all" is for looking down the list.)
        const cut = !q && !whole.has(i) && group.first && rows.length > group.first ? group.first : rows.length;
        const list = (
          <ul
            aria-label={group.title ? undefined : group.label}
            className={cn(card, "divide-y divide-stone-200", group.tone === "attention" && "ring-2 ring-amber-300")}
          >
            {rows.slice(0, cut).map((row) => (
              <Fragment key={row.id}>{row.node}</Fragment>
            ))}
          </ul>
        );
        const all = cut < rows.length && (
          <button
            type="button"
            onClick={() => setWhole(new Set(whole).add(i))}
            className={cn(button({ kind: "secondary", size: "lg", block: true }), "mt-4")}
          >
            Show all {rows.length}
          </button>
        );
        if (!group.title) {
          return (
            <div key={i} className="mt-6">
              {list}
              {all}
            </div>
          );
        }
        const heading = `${id}-group-${i}`;
        return (
          <section key={group.title} aria-labelledby={heading} className="mt-10">
            <h2 id={heading} className={cn(sectionTitle, "flex items-center gap-3")}>
              {group.tone === "attention" && <span aria-hidden className="size-3 rounded-full bg-amber-500" />}
              {group.title}
              <span className="text-xl font-normal text-stone-500">{rows.length}</span>
            </h2>
            <div className="mt-4">
              {list}
              {all}
            </div>
          </section>
        );
      })}
    </>
  );
}
