"use client";

import { Heart, ThumbsDown } from "lucide-react";
import { useState, useTransition } from "react";
import { showPasses, showTasteChip } from "@/app/people/[id]/actions";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/format";
import type { TasteChip } from "@/lib/taste-story";

// "Not quite right?" on your own taste: a switch for each thing it says you
// love or pass on, and one for whether anyone else sees what you pass on.
// Switching something off takes it off your page for everyone else and out
// of the description; you still see it, marked as only yours.
export function TasteControls({ loves, passes, hidePasses }: { loves: TasteChip[]; passes: TasteChip[]; hidePasses: boolean }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(
    () => new Set([...loves, ...passes].filter((chip) => chip.hidden).map((chip) => chip.key.toLowerCase())),
  );
  const [passesShown, setPassesShown] = useState(!hidePasses);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggleChip = (chip: TasteChip, shown: boolean) => {
    const key = chip.key.toLowerCase();
    const next = new Set(hidden);
    if (shown) next.delete(key);
    else next.add(key);
    setHidden(next);
    setError(null);
    startTransition(async () => {
      const result = await showTasteChip(chip.key, shown);
      if (!result.ok) {
        setHidden(hidden);
        setError("Couldn't save that. Try again.");
      }
    });
  };

  const togglePasses = (shown: boolean) => {
    setPassesShown(shown);
    setError(null);
    startTransition(async () => {
      const result = await showPasses(shown);
      if (!result.ok) {
        setPassesShown(!shown);
        setError("Couldn't save that. Try again.");
      }
    });
  };

  return (
    <>
      <div className="-mb-2 mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mr-2 min-h-11 rounded-full px-2 text-[13px] font-semibold text-stone-600 underline-offset-2 hover:text-ink hover:underline"
        >
          Not quite right?
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} label="Your taste" title="What others see">
        <p className="text-[15px] leading-snug text-stone-700">
          Turn off anything that isn&apos;t you. It comes off your page for everyone else, and the description leaves it
          out. You&apos;ll still see it.
        </p>
        <ChipSwitches
          side="like"
          chips={loves}
          hidden={hidden}
          onToggle={toggleChip}
        />
        <div className="mt-5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
            <ThumbsDown aria-hidden size={14} />
            Passes on
          </h3>
          <SwitchRow
            label="Show what I pass on to others"
            hint="Your passes, what you didn't like, and the Passed filter"
            on={passesShown}
            onChange={togglePasses}
          />
          {passes.length > 0 && (
            <ChipSwitches side="pass" chips={passes} hidden={hidden} onToggle={toggleChip} disabled={!passesShown} />
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[13px] font-semibold text-amber-800">
            {error}
          </p>
        )}
      </Sheet>
    </>
  );
}

function ChipSwitches({
  side,
  chips,
  hidden,
  onToggle,
  disabled = false,
}: {
  side: "like" | "pass";
  chips: TasteChip[];
  hidden: Set<string>;
  onToggle: (chip: TasteChip, shown: boolean) => void;
  disabled?: boolean;
}) {
  if (chips.length === 0) return null;
  const list = (
    <ul aria-label={side === "like" ? "Loves" : "Passes on"} className={cn(side === "pass" && "mt-1")}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <SwitchRow
            label={`Show ${chip.label} on my profile`}
            title={chip.label}
            hint={`${chip.homes} ${chip.homes === 1 ? "home" : "homes"}`}
            on={!hidden.has(chip.key.toLowerCase())}
            onChange={(shown) => onToggle(chip, shown)}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  );
  if (side === "pass") return list;
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-rose-800">
        <Heart aria-hidden size={14} className="fill-current" />
        Loves
      </h3>
      {list}
    </div>
  );
}

// One line with a switch on the right: a real switch, named for what it does.
function SwitchRow({
  label,
  title,
  hint,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  title?: string;
  hint?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-3 border-b border-stone-100", disabled && "opacity-50")}>
      <div className="min-w-0 py-2">
        <p className="break-words text-[15px] font-semibold text-ink">{title ?? label}</p>
        {hint && <p className="text-[13px] text-stone-600">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className="flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
      >
        <span
          aria-hidden
          className={cn("relative h-7 w-11 rounded-full transition-colors", on ? "bg-brand" : "bg-stone-300")}
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform",
              on && "translate-x-4",
            )}
          />
        </span>
      </button>
    </div>
  );
}
