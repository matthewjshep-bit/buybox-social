"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/format";
import { button } from "@/lib/ui";

// Copies a client's link, whole, to paste into a text or an email; says so
// once it has. `name`: who it's for, for a screen reader.
export function CopyLink({ path, name, className }: { path: string; name: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
          setFailed(false);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setFailed(true);
        }
      }}
      className={cn(button({ kind: "secondary", size: "lg" }), className)}
    >
      {copied ? <Check aria-hidden size={18} className="text-emerald-700" /> : <Copy aria-hidden size={18} />}
      <span aria-live="polite">{copied ? "Copied" : failed ? "Couldn't copy" : "Copy link"}</span>
      <span className="sr-only"> for {name}</span>
    </button>
  );
}
