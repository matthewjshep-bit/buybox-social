"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { saveHome } from "@/app/homes/actions";

// Which homes the viewer has saved, for a page of cards (Home, a profile), so
// every card's bookmark says so and can change it: at once, put back if it
// doesn't hold (signed out: on to signing in, and back here after).

type Saved = { has: (key: string) => boolean; toggle: (key: string) => void };

const SavedContext = createContext<Saved | null>(null);

export function SavedHomes({ keys, children }: { keys: string[]; children: ReactNode }) {
  const router = useRouter();
  const [now, setNow] = useState<Record<string, boolean>>({});
  const has = (key: string) => now[key] ?? keys.includes(key);
  const toggle = (key: string) => {
    const to = !has(key);
    setNow((was) => ({ ...was, [key]: to }));
    void saveHome(key, to).then((result) => {
      if (result.ok) return;
      setNow((was) => ({ ...was, [key]: !to }));
      if (/sign/i.test(result.error)) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
    });
  };
  return <SavedContext.Provider value={{ has, toggle }}>{children}</SavedContext.Provider>;
}

// (None: the page doesn't offer saving, and the cards show no bookmark.)
export const useSavedHomes = () => useContext(SavedContext);
