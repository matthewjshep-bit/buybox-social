import Link from "next/link";
import type { ReactNode } from "react";
import { BannerArt } from "@/components/banner-art";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// Everyone's home, laid out the same way: who you are and where you go, down
// the left (from a tablet up); the feed in the middle; what's beside it (an
// agent's clients, people worth following) down the right on a wide screen.
// Both sides stay put while the feed scrolls.

export type RailLink = { href: string; label: string; icon: ReactNode };
export type RailStat = { href: string; label: string; value: number };

// The left side: a card that's them (a band of colour, their face, their name
// to their own page, a line about them, a few numbers), and their places.
export function ProfileRail({
  name,
  photo,
  agent,
  line,
  href,
  stats,
  links,
  bandColor = null,
  seed,
}: {
  name: string;
  photo: string | null;
  agent: boolean;
  line: string;
  // Their own page.
  href: string;
  stats: RailStat[];
  links: RailLink[];
  // The band at the top is their own little scene, picked by `seed` (their
  // page's id), as on their page; an agent's in their colour (`bandColor`).
  bandColor?: string | null;
  seed: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="You" className={cn(card, "overflow-hidden")}>
        <div aria-hidden className="h-14 overflow-hidden">
          <BannerArt seed={seed} brand={agent ? bandColor : null} />
        </div>
        <div className="-mt-9 flex flex-col items-center px-4 pb-4 text-center">
          <Avatar name={name} tone={agent ? "agent" : "person"} photo={photo} size={18} className="ring-4 ring-white" />
          <Link href={href} className="mt-2 text-lg font-semibold leading-tight underline-offset-2 hover:underline">
            {name}
          </Link>
          <p className="mt-0.5 text-meta text-muted">{line}</p>
        </div>
        {stats.length > 0 && (
          <ul className="border-t border-stone-200 py-1.5">
            {stats.map((stat) => (
              <li key={stat.label}>
                <Link
                  href={stat.href}
                  className="flex min-h-9 items-center justify-between px-4 text-meta hover:bg-stone-50"
                >
                  <span className="text-stone-700">{stat.label}</span>
                  <span className="font-semibold tabular-nums text-brand">{stat.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <nav aria-label="Your places" className={cn(card, "py-1.5")}>
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex min-h-11 items-center gap-3 px-4 text-body font-medium hover:bg-stone-50"
              >
                <span aria-hidden className="text-stone-500">
                  {link.icon}
                </span>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function HomeShell({
  title,
  subtitle,
  left,
  right,
  children,
}: {
  // The page's heading: for a screen reader only, unless there's a line under
  // it (`subtitle`), when both show at the top of the feed.
  title: string;
  subtitle?: string;
  left: ReactNode;
  right: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-[1140px] grid-cols-1 gap-6 px-4 pb-16 pt-3 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,560px)_300px] lg:justify-center lg:pt-5">
      {!subtitle && <h1 className="sr-only">{title}</h1>}
      <aside aria-label="Your profile" className="hidden md:sticky md:top-5 md:block md:self-start">
        {left}
      </aside>
      <div className="flex min-w-0 flex-col gap-5">
        {subtitle && (
          <div className="px-1">
            <h1 className="font-display text-3xl leading-tight">{title}</h1>
            <p className="mt-1 text-body text-stone-600">{subtitle}</p>
          </div>
        )}
        {children}
      </div>
      <aside aria-label="Beside your feed" className="hidden flex-col gap-4 lg:sticky lg:top-5 lg:flex lg:self-start">
        {right}
      </aside>
    </main>
  );
}
