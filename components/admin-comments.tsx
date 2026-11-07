import Link from "next/link";
import { deleteComment, hideSharedComment } from "@/app/admin/actions";
import { ConfirmAction } from "@/components/admin";
import { Empty } from "@/components/admin-ui";
import type { CommentRow } from "@/lib/admin";
import { timeAgo } from "@/lib/format";

// Comments as the public sees them, each with the way to take it down: delete
// one said on the site; hide one a buyer shared from a private chat (it stays
// in that chat, where their agent can still see it).
export function CommentList({ comments, showHome = true }: { comments: CommentRow[]; showHome?: boolean }) {
  if (comments.length === 0) return <Empty>No comments yet.</Empty>;
  return (
    <ul className="divide-y divide-stone-100">
      {comments.map((comment) => (
        <li key={`${comment.kind}:${comment.id}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {comment.accountId ? (
                <Link href={`/admin/people/${comment.accountId}`} className="font-semibold hit-44 hover:underline">
                  {comment.name}
                </Link>
              ) : (
                <span className="font-semibold">
                  {comment.name}{" "}
                  <span className="font-normal text-stone-500">{comment.kind === "shared" ? "(client)" : "(guest)"}</span>
                </span>
              )}
              {showHome && (
                <>
                  <span className="text-stone-500"> on </span>
                  <Link
                    href={`/admin/homes/${encodeURIComponent(comment.listing_key)}`}
                    className="font-medium hit-44 hover:underline"
                  >
                    {comment.address}
                  </Link>
                </>
              )}
              <span className="text-stone-500"> · {timeAgo(comment.at.toISOString())}</span>
            </p>
            {(comment.isReply || comment.kind === "shared") && (
              <p className="text-xs font-medium text-stone-500">
                {comment.kind === "shared"
                  ? "Shared from a private chat with an agent; shows without their name"
                  : "A reply"}
              </p>
            )}
            <p className="mt-1 whitespace-pre-line break-words text-[15px]">{comment.body}</p>
          </div>
          <div className="-ml-4 shrink-0 sm:ml-0">
            {comment.kind === "public" ? (
              <ConfirmAction
                action={deleteComment.bind(null, comment.id)}
                label="Delete"
                confirm={comment.isReply ? "Delete reply" : "Delete comment and its replies"}
              />
            ) : (
              <ConfirmAction action={hideSharedComment.bind(null, comment.id)} label="Hide from public" confirm="Hide it" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
