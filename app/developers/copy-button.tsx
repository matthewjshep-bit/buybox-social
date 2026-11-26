"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/format";
import { focusOnDark, pill } from "@/lib/ui";

// Copies a block of code, in its top corner: a fingertip round, grey on the
// dark until the pointer's on it; a tick for a couple of seconds once it's
// copied (said to a screen reader too).
export function CopyButton({ text, name }: { text: string; name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const wait = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(wait);
  }, [copied]);
  return (
    <>
      <button
        type="button"
        aria-label={name}
        onClick={() =>
          navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
        className={cn(
          pill("md", { icon: true }),
          "absolute right-1.5 top-1.5 bg-stone-900 text-stone-400 hover:bg-stone-800 hover:text-white",
          focusOnDark,
        )}
      >
        {copied ? <Check aria-hidden size={16} className="text-emerald-400" /> : <Copy aria-hidden size={16} />}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
