"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

// The full-screen feed pages draw their own header, floating over the photos.
const FULL_SCREEN = [/^\/$/, /^\/s\//, /^\/homes(\/|$)/];

export function HeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return FULL_SCREEN.some((pattern) => pattern.test(pathname)) ? null : children;
}

// An agent's own colour on their dashboard: the header's logo as well as the
// page, so the whole screen is theirs. Anywhere else, the site's.
export function BrandScope({ brand, children }: { brand: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const theirs = brand && /^\/dashboard(\/|$)/.test(pathname);
  return (
    <div className="contents" style={theirs ? ({ "--brand": brand } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}
