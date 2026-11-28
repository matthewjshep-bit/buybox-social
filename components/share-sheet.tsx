"use client";

import { Check, Link2, Megaphone, Send, Share, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type RefObject } from "react";
import { Sheet } from "@/components/sheet";
import { formatPrice } from "@/lib/format";
import { menuRow } from "@/lib/ui";

// The one way to share a home, from its paper plane wherever the home is (full
// screen, a card in a feed, a post): the same sheet for everyone, as a post's
// share is. Send it to someone or post it to your followers (both "Share
// homes", with this home picked: signed out, signing in comes first), copy its
// link, or hand it to the phone's own share sheet. On an agent's link, inviting
// someone onto the link is here too.

export type ShareHome = { key: string; address: string; price?: number | null; forSale: boolean };

export function ShareSheet({
  home,
  onClose,
  invite,
  linkable = true,
  anchor,
  returnTo,
}: {
  // The home to share (none: closed).
  home: ShareHome | null;
  onClose: () => void;
  // On an agent's link that can take someone else: invites them onto it.
  invite?: () => void;
  // Its public page can be passed on (not a home only on a private link).
  linkable?: boolean;
  anchor?: RefObject<HTMLElement | null>;
  returnTo?: () => HTMLElement | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  // (Its rows are only drawn once it's opened, in the browser.)
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const [was, setWas] = useState(home?.key);
  if (home?.key !== was) {
    setWas(home?.key);
    setCopied(false);
  }
  const url = () => (home ? `${window.location.origin}/homes/${encodeURIComponent(home.key)}` : "");
  const compose = (everyone: boolean) => {
    if (!home) return;
    onClose();
    router.push(`/send?${new URLSearchParams({ home: home.key, ...(everyone && { aud: "everyone" }) })}`);
  };
  const row = menuRow({ flush: true });
  return (
    <Sheet open={Boolean(home)} onClose={onClose} label="Share" title="Share" anchor={anchor} returnTo={returnTo}>
      {home && (
        <div className="flex flex-col">
          {home.forSale && (
            <>
              <button type="button" onClick={() => compose(false)} className={row}>
                <Send aria-hidden size={18} />
                Send to someone
              </button>
              <button type="button" onClick={() => compose(true)} className={row}>
                <Megaphone aria-hidden size={18} />
                Post to your followers
              </button>
            </>
          )}
          {invite && (
            <button
              type="button"
              onClick={() => {
                onClose();
                invite();
              }}
              className={row}
            >
              <UserPlus aria-hidden size={18} />
              Invite someone to this link
            </button>
          )}
          {linkable && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url());
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              // (Named here: words inside a status aren't part of a button's name.)
              aria-label={copied ? "Link copied" : "Copy link"}
              className={row}
            >
              {copied ? <Check aria-hidden size={18} /> : <Link2 aria-hidden size={18} />}
              <span role="status">{copied ? "Link copied" : "Copy link"}</span>
            </button>
          )}
          {linkable && native && (
            <button
              type="button"
              onClick={async () => {
                const title = `${home.address}${home.price ? ` · ${formatPrice(home.price)}` : ""}`;
                try {
                  await navigator.share({ title, url: url() });
                  onClose();
                } catch {
                  // (Put away without sharing: nothing to say.)
                }
              }}
              className={row}
            >
              <Share aria-hidden size={18} />
              Share via…
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
