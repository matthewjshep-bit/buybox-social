import { ChevronRight, ClipboardList, Heart, MessageCircle, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { HomeThumb } from "@/components/ui";
import type { ClientFeedback, FeedbackThing } from "@/lib/client-feedback";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// A client's feedback, rolled up, on their page: what they like and don't
// across every home their agent sent them (what they keep liking, what puts
// them off, what depends on the home), then each home with what they made
// of it, a tap from that home's own feedback. Only the agent ever sees it.
export function ClientFeedbackSection({ name, feedback }: { name: string; feedback: ClientFeedback }) {
  const answered = feedback.liked + feedback.passed;
  const things = feedback.likes.length + feedback.dislikes.length + feedback.mixed.length;
  return (
    <section id="feedback" aria-labelledby="feedback-title" className="mt-10 scroll-mt-4">
      <h2 id="feedback-title" className="flex items-center gap-2 font-display text-2xl">
        <ClipboardList aria-hidden size={22} className="text-stone-500" /> {name}&apos;s feedback
      </h2>
      <div className={cn(card, "mt-4 flex flex-col gap-5 p-5")}>
        <p className="text-body font-semibold text-stone-800">
          {answered === 0
            ? `${feedback.sent} ${feedback.sent === 1 ? "home" : "homes"} sent. What ${name} likes and doesn't shows here as they go through them.`
            : [`Liked ${feedback.liked} of ${feedback.sent}`, feedback.passed > 0 && `passed on ${feedback.passed}`]
                .filter(Boolean)
                .join(" · ")}
        </p>
        {things > 0 ? (
          <div className="flex flex-col gap-4">
            <Things title="Liked" side="like" things={feedback.likes} />
            <Things title="Didn't like" side="dislike" things={feedback.dislikes} />
            <Things title="Depends on the home" things={feedback.mixed.map((thing) => ({ thing, homes: 1 }))} />
          </div>
        ) : (
          answered > 0 && <p className="text-body text-muted">Nothing picked out yet.</p>
        )}

        {feedback.homes.length > 0 && (
          <section aria-labelledby="feedback-homes">
            <h3 id="feedback-homes" className="text-meta font-semibold text-muted">
              Home by home
            </h3>
            <ul className="mt-1 divide-y divide-stone-200">
              {feedback.homes.map((home) => {
                const said = [
                  home.likes.length > 0 && `Liked: ${home.likes.join(", ")}`,
                  home.dislikes.length > 0 && `Didn't like: ${home.dislikes.join(", ")}`,
                ].filter(Boolean);
                return (
                  <li key={home.key}>
                    <Link
                      href={home.href}
                      className="-mx-2 flex min-h-16 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-stone-50"
                    >
                      <HomeThumb src={home.photo ?? undefined} sizes="56px" className="size-14 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-body font-semibold">{home.address}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-meta text-stone-700">
                          {home.reaction === "like" && (
                            <span className="flex items-center gap-1 font-semibold text-rose-700">
                              <Heart aria-hidden size={13} className="fill-rose-600 text-rose-600" /> Liked
                            </span>
                          )}
                          {home.reaction === "dislike" && (
                            <span className="flex items-center gap-1 font-semibold text-amber-800">
                              <ThumbsDown aria-hidden size={13} /> Passed
                            </span>
                          )}
                          {!home.reaction && said.length === 0 && home.comments === 0 && <span className="text-muted">Nothing yet</span>}
                          {home.comments > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageCircle aria-hidden size={13} /> {home.comments}
                              <span className="sr-only">{home.comments === 1 ? "comment" : "comments"}</span>
                            </span>
                          )}
                        </span>
                        {said.map((line) => (
                          <span key={line as string} className="block text-meta leading-snug text-stone-700">
                            {line}
                          </span>
                        ))}
                      </span>
                      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

// "Likes": each thing, with how many homes when it's more than one.
function Things({ title, side, things }: { title: string; side?: "like" | "dislike"; things: FeedbackThing[] }) {
  if (things.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="flex items-center gap-1.5 text-meta font-semibold text-muted">
        {side === "like" && <Heart aria-hidden size={13} className="fill-rose-600 text-rose-600" />}
        {side === "dislike" && <ThumbsDown aria-hidden size={13} className="text-amber-700" />}
        {title}
      </h3>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {things.map(({ thing, homes }) => (
          <li
            key={thing}
            className={cn(
              "flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium",
              side === "like" ? "bg-rose-50 text-rose-900" : side === "dislike" ? "bg-amber-50 text-amber-900" : "bg-stone-100 text-stone-800",
            )}
          >
            {thing}
            {homes > 1 && (
              <span className="tabular-nums opacity-70">
                {homes}
                <span className="sr-only"> homes</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
