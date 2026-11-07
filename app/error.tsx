"use client";

import { CloudOff, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { FullScreenOnly } from "@/components/header-gate";
import { LogoHeader, RouteState, routeAction } from "@/components/route-state";

// Something broke on our side while a page was being made. Trying again asks
// the server for it afresh; home is always there. The tab says so too, not
// the name of the page that broke.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <title>Something went wrong · BuyBox Social</title>
      {/* On a feed page, the feed drew the header; with it gone, the logo at least. */}
      <FullScreenOnly>
        <LogoHeader />
      </FullScreenOnly>
      <RouteState
        icon={CloudOff}
        title="Something went wrong"
        actions={
          <>
            <button type="button" onClick={() => retry()} className={routeAction.primary}>
              <RotateCcw aria-hidden size={18} />
              Try again
            </button>
            <Link href="/" className={routeAction.secondary}>
              <Home aria-hidden size={18} />
              Go home
            </Link>
          </>
        }
      >
        This page didn&apos;t load. Try again in a moment.
      </RouteState>
    </>
  );
}
