import { ChevronRight, Lock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { ago, street } from "@/components/client-status";
import { HomeThumb } from "@/components/ui";
import type { BetweenLink } from "@/lib/between";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What a link is, between the one looking and `first`: "3 homes Tom sent
// you", "You sent Jenny 2 homes", "You're both on Jordan's link".
function headlineOf(link: BetweenLink, first: string) {
  if (link.kind === "from") return `${plural(link.homes, "home")} ${first} sent you`;
  if (link.kind === "sent") return `You sent ${first} ${plural(link.homes, "home")}`;
  return `You're both on ${link.agentFirst}'s link`;
}

// "Nov 3 · 2 new", "Liked 2 of 3", in small words under it.
function metaOf(link: BetweenLink, first: string) {
  return [
    `Sent ${ago(link.sentAt)}`,
    link.kind === "together" && plural(link.homes, "home"),
    link.unrated > 0 && `${link.unrated} new`,
    link.kind !== "from" && link.theyLiked > 0 && `${first} liked ${link.theyLiked}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// At the top of someone's page, for whoever shares links with them: what's
// between the two of you, each link opening right where it's yours, with the
// last thing they said there. Only the one looking sees it, on this page.
export function BetweenCard({
  id,
  links,
  name,
  className,
}: {
  // The page shows it in one of two places, by screen width: each its own heading id.
  id: string;
  links: BetweenLink[];
  name: string;
  className?: string;
}) {
  const first = name.split(" ")[0] || name;
  return (
    <section aria-labelledby={id} className={cn(card, "p-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          Between you and {first}
        </h2>
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
          <Lock aria-hidden size={12} /> Only you see this
        </span>
      </div>
      <ul className="mt-2 flex flex-col">
        {links.map((link) => (
          <li key={link.shareId} className="border-t border-stone-200 first:border-t-0">
            <Link href={link.href} className="group -mx-2 flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-stone-50">
              <span aria-hidden className="flex shrink-0 -space-x-4 pt-0.5">
                {link.photos.map((photo, i) => (
                  <HomeThumb key={i} src={photo} sizes="56px" className="size-14 rounded-xl ring-2 ring-white" />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug group-hover:underline">{headlineOf(link, first)}</span>
                <span className="block text-meta text-muted">{metaOf(link, first)}</span>
                {link.said && (
                  <span className="mt-1.5 flex items-start gap-1.5 text-body leading-snug text-stone-800">
                    <MessageCircle aria-hidden size={14} className="mt-0.5 shrink-0 text-stone-500" />
                    <span className="line-clamp-2 min-w-0">
                      <strong className="font-semibold">{first}:</strong> “{link.said.body}”
                      <span className="text-meta text-muted">
                        {" "}
                        · {street(link.said.address)} · {ago(link.said.at)}
                      </span>
                    </span>
                  </span>
                )}
              </span>
              <ChevronRight aria-hidden size={18} className="mt-1 shrink-0 text-stone-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
