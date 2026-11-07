"use client";

import { Heart, SlidersHorizontal, ThumbsDown } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { showPasses, showTasteChip } from "@/app/people/[id]/actions";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/format";
import type { TasteChip } from "@/lib/taste-story";

const keyOf = (chip: TasteChip) => chip.key.toLowerCase();

// The rows as they were when the sheet opened, with what's changed since:
// counts and switches update, but nothing moves under a finger while it's
// open. Anything new goes at the end.
function steady(now: TasteChip[], then: TasteChip[] | undefined) {
  if (!then) return now;
  const latest = new Map(now.map((chip) => [keyOf(chip), chip]));
  const kept = new Set(then.map(keyOf));
  return [...then.map((chip) => latest.get(keyOf(chip)) ?? chip), ...now.filter((chip) => !kept.has(keyOf(chip)))];
}

// "Not quite right?" on your own taste: a switch for each thing it says you
// love or pass on, and one for whether your page shows what you pass on.
// Switching a thing off takes it out of your taste and its description for
// everyone else; you still see it, marked as only yours.
export function TasteControls({ loves, passes, hidePasses }: { loves: TasteChip[]; passes: TasteChip[]; hidePasses: boolean }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState<{ loves: TasteChip[]; passes: TasteChip[] } | null>(null);
  const [hidden, setHidden] = useState(
    () => new Set([...loves, ...passes].filter((chip) => chip.hidden).map(keyOf)),
  );
  const [passesShown, setPassesShown] = useState(!hidePasses);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggleChip = (chip: TasteChip, shown: boolean) => {
    const key = keyOf(chip);
    // Only this one switch moves, and only this one goes back if it doesn't save.
    const set = (show: boolean) =>
      setHidden((now) => {
        const next = new Set(now);
        if (show) next.delete(key);
        else next.add(key);
        return next;
      });
    set(shown);
    setError(null);
    startTransition(async () => {
      const result = await showTasteChip(chip.key, shown);
      if (!result.ok) {
        set(!shown);
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

  const close = () => {
    setOpen(false);
    setOpened(null);
  };

  return (
    <>
      <div className="-mb-2 mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setOpened({ loves, passes });
            setOpen(true);
          }}
          className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-body font-semibold text-stone-700 underline decoration-stone-400 underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          <SlidersHorizontal aria-hidden size={14} className="shrink-0" />
          Not quite right?
        </button>
      </div>
      <Sheet open={open} onClose={close} label="What others see" title="What others see">
        <p className="text-body leading-snug text-stone-700">
          Turn off anything that isn&apos;t you. Others won&apos;t see it in your taste, and the description leaves it
          out. You&apos;ll still see it.
        </p>
        <ChipSwitches side="like" chips={steady(loves, opened?.loves)} hidden={hidden} onToggle={toggleChip} />
        <div className="mt-5">
          <h3 className="flex items-center gap-1.5 text-meta font-semibold text-amber-800">
            <ThumbsDown aria-hidden size={14} />
            Passes on
          </h3>
          <SwitchRow
            label="Show what I pass on, on my page"
            hint="Your passes, what you didn't like and the Passed filter. A home's own page still shows who passed on it."
            on={passesShown}
            onChange={togglePasses}
          />
          <ChipSwitches
            side="pass"
            chips={steady(passes, opened?.passes)}
            hidden={hidden}
            onToggle={toggleChip}
            off={passesShown ? null : "Hidden with your passes"}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-meta font-semibold text-amber-800">
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
  off = null,
}: {
  side: "like" | "pass";
  chips: TasteChip[];
  hidden: Set<string>;
  onToggle: (chip: TasteChip, shown: boolean) => void;
  // Why these can't be switched just now, when they're all off together.
  off?: string | null;
}) {
  if (chips.length === 0) return null;
  const list = (
    <ul aria-label={side === "like" ? "Loves" : "Passes on"} className={cn(side === "pass" && "mt-1")}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <SwitchRow
            label={`Show ${chip.label} in my taste`}
            title={chip.label}
            hint={`${chip.homes} ${chip.homes === 1 ? "home" : "homes"}${off ? ` · ${off}` : ""}`}
            // Off along with the rest while they're all hidden; each keeps
            // its own setting for when they're shown again.
            on={!off && !hidden.has(keyOf(chip))}
            onChange={(shown) => onToggle(chip, shown)}
            disabled={Boolean(off)}
          />
        </li>
      ))}
    </ul>
  );
  if (side === "pass") return list;
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-1.5 text-meta font-semibold text-rose-800">
        <Heart aria-hidden size={14} className="fill-current" />
        Loves
      </h3>
      {list}
    </div>
  );
}

// One line with a switch on the right: a real switch, named for what it
// does, with what it covers read out with it.
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
  const hintId = useId();
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-stone-100">
      <div className="min-w-0 py-2">
        <p className={cn("break-words text-body font-semibold", disabled ? "text-muted" : "text-ink")}>
          {title ?? label}
        </p>
        {hint && (
          <p id={hintId} className="text-meta text-muted">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className="flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {/* Off is a track dark enough to see against the sheet, with the knob on the left. */}
        <span
          aria-hidden
          className={cn("relative h-7 w-11 rounded-full transition-colors", on ? "bg-brand" : "bg-stone-500")}
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
