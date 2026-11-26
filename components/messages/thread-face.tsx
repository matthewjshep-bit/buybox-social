import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Thread } from "@/lib/messages";

// Who a conversation is with, as a face: theirs, or, for a link to several
// people, two overlapping (the first in front), the same in the list and at
// the top of the conversation. Always the same square, one face or two, so
// the names beside it start on one line down the list. `size`: "row" (48px,
// in the list) or "header" (36px, over the conversation).
const BOX = {
  row: { box: "size-12", one: 10, two: 8 },
  header: { box: "size-9", one: 9, two: 6 },
} as const;

export function ThreadFace({ thread, size = "row", className }: { thread: Thread; size?: keyof typeof BOX; className?: string }) {
  const [first, second] = thread.people;
  const fit = BOX[size];
  const tone = (agent: boolean | undefined) => (agent ? "agent" : "person");
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center", fit.box, className)}>
      {thread.group && second ? (
        <>
          <Avatar
            name={second.name}
            photo={second.photo}
            tone={tone(second.agent)}
            size={fit.two}
            className="absolute right-0 top-0 ring-2 ring-white"
          />
          <Avatar
            name={first?.name ?? null}
            photo={first?.photo}
            tone={tone(first?.agent)}
            size={fit.two}
            className="absolute bottom-0 left-0 ring-2 ring-white"
          />
        </>
      ) : (
        <Avatar name={first?.name ?? null} photo={first?.photo} tone={tone(first?.agent)} size={fit.one} />
      )}
    </span>
  );
}
