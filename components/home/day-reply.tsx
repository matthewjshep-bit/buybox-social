"use client";

import { replyAsAgent } from "@/app/dashboard/actions";
import { InlineBox } from "./inline-box";

// Under a client's card, as Facebook has it: the agent's own face, and a box
// right there to answer them in ("Reply to Ben…"), into that home's
// conversation on their link, whatever they did. Enter sends (Shift+Enter is
// a new line). Once sent, the reply joins the ones above it. When what they
// said is waiting on the agent, the box is ringed in amber.
export function InlineReply({
  me,
  reply,
  waiting,
}: {
  me: { name: string; photo: string | null };
  reply: { shareId: string; listingKey: string; name: string; to: string };
  waiting: boolean;
}) {
  return (
    <InlineBox
      me={me}
      agent
      className="mt-2"
      placeholder={`Reply to ${reply.name}…`}
      label={`Reply to ${reply.name}`}
      sendLabel={["Send", "Sending"]}
      sent={`Sent to ${reply.name}`}
      ring={waiting}
      onSend={async (text) => (await replyAsAgent(reply.shareId, reply.listingKey, text, reply.to)).error ?? null}
    />
  );
}
