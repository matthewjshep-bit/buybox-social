"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

// The full-screen feed pages draw their own header, floating over the photos.
// (An agent's link has their own header instead.)
const FULL_SCREEN = [/^\/$/, /^\/s\//, /^\/homes(\/|$)/];
const fullScreen = (pathname: string) => FULL_SCREEN.some((pattern) => pattern.test(pathname));
const agentLink = (pathname: string) => pathname.startsWith("/s/");

// The map runs edge to edge, and the header with it.
const WIDE = [/^\/search$/];

export function HeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (fullScreen(pathname)) return null;
  return (
    <div className="group/top contents" data-wide={WIDE.some((pattern) => pattern.test(pathname)) || undefined}>
      {children}
    </div>
  );
}

// On a feed page with nothing to show (a home that's gone, an address that
// isn't here), there's no feed to draw the header, so the page shows the
// site's own. Never on an agent's link: that's their space.
export function FullScreenOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return fullScreen(pathname) && !agentLink(pathname) ? children : null;
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
