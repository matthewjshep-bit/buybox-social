"use client";

import { CloudOff, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { RouteState, routeAction } from "@/components/route-state";

// A link that broke while it was being made. Trying again is the only way on
// offered: anywhere else would take a client out of their agent's space.
export default function ShareError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <title>Something went wrong</title>
      <RouteState
        icon={CloudOff}
        title="Something went wrong"
        actions={
          <button type="button" onClick={() => retry()} className={routeAction.primary}>
            <RotateCcw aria-hidden size={18} />
            Try again
          </button>
        }
      >
        This link didn&apos;t load. Try again in a moment.
      </RouteState>
    </>
  );
}
