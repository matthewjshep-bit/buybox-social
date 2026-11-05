"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The full-screen feed pages draw their own header, floating over the photos.
const FULL_SCREEN = [/^\/$/, /^\/s\//, /^\/homes(\/|$)/];

export function HeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return FULL_SCREEN.some((pattern) => pattern.test(pathname)) ? null : children;
}
