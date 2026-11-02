"use client";

import { useEffect } from "react";
import { recordView } from "@/app/homes/actions";

// Runs in the browser, so link-preview bots and prefetches don't count as views.
export function ViewTracker({ listingKey }: { listingKey: string }) {
  useEffect(() => {
    recordView(listingKey).catch(() => {});
  }, [listingKey]);
  return null;
}
