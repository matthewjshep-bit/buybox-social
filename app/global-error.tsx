"use client";

import { CloudOff, Home, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { RouteState, routeAction } from "@/components/route-state";
import { fontVariables } from "./fonts";
import "./globals.css";

// When even the frame around every page breaks (the header, say), this takes
// the whole page. Home is a full reload, starting clean.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className={`${fontVariables} antialiased`}>
      <body className="min-h-dvh font-sans">
        <title>Something went wrong · Porchcard</title>
        <RouteState
          icon={CloudOff}
          title="Something went wrong"
          actions={
            <>
              <button type="button" onClick={() => retry()} className={routeAction.primary}>
                <RotateCcw aria-hidden size={18} />
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload, past whatever broke */}
              <a href="/" className={routeAction.secondary}>
                <Home aria-hidden size={18} />
                Go home
              </a>
            </>
          }
        >
          This page didn&apos;t load. Try again in a moment.
        </RouteState>
      </body>
    </html>
  );
}
