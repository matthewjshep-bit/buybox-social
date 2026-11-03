"use client";

import { useEffect } from "react";
import { markActivitySeen } from "@/app/homes/actions";

// Clears the bell once the page has been seen.
export function MarkSeen() {
  useEffect(() => {
    markActivitySeen().catch(() => {});
  }, []);
  return null;
}
