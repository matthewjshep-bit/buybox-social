import { Heart, MessageCircle, ThumbsDown } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AspectSummary } from "@/components/aspect-summary";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import { getProfile, type ProfileHome } from "@/lib/profile";
import { getPublicIdentity } from "@/lib/public";
import { describeReaction } from "@/lib/reactions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS = { liked: "Liked", passed: "Passed", comments: "Comments" } as const;
type Tab = keyof typeof TABS;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getProfile((await params).id);
  return { title: profile ? `${profile.name} · BuyBox Social` : "Not found · BuyBox Social" };
}

// Someone's homes, Instagram-style: a grid of what they've liked (and passed
// on), and what they've said. Public activity only.
export default async function ProfilePage({ params, searchParams }: Props) {
  const { id } = await params;
  if (id.length > 64) notFound();
  const profile = await getProfile(id);
  if (!profile) notFound();
  const requested = (await searchParams).tab;
  const tab: Tab = typeof requested === "string" && requested in TABS ? (requested as Tab) : "liked";
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor } = await getPublicIdentity(account?.role ? account : null, device);
  const isMe = visitor?.id === profile.id;
  const counts = { liked: profile.liked.length, passed: profile.passed.length, comments: profile.comments.length };

  return (
    <main className="mx-auto max-w-3xl pb-16">
      <header className="flex items-center gap-5 px-4 pt-6 sm:px-6">
        <span
          aria-hidden
          className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand font-display text-3xl font-semibold text-white sm:size-24"
        >
          {profile.name[0]?.toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl">{isMe ? `${profile.name} (you)` : profile.name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-stone-700">
            <span>
              <strong className="tabular-nums">{counts.liked}</strong> liked
            </span>
            <span>
              <strong className="tabular-nums">{counts.passed}</strong> passed
            </span>
            <span>
              <strong className="tabular-nums">{counts.comments}</strong>{" "}
              {counts.comments === 1 ? "comment" : "comments"}
            </span>
          </p>
        </div>
      </header>

      {(profile.taste.loved.length > 0 || Object.keys(profile.taste.likes).length > 0) && (
        <section aria-label="Taste" className="mt-5 flex flex-col gap-2 px-4 sm:px-6">
          {profile.taste.loved.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="flex items-center gap-1 font-semibold text-rose-800">
                <Heart aria-hidden size={14} /> Loves
              </span>
              {profile.taste.loved.map(([tag, n]) => (
                <span
                  key={tag}
                  className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-900 ring-1 ring-rose-200"
                >
                  {tag} <span className="tabular-nums">{n}</span>
                </span>
              ))}
            </div>
          )}
          <AspectSummary
            liked={profile.taste.likes}
            disliked={profile.taste.passes}
            likeLabel="Likes"
            dislikeLabel="Passes on"
            limit={6}
          />
        </section>
      )}

      <nav aria-label="Their homes" className="mt-6 grid grid-cols-3 border-b border-stone-200">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link
            key={key}
            href={key === "liked" ? `/people/${profile.id}` : `/people/${profile.id}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            scroll={false}
            className={cn(
              "flex min-h-12 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold",
              tab === key ? "border-ink text-ink" : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {key === "liked" ? (
              <Heart aria-hidden size={15} />
            ) : key === "passed" ? (
              <ThumbsDown aria-hidden size={15} />
            ) : (
              <MessageCircle aria-hidden size={15} />
            )}
            {TABS[key]}
          </Link>
        ))}
      </nav>

      {tab === "comments" ? (
        profile.comments.length === 0 ? (
          <Empty>No comments yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-200">
            {profile.comments.map((comment) => (
              <li key={comment.id}>
                <Link
                  href={`/homes/${encodeURIComponent(comment.listing.ListingKey)}`}
                  className="flex gap-3 px-4 py-3 hover:bg-white sm:px-6"
                >
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                    {comment.listing.Media[0] && (
                      <Image src={comment.listing.Media[0].MediaURL} alt="" fill sizes="56px" className="object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 text-[15px] leading-snug">
                    <span className="block break-words">{comment.body}</span>
                    <span className="mt-0.5 block truncate text-xs text-stone-600">
                      {comment.isReply ? "Replied on" : "On"} {comment.listing.UnparsedAddress} ·{" "}
                      <time dateTime={comment.at}>{timeAgo(comment.at)}</time>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <HomeGrid homes={tab === "liked" ? profile.liked : profile.passed} passed={tab === "passed"} />
      )}
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-16 text-center text-stone-600">{children}</p>;
}

// Three across, like a profile grid. Each tile shows the photo of what they
// liked, and says what it was.
function HomeGrid({ homes, passed }: { homes: ProfileHome[]; passed: boolean }) {
  if (homes.length === 0) return <Empty>{passed ? "Nothing passed on yet." : "No likes yet."}</Empty>;
  return (
    <ul className="grid grid-cols-3 gap-0.5">
      {homes.map((home) => (
        <li key={home.listing.ListingKey}>
          <Link
            href={`/homes/${encodeURIComponent(home.listing.ListingKey)}`}
            aria-label={`${home.listing.UnparsedAddress}: ${describeReaction(home.state, home.tags)}`}
            className="group relative block aspect-square overflow-hidden bg-stone-200"
          >
            {home.cover && (
              <Image
                src={home.cover}
                alt=""
                fill
                sizes="(max-width: 768px) 33vw, 256px"
                className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-6 text-white">
              <span className="line-clamp-2 text-xs font-semibold leading-tight">
                {describeReaction(home.state, home.tags).replace(/^liked /, "")}
              </span>
              <span className="block text-[11px] tabular-nums opacity-85">{formatPrice(home.listing.ListPrice)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
