import type { TimelineComment } from "./timeline";

// The order comments read in under a card in a feed, as LinkedIn's "Most
// relevant" has it: the ones with something to them first. A comment
// someone answered or liked, an agent's, one from someone the viewer
// follows, or one about a spot in a photo ("the front door") leads; the
// more of that, the higher. Among equals, the newest first. Comments with
// nothing to them (no answers, no likes, nobody in particular, nothing in
// particular) come after, newest first.

// How many comments a feed card shows at first, and how many more each
// "See more" adds.
export const FEED_FIRST = 3;
export const FEED_MORE = 5;

export function relevance(comment: TimelineComment, replies: number): number {
  return (
    (comment.isAgent ? 4 : 0) +
    (comment.followed ? 3 : 0) +
    (comment.spot ? 2 : 0) +
    Math.min(replies, 3) * 2 +
    Math.min(comment.likes, 5)
  );
}

export function rankComments(comments: TimelineComment[], repliesTo: (id: string) => number): TimelineComment[] {
  const score = new Map(comments.map((comment) => [comment.id, relevance(comment, repliesTo(comment.id))]));
  return [...comments].sort((a, b) => score.get(b.id)! - score.get(a.id)! || b.at.localeCompare(a.at));
}
