"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

export function InviteButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const url = `${window.location.origin}/s/${token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Take a look at this home with me", url });
      } catch {
        // Closing the share sheet isn't an error.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Icon = copied ? Check : Share2;
  return (
    <button
      type="button"
      onClick={invite}
      className="mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-brand px-5 font-semibold text-brand"
    >
      <Icon aria-hidden size={16} />
      {copied ? "Link copied" : "Invite someone"}
    </button>
  );
}
