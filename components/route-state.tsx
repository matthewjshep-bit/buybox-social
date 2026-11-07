import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

// A page that can't show what was asked for: what happened, in a line, and a
// way on from there.
export function RouteState({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center sm:py-24">
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-full bg-white text-stone-600 ring-1 ring-stone-200"
      >
        <Icon size={26} />
      </span>
      <h1 className="mt-5 text-balance font-display text-3xl">{title}</h1>
      <p className="mt-2 text-balance text-[17px] text-stone-700">{children}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">{actions}</div>
    </main>
  );
}

// The way on that most people want, and the other one beside it.
export const routeAction = {
  primary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-white hover:opacity-90",
  secondary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-semibold text-ink ring-1 ring-stone-300 hover:bg-stone-50",
};

// A grey shape where words or a photo will be, while the page loads. It
// breathes a couple of times, then holds still.
export function Placeholder({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-full bg-stone-200", className)} />;
}

// Said once to a screen reader while a page loads; the shapes say nothing.
export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="sr-only">
      {`Loading ${what}…`}
    </p>
  );
}
