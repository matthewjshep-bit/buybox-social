import { Map as MapIcon, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { StoryTasteCard, TasteCard } from "@/components/taste-card";
import type { Account } from "@/lib/auth";
import type { Taste } from "@/lib/taste";

// The last screen of the feed, once there are no more homes to show.
export function FeedEnd({
  taste,
  account,
  visitorId = null,
}: {
  taste: Taste | null;
  account: Account | null;
  // Whose taste it is, to tell it as their own page does.
  visitorId?: string | null;
}) {
  return (
    <div className="w-full max-w-md">
      <h2 className="font-display text-3xl">You&apos;ve seen every home for now</h2>
      <p className="mt-2 text-white/80">New listings show up here first. Your likes keep shaping what comes next.</p>
      {/* The page doesn't wait for your story: it's a long way down. */}
      <Suspense fallback={<TasteCard taste={taste} className="mt-6 text-left text-ink" />}>
        <StoryTasteCard taste={taste} visitorId={visitorId} className="mt-6 text-left text-ink" />
      </Suspense>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/search"
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-5 font-semibold text-ink"
        >
          <MapIcon aria-hidden size={17} /> Explore the map
        </Link>
        {account?.role === "agent" && (
          <Link
            href="/dashboard/new"
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-5 font-semibold text-white"
          >
            <Plus aria-hidden size={17} /> New link
          </Link>
        )}
        {!account && (
          <>
            <Link href="/login" className="flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white">
              Sign up free
            </Link>
            <Link href="/for-agents" className="flex min-h-11 items-center px-3 font-semibold text-white underline-offset-2 hover:underline">
              For agents
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
