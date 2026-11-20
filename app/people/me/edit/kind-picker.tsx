"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseKind } from "@/app/welcome/actions";
import { cn } from "@/lib/format";
import type { ProKind } from "@/lib/kinds";

const CHOICES: { kind: ProKind; label: string }[] = [
  { kind: "agent", label: "Agent" },
  { kind: "investor", label: "Investor" },
  { kind: "lender", label: "Lender" },
];

// What a pro is, as the chip beside their name says: an agent, an investor
// (whose listings are deals), or a lender. Saved as it's tapped.
export function KindPicker({ kind }: { kind: ProKind }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(kind);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div role="radiogroup" aria-label="You are" className="flex flex-wrap gap-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.kind}
            type="button"
            role="radio"
            aria-checked={chosen === choice.kind}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const before = chosen;
                setChosen(choice.kind);
                const result = await chooseKind(choice.kind).catch(() => ({ ok: false as const, error: "That didn't save." }));
                if (!result.ok) {
                  setChosen(before);
                  return setError(result.error);
                }
                setError(null);
                router.refresh();
              })
            }
            className={cn(
              "flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1 transition-colors",
              chosen === choice.kind ? "bg-ink text-white ring-ink" : "bg-surface text-ink ring-stone-300 hover:ring-stone-500",
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
