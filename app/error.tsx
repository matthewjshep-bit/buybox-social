"use client";

import { CloudOff, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { RouteState, routeAction } from "@/components/route-state";

// Something broke on our side while a page was being made. Trying again asks
// the server for it afresh; home is always there.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
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
  );
}
