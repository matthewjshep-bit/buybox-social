"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether someone is signed in, for anything on the page that asks before
// letting them like or say something. Set by the root layout, so a refresh
// after signing in (on the page they're on) updates it everywhere.
const Session = createContext(false);

export function SessionProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return <Session.Provider value={signedIn}>{children}</Session.Provider>;
}

export const useSignedIn = () => useContext(Session);
